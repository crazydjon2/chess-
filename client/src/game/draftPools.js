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

// Free look at the board before the clock starts — only the round's very
// first move gets this (see initialState.js's createDraftRoundState, which
// offsets turnStartedAt by this much; every move after that resets
// turnStartedAt to the real clock, so it can never recur mid-round).
export const ANALYSIS_TIME_SECONDS = 10
