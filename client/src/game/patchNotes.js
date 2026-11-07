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
export const PATCH_NOTES = [
  {
    id: 'battle-log',
    version: 'v13',
    glyph: '📜',
    accent: '#60a5fa',
  },
  {
    id: 'draft-duplicate-pricing',
    version: 'v12',
    glyph: '📈',
    accent: '#fbbf24',
  },
  {
    id: 'draft-redesign',
    version: 'v11',
    glyph: '👁',
    accent: '#f472b6',
  },
  {
    id: 'analysis-window',
    version: 'v10',
    glyph: '🔍',
    accent: '#7dd3fc',
  },
  {
    id: 'require-pieces-in-draft',
    version: 'v9',
    glyph: '♟',
    accent: '#e8c96a',
  },
  {
    id: 'premoves',
    version: 'v8',
    glyph: '⏩',
    accent: '#5a96dc',
  },
  {
    id: 'clock-increment',
    version: 'v7',
    glyph: '⏱',
    accent: '#e8c96a',
  },
  {
    id: 'no-moves-checks-cards',
    version: 'v6',
    glyph: '🃏',
    accent: '#3af3a0',
  },
  {
    id: 'meteor-kills-count',
    version: 'v5',
    glyph: '☄',
    accent: '#d35400',
  },
  {
    id: 'draft-caps-and-fog-fix',
    version: 'v4',
    glyph: '🛡',
    accent: '#7dd3fc',
  },
  {
    id: 'fresh-rounds',
    version: 'v3',
    glyph: '🔄',
    accent: '#3af3a0',
  },
  {
    id: 'necromancy-unstable',
    version: 'v2',
    glyph: '✨',
    accent: '#a855f7',
  },
  {
    id: 'draft-battle-rework',
    version: 'v1',
    glyph: '⚔',
    accent: '#c9a850',
  },
]
