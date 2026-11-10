// Patch notes shown on the main menu (see rendering/PatchNotes.jsx). Only
// add a new entry when the user explicitly asks for one — not automatically
// after every fix; iterating on the same feature should stay ONE entry
// describing the end state, not a separate entry per iteration. Add to the
// TOP of this array; never edit an old entry after the fact. `id` must be
// unique and never reused (App.jsx keys the "unseen" badge off
// PATCH_NOTES[0].id). Keep `changes` bullets short — one clause each, no
// explanations.
//
// Texts live in i18n/patchNotes/<lang>.js keyed by `id` — a new entry needs
// its title + changes in EVERY language file there (ru.js is the source).
//
// Entries are tied to a `version`, not a date — bump by 1 for each new
// entry (highest version = top of the array = newest). Versions are just a
// running counter, not semver; no need to reason about major/minor/patch.
export const PATCH_NOTES = []
