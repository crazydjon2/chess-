// Draft-mode round tables. The draft itself has no rolled pool any more —
// every piece type and card is available from round 1 (see draftEngine.js);
// a round only changes how many bans each side gets and how big their
// budget is. Kept in its own file (rather than inlined in draftEngine.js)
// so all three round-scaled tables — bans, budget, move limit — live next
// to each other.

// Bans per player this round — each ban removes one piece type or card
// from what the OPPONENT (not you) is allowed to buy this round. Escalates
// round to round: later rounds have a bigger, more consequential catalog
// (more coins to spend), so denying the opponent's best options matters
// more and there's more to deny.
export const BAN_COUNT_BY_ROUND = { 1: 1, 2: 2, 3: 3 }

// Flat coin budget for the round's buy phase — the same every game, no
// matter how much money was left over from a previous round (coins never
// carry between rounds, only the surviving army does — see
// draftEngine.js's createDraftState). Starting values — tune from
// playtesting, not derived from anything else, since there's no rolled
// pool any more to anchor a formula to.
export const BUDGET_BY_ROUND = { 1: 30, 2: 45, 3: 60 }

// Per-player clock for the round, in seconds — a real chess clock, not a
// shared/round-wide budget: each side gets this much thinking time and it
// only ticks down on THEIR own turn (see chess.js's applyMove). Running
// out is an outright loss for that side (like a flag fall), not a capital
// tiebreak — unlike no_moves/insufficient-material draws, only one side
// can ever actually run out, so there's no symmetric case to weigh.
export const TIME_LIMIT_BY_ROUND = { 1: 120, 2: 180, 3: 240 } // 2 / 3 / 4 minutes
