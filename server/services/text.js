// Reject unsafe characters in user-supplied display text (player names, award
// picks, handles) at the source — none of these legitimately appear in a name:
//   • `<` / `>`        → stop <script> / <img onerror=…> HTML-injection payloads.
//   • leading = + - @  → stop CSV/Excel formula injection if the value is later
//     exported to a spreadsheet (=HYPERLINK(...), =cmd|..., etc).
// React already escapes on render; this keeps the *stored* value safe for every
// downstream consumer (exports, admin tools), not just the web UI.
export function hasUnsafeText(s) {
  if (typeof s !== 'string') return false;
  if (/[<>]/.test(s)) return true; // HTML injection
  if (/^\s*[=+\-@]/.test(s)) return true; // spreadsheet formula injection
  return false;
}
