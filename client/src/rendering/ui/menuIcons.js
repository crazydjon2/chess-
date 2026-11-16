// Main-menu icons in the cards' drawing style (skins/cards/defaultIcons.js):
// tinted white face, shade on the right, dark outline, details in the
// tile's colour. 48×48 markup strings; colours come from CSS variables set
// on the tile (MainMenu.css: --mi-c details, --mi-w face, --mi-sh shade).
const LINE = '#16141F'
const W = 'var(--mi-w, #FFFFFF)'
const SH = 'var(--mi-sh, #D8D2E4)'
const ACC = `var(--mi-c, ${LINE})`
const st = (w = 3) => `stroke="${LINE}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`

export const MENU_ICON_SVG = {
  robot: `
    <path d="M24 5.5 V12" fill="none" ${st(3)}/>
    <circle cx="24" cy="5.5" r="3.4" fill="${ACC}" ${st(2.4)}/>
    <rect x="4.5" y="21" width="5.5" height="11" rx="2" fill="${SH}" ${st(2.6)}/>
    <rect x="38" y="21" width="5.5" height="11" rx="2" fill="${SH}" ${st(2.6)}/>
    <rect x="9" y="12" width="30" height="29" rx="6" fill="${W}"/>
    <path d="M30 12 H33 A6 6 0 0 1 39 18 V35 A6 6 0 0 1 33 41 H30 Z" fill="${SH}"/>
    <rect x="9" y="12" width="30" height="29" rx="6" fill="none" ${st(3)}/>
    <rect x="14" y="19" width="20" height="11" rx="3" fill="${LINE}"/>
    <circle cx="19.5" cy="24.5" r="2.5" fill="var(--mi-glow, #9FE8FF)"/>
    <circle cx="28.5" cy="24.5" r="2.5" fill="var(--mi-glow, #9FE8FF)"/>
    <path d="M19 35 H29" fill="none" ${st(2.6)}/>`,

  flask: `
    <path d="M20.5 6 V18 L9.5 37.5 A3.5 3.5 0 0 0 12.5 42.5 H35.5 A3.5 3.5 0 0 0 38.5 37.5 L27.5 18 V6 Z" fill="${W}"/>
    <path d="M25 8 H27.5 V18 L33 28 H29.5 L25 19 Z" fill="${SH}"/>
    <path d="M14.3 28.5 H33.7 L38.5 37.5 A3.5 3.5 0 0 1 35.5 42.5 H12.5 A3.5 3.5 0 0 1 9.5 37.5 Z" fill="${ACC}"/>
    <circle cx="20" cy="36" r="2.4" fill="${W}" opacity="0.8"/>
    <circle cx="27" cy="33" r="1.6" fill="${W}" opacity="0.8"/>
    <path d="M14.3 28.5 H33.7" fill="none" ${st(2.2)}/>
    <path d="M20.5 6 V18 L9.5 37.5 A3.5 3.5 0 0 0 12.5 42.5 H35.5 A3.5 3.5 0 0 0 38.5 37.5 L27.5 18 V6" fill="none" ${st(3)}/>
    <path d="M17.5 6 H30.5" fill="none" ${st(3.4)}/>`,

  help: `
    <path d="M9 9 H39 A5 5 0 0 1 44 14 V31 A5 5 0 0 1 39 36 H23 L13.5 43 V36 H9 A5 5 0 0 1 4 31 V14 A5 5 0 0 1 9 9 Z" fill="${W}" ${st(3.4)}/>
    <path d="M18.5 18.5 A5.5 5.5 0 1 1 26.5 23.5 C25 24.3 24 25.5 24 27.5" fill="none" ${st(4)}/>
    <circle cx="24" cy="32" r="2.4" fill="${LINE}"/>`,

  megaphone: `
    <path d="M13 29 L16 40 H22 L19.5 29 Z" fill="${SH}" ${st(3)}/>
    <path d="M7 18 H15 L34 8 V40 L15 30 H7 A2 2 0 0 1 5 28 V20 A2 2 0 0 1 7 18 Z" fill="${W}"/>
    <path d="M27 11.7 L34 8 V40 L27 36.3 Z" fill="${SH}"/>
    <path d="M7 18 H15 L34 8 V40 L15 30 H7 A2 2 0 0 1 5 28 V20 A2 2 0 0 1 7 18 Z M15 18 V30" fill="none" ${st(3.2)}/>
    <path d="M39.5 18.5 A7.5 7.5 0 0 1 39.5 29.5" fill="none" ${st(3.4)}/>`,

  mail: `
    <rect x="5" y="11" width="38" height="27" rx="4" fill="${W}"/>
    <path d="M30 11 H39 A4 4 0 0 1 43 15 V34 A4 4 0 0 1 39 38 H30 Z" fill="${SH}"/>
    <path d="M6.5 13.5 L24 27 L41.5 13.5" fill="none" ${st(3)}/>
    <rect x="5" y="11" width="38" height="27" rx="4" fill="none" ${st(3.2)}/>
    <circle cx="38" cy="12" r="5" fill="${ACC}" ${st(2.4)}/>`,

  palette: `
    <path d="M24 5 C12.5 5 5 13.5 5 23.5 C5 34 13 43 23.5 43 C27 43 28.5 40.5 28.5 38 C28.5 35 26 34 26 31.5 C26 29 28 27.5 31 27.5 H35.5 C40.5 27.5 43 24 43 19.5 C43 11 34.5 5 24 5 Z" fill="${W}" ${st(3.2)}/>
    <circle cx="14" cy="22.5" r="3.6" fill="#E0614A" ${st(2.2)}/>
    <circle cx="18.5" cy="13.5" r="3.6" fill="#F2B544" ${st(2.2)}/>
    <circle cx="28.5" cy="12" r="3.6" fill="#7CC6E0" ${st(2.2)}/>
    <circle cx="36" cy="18.5" r="3.6" fill="#8FA35A" ${st(2.2)}/>`,
}
