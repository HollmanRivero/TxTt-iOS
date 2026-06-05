import { supabase } from "./supabase";

// ── ICE servers ───────────────────────────────────────────────────────────────
// STUN finner offentlig IP (gratis). TURN relayer trafikk hvis NAT blokkerer
// direkte peer-to-peer (nodvendig for de fleste hjemmenettverk).
// Open Relay Project = gratis offentlig TURN, OK for testing.
// For produksjon: kjor egen Coturn eller bruk Twilio/Metered.
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    // Multiple TURN-servere - flere endepunkter + TCP for aa komme gjennom strenge firewalls
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:80?transport=tcp",
        "turn:openrelay.metered.ca:443?transport=tcp",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  // Pre-warm ICE-kandidater for raskere kobling
  iceCandidatePoolSize: 4,
};

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
    this.lastOffer = null;            // lagres saa caller kan re-sende ved "ready"
    this.pendingIceCandidates = [];   // buffer ICE-kandidater foer remote description er satt
  }

  // ── Set up the peer connection ──────────────────────────────
  async _createPeerConnection() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    // Send our ICE candidates to the other peer
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const type = event.candidate.type; // host | srflx | relay
        console.log("[WebRTC] genererte ICE-kandidat type:", type);
        this._signal("ice-candidate", { candidate: event.candidate });
      } else {
        console.log("[WebRTC] ICE-gathering ferdig (null candidate)");
      }
    };

    // Receive the remote stream - dedupe siden ontrack fyrer per track (audio + video)
    this.pc.ontrack = (event) => {
      const stream = event.streams[0];
      console.log("[WebRTC] ontrack - mottok track:", event.track.kind);
      if (this._lastRemoteStream === stream) {
        return; // samme stream som forrige track-kall, hopper over
      }
      this._lastRemoteStream = stream;
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
            this.hangup();
          }
        }, 8000);
      } else if (state === "closed") {
        this.hangup();
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
      video: this.isVideo,
    });
    this.localStream.getTracks().forEach((track) => {
      this.pc.addTrack(track, this.localStream);
    });

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
          // Mottakeren er paa kanalen - sender (re-)sender offer
          if (this.isCaller && this.lastOffer) {
            console.log("[WebRTC] caller mottok 'ready' -> re-sender offer");
            this._signal("offer", { offer: this.lastOffer });
          }
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
          this.hangup();
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

    // Fortell caller at vi er paa kanalen og klar til aa motta offer
    console.log("[WebRTC] callee sender 'ready' for aa be om offer");
    this._signal("ready", {});

    return localStream;
  }

  // ── Handle incoming offer (callee side) ─────────────────────
  async _handleOffer(offer) {
    if (!this.pc) await this._createPeerConnection();
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
    console.log("[WebRTC] caller mottok answer -> setRemoteDescription");
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this._flushPendingIce();
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

  // ── Hang up ─────────────────────────────────────────────────
  hangup() {
    this._signal("hangup", {});
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

  // Clean up after sending
  setTimeout(() => supabase.removeChannel(channel), 1000);
};
