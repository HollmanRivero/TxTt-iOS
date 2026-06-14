import { supabase } from "./supabase";

// ── ICE servers ───────────────────────────────────────────────────────────────
// Primaert: Cloudflare Realtime TURN, hentet server-side via Supabase Edge
// Function "turn-credentials" (holder TURN-noekkelen HEMMELIG - den skal ALDRI
// ligge i frontend-bundlen). Fallback: gratis STUN + Open Relay hvis Edge
// Function-en mangler secrets eller feiler.

const FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  // Open Relay (kan vaere blokkert/overbelastet i visse nettverk)
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

let _cachedIceServers = null;
let _cachedAt = 0;

// Henter ICE-servere fra Cloudflare via "turn-credentials"-Edge Function.
// Funksjonen leser CF_TURN_KEY_ID + CF_TURN_API_TOKEN fra Supabase-secrets og
// returnerer Cloudflare sitt { iceServers: [...] }. Cacher i 1 time (credentials
// varer 24t server-side). Faller tilbake til gratis STUN/Open Relay hvis
// funksjonen mangler secrets eller feiler.
async function getIceServers() {
  if (_cachedIceServers && Date.now() - _cachedAt < 3600000) return _cachedIceServers;
  try {
    const { data, error } = await supabase.functions.invoke("turn-credentials");
    if (error) throw error;
    const cfServers = data?.iceServers;
    if (!Array.isArray(cfServers) || cfServers.length === 0) {
      throw new Error("turn-credentials ga ingen iceServers: " + JSON.stringify(data));
    }
    // Cloudflare TURN foerst (paalitelig relay), gratis-pool bak som ekstra sikkerhet.
    const merged = [...cfServers, ...FALLBACK_ICE_SERVERS];
    _cachedIceServers = merged;
    _cachedAt = Date.now();
    console.log("[WebRTC] ICE-servere hentet fra Cloudflare turn-credentials:",
      cfServers.length, "server-grupper");
    return merged;
  } catch (err) {
    console.warn("[WebRTC] turn-credentials feilet, bruker fallback:", err?.message ?? err);
    return FALLBACK_ICE_SERVERS;
  }
}

/**
 * CallSession manages one WebRTC call.
 * Signaling (offer/answer/ICE) is exchanged over a Supabase Realtime channel
 * keyed by conversationId.
 */
export class CallSession {
  constructor({ conversationId, userId, isVideo, onRemoteStream, onStateChange }) {
    this.conversationId = conversationId;
    this.userId = userId;
    this.isVideo = isVideo;
    this.onRemoteStream = onRemoteStream;
    this.onStateChange = onStateChange;

    this.pc = null;
    this.localStream = null;
    this.channel = null;
    this.isCaller = false;
    this.facingMode = "user";         // "user" = front, "environment" = bak
    this.lastOffer = null;            // lagres saa caller kan re-sende ved "ready"
    this.pendingIceCandidates = [];   // buffer INNKOMMENDE ICE foer remote description er satt
    this.pendingOutgoingIce = [];     // buffer caller sine EGNE ICE til callee er paa kanalen
    this.remotePeerReady = false;     // settes naar callee har meldt "ready"
    this.localTracksAdded = false;     // true naar getUserMedia + addTrack er ferdig
    this._lastHandledOfferSdp = null;  // dedup av re-sendte offers
  }

  // ── Set up the peer connection ──────────────────────────────
  async _createPeerConnection() {
    const iceServers = await getIceServers();
    this.pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });

    // Send our ICE candidates to the other peer
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const type = event.candidate.type; // host | srflx | relay
        // Caller abonnerer paa signaling-kanalen FOER callee. Kandidater sendt
        // foer callee er paa kanalen gaar tapt (broadcast har ingen retention),
        // saa callee faar aldri caller sin relay-kandidat -> ICE finner aldri et
        // par -> "failed". Vi buffrer derfor caller sine kandidater til callee
        // har meldt "ready", og sender dem da samlet (_flushOutgoingIce).
        if (this.isCaller && !this.remotePeerReady) {
          this.pendingOutgoingIce.push(event.candidate);
          console.log("[WebRTC] buffer UTGAAENDE ICE (callee ikke klar) type:", type,
            "| buffer:", this.pendingOutgoingIce.length);
        } else {
          console.log("[WebRTC] genererte ICE-kandidat type:", type);
          this._signal("ice-candidate", { candidate: event.candidate });
        }
      } else {
        console.log("[WebRTC] ICE-gathering ferdig (null candidate)");
      }
    };

    // Receive the remote stream - kall onRemoteStream for HVER track (audio+video).
    // Ikke dedupe: et video-element plukker ikke alltid opp en track som legges
    // til etter at srcObject ble satt, saa vi re-setter srcObject per track.
    this.pc.ontrack = (event) => {
      const stream = event.streams[0];
      console.log("[WebRTC] ontrack - mottok track:", event.track.kind,
        "stream tracks:", stream.getTracks().map((t) => t.kind).join(","));
      this.onRemoteStream?.(stream);
    };

    // Track connection state - ikke hangup paa "disconnected" siden det
    // ofte er transient og recoverer av seg selv. Bare "failed" og "closed"
    // er endelige. Vent 8 sek paa failed for aa gi ICE en sjanse til aa
    // restarte forbindelsen via TURN.
    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      console.log("[WebRTC] connectionState ->", state);
      this.onStateChange?.(state);

      if (state === "failed") {
        console.warn("[WebRTC] connection failed - forsoeker ICE-restart i stedet for hangup");
        // Prov aa restarte ICE - kan finne ny rute via TURN
        try {
          this.pc.restartIce?.();
        } catch (e) {
          console.error("[WebRTC] restartIce feilet:", e);
        }
        // Hangup som siste utvei etter 8 sekunder hvis fortsatt failed
        setTimeout(() => {
          if (this.pc?.connectionState === "failed") {
            console.warn("[WebRTC] connection er fortsatt failed etter 8s - hangup");
            this.hangup("connection_failed_8s");
          }
        }, 8000);
      } else if (state === "closed") {
        this.hangup("connection_closed");
      }
    };

    // Mer detaljert ICE-tilstand
    this.pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] iceConnectionState ->", this.pc.iceConnectionState);
    };
    this.pc.onicegatheringstatechange = () => {
      console.log("[WebRTC] iceGatheringState ->", this.pc.iceGatheringState);
    };

    // Get local audio/video
    // Eksplisitte audio-constraints for aa unngaa feedback-loop:
    //  - echoCancellation: fjerner andres lyd fra mikrofonen
    //  - noiseSuppression: filtrerer bakgrunnsstoy
    //  - autoGainControl: normaliserer volum
    // Browsers har dette PAA som standard, men noen ganger ikke. Eksplisitt = trygg.
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      // facingMode er en "myk" constraint: paa mobil velger den front/bak,
      // paa desktop (kun ett kamera) ignoreres den trygt.
      video: this.isVideo ? { facingMode: this.facingMode } : false,
    });
    // Samtalen kan ha blitt lagt paa (hangup -> this.pc = null) mens getUserMedia
    // ventet - f.eks. ved unmount (React StrictMode i dev). Avbryt rolig i stedet
    // for aa krasje paa addTrack.
    if (!this.pc) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
      return null;
    }
    this.localStream.getTracks().forEach((track) => {
      this.pc.addTrack(track, this.localStream);
    });
    this.localTracksAdded = true;

    return this.localStream;
  }

  // ── Signaling helper ────────────────────────────────────────
  _signal(type, payload) {
    this.channel?.send({
      type: "broadcast",
      event: "signal",
      payload: { type, from: this.userId, ...payload },
    });
  }

  // ── Subscribe to signaling channel ──────────────────────────
  _subscribeSignaling() {
    this.channel = supabase.channel(`call:${this.conversationId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      // Ignore our own messages
      if (payload.from === this.userId) return;
      console.log("[WebRTC] mottok signal:", payload.type);

      switch (payload.type) {
        case "ready":
          // Callee er naa paa signaling-kanalen.
          this.remotePeerReady = true;
          // Re-send offer KUN hvis vi fortsatt venter paa svar (have-local-offer).
          // Ellers er vi allerede koblet, og en ny offer-runde ville kastet
          // "wrong state: stable".
          if (this.isCaller && this.lastOffer &&
              this.pc?.signalingState === "have-local-offer") {
            console.log("[WebRTC] caller mottok 'ready' -> re-sender offer");
            this._signal("offer", { offer: this.lastOffer });
          }
          // Tom bufferen av utgaaende ICE saa callee garantert faar caller sine
          // kandidater (inkl. relay) - dette er det som faktisk lar ICE koble.
          this._flushOutgoingIce();
          break;
        case "offer":
          await this._handleOffer(payload.offer);
          break;
        case "answer":
          await this._handleAnswer(payload.answer);
          break;
        case "ice-candidate":
          await this._handleIceCandidate(payload.candidate);
          break;
        case "hangup":
          console.warn("[WebRTC] mottok hangup-signal fra peer. Aarsak fra peer:", payload.reason);
          this.hangup("remote_hangup");
          break;
      }
    });

    return new Promise((resolve) => {
      this.channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });
  }

  // ── Caller: start the call ──────────────────────────────────
  async startCall() {
    this.isCaller = true;
    await this._subscribeSignaling();
    const localStream = await this._createPeerConnection();
    if (!this.pc) return null; // samtalen ble avbrutt under oppsett (unmount)

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.lastOffer = offer;
    console.log("[WebRTC] caller sender offer (forste gang)");
    this._signal("offer", { offer });

    return localStream;
  }

  // ── Callee: answer the call ─────────────────────────────────
  async answerCall() {
    this.isCaller = false;
    await this._subscribeSignaling();
    const localStream = await this._createPeerConnection();
    if (!this.pc) return null; // samtalen ble avbrutt under oppsett (unmount)

    // Fortell caller at vi er paa kanalen og klar til aa motta offer
    console.log("[WebRTC] callee sender 'ready' for aa be om offer");
    this._signal("ready", {});

    return localStream;
  }

  // ── Vent til lokale tracks er lagt til (getUserMedia kan vaere treg) ──
  async _ensureLocalTracks(timeoutMs = 5000) {
    const start = Date.now();
    while (!this.localTracksAdded && this.pc && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // ── Handle incoming offer (callee side) ─────────────────────
  async _handleOffer(offer) {
    if (this._lastHandledOfferSdp === offer.sdp) {
      console.log("[WebRTC] ignorerer duplikat-offer (samme SDP)");
      return;
    }
    if (!this.pc) await this._createPeerConnection();
    // Ikke lag svaret foer vaare egne tracks er lagt til. Ankommer offeren mens
    // getUserMedia fortsatt kjorer, ville vi ellers svart UTEN egne media ->
    // caller faar ingen ontrack (svart bilde / ingen lyd).
    await this._ensureLocalTracks();
    if (!this.pc) return; // avbrutt (hangup/unmount) under venting
    this._lastHandledOfferSdp = offer.sdp;
    console.log("[WebRTC] callee handler offer -> setRemoteDescription");
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this._flushPendingIce();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    console.log("[WebRTC] callee sender answer");
    this._signal("answer", { answer });
  }

  // ── Handle incoming answer (caller side) ────────────────────
  async _handleAnswer(answer) {
    // Gyldig kun naar vi venter paa svar (have-local-offer). Duplikat-answer fra
    // en re-sendt offer ankommer ofte etter at vi er stabile -> setRemoteDescription
    // ville da kastet "wrong state: stable". Ignorer trygt.
    if (!this.pc || this.pc.signalingState !== "have-local-offer") {
      console.warn("[WebRTC] ignorerer answer i tilstand:", this.pc?.signalingState);
      return;
    }
    console.log("[WebRTC] caller mottok answer -> setRemoteDescription");
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this._flushPendingIce();
  }

  // ── Send caller sine bufrede utgaaende ICE naar callee er klar ──
  _flushOutgoingIce() {
    if (this.pendingOutgoingIce.length === 0) return;
    console.log("[WebRTC] sender", this.pendingOutgoingIce.length,
      "bufrede utgaaende ICE-kandidater til callee");
    for (const c of this.pendingOutgoingIce) {
      this._signal("ice-candidate", { candidate: c });
    }
    this.pendingOutgoingIce = [];
  }

  // ── Tom ICE-buffer naar remote description er satt ──────────
  async _flushPendingIce() {
    if (!this.pc?.remoteDescription || this.pendingIceCandidates.length === 0) return;
    console.log("[WebRTC] tommer", this.pendingIceCandidates.length, "ICE-kandidater fra buffer");
    for (const c of this.pendingIceCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.error("[WebRTC] feil ved ICE fra buffer:", err);
      }
    }
    this.pendingIceCandidates = [];
  }

  // ── Handle ICE candidate ────────────────────────────────────
  async _handleIceCandidate(candidate) {
    try {
      // Hvis remote description ikke er satt enda, buffer kandidaten
      if (!this.pc || !this.pc.remoteDescription) {
        this.pendingIceCandidates.push(candidate);
        console.log("[WebRTC] buffer ICE-kandidat (remote description ikke klar). Buffer:", this.pendingIceCandidates.length);
        return;
      }
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  }

  // ── Toggle mute ─────────────────────────────────────────────
  toggleMute() {
    const audioTrack = this.localStream?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // returns true if now muted
    }
    return false;
  }

  // ── Toggle camera ───────────────────────────────────────────
  toggleCamera() {
    const videoTrack = this.localStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled; // returns true if camera now off
    }
    return false;
  }

  // ── Switch front/back camera ────────────────────────────────
  // Henter et nytt kamera med motsatt facingMode og bytter video-sporet
  // via sender.replaceTrack() - INGEN reforhandling, samtalen holder seg oppe.
  // Returnerer den oppdaterte localStream (eller null hvis den ikke kunne byttes),
  // saa CallRoom kan re-sette sitt lokale forhaandsbilde.
  async switchCamera() {
    if (!this.isVideo || !this.localStream) return null;

    const prev = this.facingMode;
    this.facingMode = prev === "user" ? "environment" : "user";

    let newStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode },
        audio: false,
      });
    } catch (err) {
      // Enheten har trolig bare ett kamera (f.eks. desktop) - rull tilbake.
      console.warn("[WebRTC] switchCamera feilet, beholder naavaerende kamera:", err.name);
      this.facingMode = prev;
      return null;
    }

    const newVideoTrack = newStream.getVideoTracks()[0];
    const oldVideoTrack = this.localStream.getVideoTracks()[0];

    // Bevar av/paa-tilstand (hvis kamera var skrudd av med toggleCamera)
    if (oldVideoTrack) newVideoTrack.enabled = oldVideoTrack.enabled;

    // Bytt sporet motparten mottar - uten reforhandling
    const sender = this.pc?.getSenders().find((s) => s.track && s.track.kind === "video");
    if (sender) {
      try {
        await sender.replaceTrack(newVideoTrack);
      } catch (err) {
        console.error("[WebRTC] replaceTrack feilet:", err);
        newVideoTrack.stop();
        this.facingMode = prev;
        return null;
      }
    }

    // Bytt sporet i localStream og stopp det gamle
    if (oldVideoTrack) {
      this.localStream.removeTrack(oldVideoTrack);
      oldVideoTrack.stop();
    }
    this.localStream.addTrack(newVideoTrack);

    return this.localStream;
  }

  // ── Diagnostikk: hent inbound audio-stats ────────────
  async getAudioStats() {
    if (!this.pc) return null;
    const stats = await this.pc.getStats();
    let inbound = null;
    stats.forEach((r) => {
      if (r.type === "inbound-rtp" && (r.kind === "audio" || r.mediaType === "audio")) inbound = r;
    });
    return {
      conn: this.pc.connectionState,
      ice: this.pc.iceConnectionState,
      inbound,
    };
  }

  // ── Hang up ─────────────────────────────────────────────────
  hangup(reason = "manual") {
    if (this._hungUp) return;
    this._hungUp = true;
    console.warn("[WebRTC] HANGUP kalt - aarsak:", reason);
    this._signal("hangup", { reason });
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.pc?.close();
    if (this.channel) supabase.removeChannel(this.channel);
    this.pc = null;
    this.localStream = null;
    this.channel = null;
    this.onStateChange?.("ended");
  }
}

// ── Incoming call listener ──────────────────────────────────────────────────────
// Each user listens on a personal channel for incoming call invites.
export const listenForCalls = (userId, onIncomingCall) => {
  const channelName = `user-calls:${userId}`;
  console.log("[listenForCalls] Lager kanal:", channelName);

  const channel = supabase.channel(channelName, {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: "incoming-call" }, ({ payload }) => {
    console.log("[listenForCalls] MOTTATT incoming-call:", payload);
    onIncomingCall(payload);
  });

  channel.subscribe((status) => {
    console.log("[listenForCalls] subscribe-status:", status, "kanal:", channelName);
  });
  return channel;
};

// ── Send a call invite to another user ─────────────────────────────────────────
export const inviteToCall = async ({ targetUserId, conversationId, callerId, callerName, isVideo }) => {
  const channelName = `user-calls:${targetUserId}`;
  console.log("[inviteToCall] Sender til kanal:", channelName, "fra:", callerId);

  const channel = supabase.channel(channelName);

  await new Promise((resolve, reject) => {
    let resolved = false;
    channel.subscribe((status) => {
      console.log("[inviteToCall] subscribe-status:", status);
      if (status === "SUBSCRIBED" && !resolved) {
        resolved = true;
        resolve();
      }
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !resolved) {
        resolved = true;
        reject(new Error(`Channel subscribe ${status}`));
      }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Channel subscribe timeout (3s)"));
      }
    }, 3000);
  });

  const result = await channel.send({
    type: "broadcast",
    event: "incoming-call",
    payload: { conversationId, callerId, callerName, isVideo },
  });
  console.log("[inviteToCall] send-result:", result);

  // Push-varsel via Edge Function (fire-and-forget) saa mottakeren ringer selv
  // om appen er lukket. Vi venter IKKE paa svar - en treg/cold-start funksjon
  // skal aldri forsinke selve anropet.
  supabase.functions
    .invoke("notify-call", {
      body: { calleeUserId: targetUserId, conversationId, callerName, isVideo },
    })
    .catch((err) =>
      console.warn("[inviteToCall] notify-call push feilet:", err?.message ?? err),
    );

  // Clean up after sending
  setTimeout(() => supabase.removeChannel(channel), 1000);
};
