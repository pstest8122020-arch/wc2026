// Shared bracket-completeness + lock helpers, so the submit gate (routes/bracket)
// and the "finish your bracket" prompt (routes/auth -> /discord/me) agree on one
// definition: a full bracket = all 8 third-place teams + a winner for every
// scored knockout match — Round of 32 -> Final (incl. the champion = 104) AND the
// 3rd-place playoff (103, now mandatory). Award picks remain optional.
import { db } from '../db.js';
import { ROUNDS } from './bracketStructure.js';

// 31 knockout matches (R32 -> Final) + the 3rd-place playoff (103). All mandatory.
const REQUIRED_KNOCKOUT = [...ROUNDS.flatMap((r) => r.matches), 103];

// Brackets lock at the first WC2026 kickoff (read from the real schedule).
export function bracketsLocked() {
  const row = db
    .prepare("SELECT MIN(kickoff_utc) AS k FROM matches WHERE kickoff_utc IS NOT NULL AND kickoff_utc != ''")
    .get();
  const t = row?.k ? Date.parse(row.k) : NaN;
  return Number.isFinite(t) && Date.now() >= t;
}

// Plain-language list of what a bracket is still missing; empty array = complete.
// Knockout keys arrive as JSON strings but numeric indexing coerces, so `ko[m]`
// works for the numeric match ids in SCORED_MATCHES.
export function missingBracketParts(thirds, knockout, champion) {
  const missing = [];
  const thirdsCount = Array.isArray(thirds) ? thirds.length : 0;
  if (thirdsCount !== 8) missing.push('your 8 third-place teams');

  const ko = knockout && typeof knockout === 'object' ? knockout : {};
  const open = REQUIRED_KNOCKOUT.filter((m) => !ko[m]);
  const noChampion = !(champion || ko[104]);
  if (open.length) {
    if (open.length === 1 && noChampion) missing.push('your champion');
    else if (open.length === 1 && open[0] === 103) missing.push('your 3rd-place playoff winner');
    else
      missing.push(
        `${open.length} knockout pick${open.length > 1 ? 's' : ''}${noChampion ? ' (incl. champion)' : ''}`,
      );
  }
  return missing;
}
