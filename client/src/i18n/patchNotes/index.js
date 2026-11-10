import { getLang } from '../core.js'
import ru from './ru.js'
import en from './en.js'
import uk from './uk.js'
import es from './es.js'
import pt from './pt.js'
import fr from './fr.js'
import de from './de.js'
import it from './it.js'
import pl from './pl.js'
import tr from './tr.js'
import zh from './zh.js'
import ja from './ja.js'
import ko from './ko.js'

const NOTES = { ru, en, uk, es, pt, fr, de, it, pl, tr, zh, ja, ko }

// { title, changes[] } for a PATCH_NOTES entry in the current language;
// same fallback chain as t(): lang → en → ru.
export function patchNoteText(id) {
  return NOTES[getLang()]?.[id] ?? en[id] ?? ru[id] ?? { title: id, changes: [] }
}
