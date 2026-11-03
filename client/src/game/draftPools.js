// Draft-mode round tables. The draft itself has no rolled pool and no bans
// any more — every piece type and card is available from round 1 on, and
// both sides pick turn by turn in full view of each other (see
// draftEngine.js); a round only changes the budget and the board size.
// Kept in its own file (rather than inlined in draftEngine.js) so all the
// round-scaled tables — budget, move limit — live next to each other.

// Flat coin budget for the round's buy phase — the same every game,
// regardless of anything left over from a previous round (nothing carries
// between rounds at all — see matchEngine.js's startRound). Starting
// values — tune from playtesting, not derived from anything else, since
// there's no rolled pool any more to anchor a formula to.
export const BUDGET_BY_ROUND = { 1: 30, 2: 45, 3: 60 }

// Per-player clock for the round, in seconds — a real chess clock, not a
// shared/round-wide budget: each side gets this much thinking time and it
// only ticks down on THEIR own turn (see chess.js's applyMove). Running
// out is an outright loss for that side (like a flag fall), not a capital
// tiebreak — unlike no_moves/insufficient-material draws, only one side
// can ever actually run out, so there's no symmetric case to weigh.
export const TIME_LIMIT_BY_ROUND = { 1: 120, 2: 180, 3: 240 } // 2 / 3 / 4 minutes

// Fischer-style increment: seconds added back to the mover's own clock
// after each of their moves (see chess.js's applyMove) — on top of, not
// instead of, the flat TIME_LIMIT_BY_ROUND above. Escalates with round the
// same direction as the base clock, so later rounds (bigger boards, pricier
// cards worth lingering over) don't get proportionally stingier per move.
export const TIME_INCREMENT_BY_ROUND = { 1: 3, 2: 4, 3: 5 }

// Shared countdown for the open, simultaneous placement phase (see
// matchEngine.js's forcePlacement): both sides see each other's board live
// and can rearrange freely until it hits zero, so waiting out the opponent
// buys nothing — it only caps how long the phase can last. At zero, whatever
// is on the board locks in and any unplaced pieces drop onto random free
// home squares. Grows with the round, same as the army it has to fit.
export const PLACEMENT_TIME_BY_ROUND = { 1: 30, 2: 40, 3: 50 }

// Each player's own time bank for the WHOLE draft, in seconds — a chess
// clock, not a per-pick timer: it only runs on that player's turn (see
// draftEngine.js). Running out simply ends that player's draft with
// whatever they've bought so far (see timeoutDraft).
export const DRAFT_TIME_BY_ROUND = { 1: 30, 2: 40, 3: 50 }
