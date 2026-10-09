import { themeColor } from './look.js'

// The style sheet laid over each EPUB document for the reader's look: the font and size,
// line height 1.5, justified with hyphenation, and the theme's colours (the page itself
// is transparent, so the app's background shows through). It overrides the book's own
// choices, since a book set in black on white would vanish in Dark.

const fontsUrl = new URL('../vendor/fonts/', import.meta.url).href

// The latin and latin-ext subsets build.mjs bundles, with their unicode ranges.
const subsets = [
    ['latin', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
    ['latin-ext', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
]
const faces = [
    { family: 'Literata', file: 'literata', axes: 'opsz', weight: '200 900' },
    { family: 'Atkinson Hyperlegible Next', file: 'atkinson-hyperlegible-next', axes: 'wght', weight: '200 800' },
]
// Blocking (not swapping) the font keeps the pages from reflowing once it arrives.
const fontFaces = faces.flatMap(({ family, file, axes, weight }) => ['normal', 'italic'].flatMap(style =>
    subsets.map(([subset, range]) => `@font-face {
    font-family: '${family}';
    font-style: ${style};
    font-weight: ${weight};
    font-display: block;
    src: url('${fontsUrl}${file}-${subset}-${axes}-${style}.woff2') format('woff2');
    unicode-range: ${range};
}`))).join('\n')

const families = {
    literata: "'Literata', Georgia, serif",
    sans: "'Atkinson Hyperlegible Next', system-ui, sans-serif",
}

// Code keeps the book's monospace font.
const notCode = ':not(code, pre, kbd, samp, tt, code *, pre *, kbd *, samp *, tt *)'

export const bookStyles = ({ font, size }) => `${fontFaces}
html {
    font-size: ${size}px !important;
    color-scheme: only light;
}
html, body {
    background: transparent !important;
    color: ${themeColor('--text')} !important;
}
body {
    font-size: 1rem !important;
    font-optical-sizing: auto;
}
body, body *${notCode} {
    font-family: ${families[font]} !important;
}
body * {
    color: inherit !important;
    background-color: transparent !important;
    border-color: currentColor !important;
}
body a:link, body a:visited, body a:link *, body a:visited * {
    color: ${themeColor('--accent')} !important;
}
p, li, blockquote, dd {
    line-height: 1.5 !important;
    text-align: justify !important;
    hyphens: auto !important;
    -webkit-hyphens: auto !important;
}
`
