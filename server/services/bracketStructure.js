// Official WC2026 knockout bracket wiring (group positions -> Last-32 slots ->
// single-elim tree). Used to turn a participant's predictions (group finish
// order + 8 third-place picks + tapped winners) into a concrete bracket, and to
// score it. Match numbers follow the official schedule (73-104).
//
// Position codes: '1X' = winner of group X, '2X' = runner-up of group X,
// 'T'  = a third-place slot, filled from the participant's 8 picked thirds.
//
// NOTE on thirds: FIFA assigns the 8 best thirds to slots via a fixed lookup
// table keyed on *which* eight groups qualified (Annex C of the regulations).
// That table lives in ./thirdPlaceTable.js — the single source of truth — and is
// exposed to the client via /api/bracket-structure. Because it is keyed on the
// SET of qualifiers, the matchups never depend on the order thirds were picked.
import { allocateThirdGroups } from './thirdPlaceTable.js';

export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Round of 32 — 16 ties by group position (12 winners + 12 runners-up + 8 thirds).
export const ROUND_OF_32 = [
  { match: 73, home: '2A', away: '2B' },
  { match: 74, home: '1E', away: 'T' },
  { match: 75, home: '1F', away: '2C' },
  { match: 76, home: '1C', away: '2F' },
  { match: 77, home: '1I', away: 'T' },
  { match: 78, home: '2E', away: '2I' },
  { match: 79, home: '1A', away: 'T' },
  { match: 80, home: '1L', away: 'T' },
  { match: 81, home: '1D', away: 'T' },
  { match: 82, home: '1G', away: 'T' },
  { match: 83, home: '2K', away: '2L' },
  { match: 84, home: '1H', away: '2J' },
  { match: 85, home: '1B', away: 'T' },
  { match: 86, home: '1J', away: '2H' },
  { match: 87, home: '1K', away: 'T' },
  { match: 88, home: '2D', away: '2G' },
];

// The 8 Last-32 ties that contain a third-place slot, in order — picked thirds
// are allocated to these (by match number).
export const THIRD_SLOT_MATCHES = ROUND_OF_32.filter((m) => m.home === 'T' || m.away === 'T').map(
  (m) => m.match,
);

// Official WC2026 third-place allocation: each third-slot accepts the 3rd-placed
// team from exactly one of these groups. Once the 8 thirds are known, each is
// matched to a slot whose set contains its group (a perfect matching). This is
// the real rule — thirds land in designated slots, never arbitrarily.
export const THIRD_SLOTS = {
  74: ['A', 'B', 'C', 'D', 'F'],
  77: ['C', 'D', 'F', 'G', 'H'],
  79: ['C', 'E', 'F', 'H', 'I'],
  80: ['E', 'H', 'I', 'J', 'K'],
  81: ['B', 'E', 'F', 'I', 'J'],
  82: ['A', 'E', 'H', 'I', 'J'],
  85: ['E', 'F', 'G', 'I', 'J'],
  87: ['D', 'E', 'I', 'J', 'L'],
};

// Single-elimination tree above the Round of 32. Each entry: the two source
// matches whose WINNERS meet. The 3rd-place match (103) takes the two SF losers.
export const FEEDS = {
  89: [73, 75],
  90: [74, 77],
  91: [76, 78],
  92: [79, 80],
  93: [83, 84],
  94: [81, 82],
  95: [86, 88],
  96: [85, 87],
  97: [89, 90],
  98: [93, 94],
  99: [91, 92],
  100: [95, 96],
  101: [97, 98],
  102: [99, 100],
  104: [101, 102], // Final (winners)
  103: [101, 102], // Third-place (losers)
};

export const ROUNDS = [
  { key: 'R32', label: 'Round of 32', matches: ROUND_OF_32.map((m) => m.match) }, // 73-88
  { key: 'R16', label: 'Round of 16', matches: [89, 90, 91, 92, 93, 94, 95, 96] },
  { key: 'QF', label: 'Quarter-finals', matches: [97, 98, 99, 100] },
  { key: 'SF', label: 'Semi-finals', matches: [101, 102] },
  { key: 'F', label: 'Final', matches: [104] },
];

// Which knockout round a team "reached" if it won a match in the prior round.
// Winning a R32 tie => reached R16, etc. Used for round-based scoring.
export const REACHED_BY_WINNING = {
  R32: 'R16',
  R16: 'QF',
  QF: 'SF',
  SF: 'F',
  F: 'CHAMPION',
};

// Official allocation as { groupLetter: matchNum } (back-compat shape). Delegates
// to the FIFA lookup table; superseded by allocateThirdGroups (thirdPlaceTable.js),
// which returns { matchNum: groupLetter }. Returns {} unless exactly 8 qualifiers.
export function matchThirdGroups(qualifiedGroups) {
  const alloc = allocateThirdGroups(qualifiedGroups) || {};
  const slotForGroup = {};
  for (const [m, g] of Object.entries(alloc)) slotForGroup[g] = Number(m);
  return slotForGroup;
}
