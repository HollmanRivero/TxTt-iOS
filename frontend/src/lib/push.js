// ── push.js (WEB-STUB) ────────────────────────────────────────────
// Den ekte, native push-implementasjonen ligger i Android/Capacitor-
// prosjektet (TxTt-Android). På web (PWA) har vi ikke native push, så
// her er registerPushForUser en trygg "no-op" slik at importen i
// CallProvider.jsx resolver og web-bygget ikke krasjer.
//
// Varsling når appen er ÅPEN håndteres uansett av ringetonen i
// CallProvider (Web Audio API). Bakgrunns-push på web kan eventuelt
// kobles på senere via service worker + Web Push.
//
// VIKTIG: Ikke legg denne fila i Android-prosjektet – der finnes den
// ekte native versjonen allerede. Denne hører kun hjemme i web-prosjektet
// (TxTt2.05.10/frontend/src/lib/push.js).

/**
 * Web-stub. Gjør ingenting, men returnerer en opprydningsfunksjon
 * for å være kompatibel med kallstedet i CallProvider.
 *
 * @param {string} userId
 * @param {{ onCallTapped?: (info: { conversationId: string, callerName?: string, isVideo?: boolean }) => void }} [handlers]
 * @returns {() => void} cleanup
 */
export function registerPushForUser(userId, handlers) {
  // Ingen native push på web – bevisst tomt.
  return () => {};
}
