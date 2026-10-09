import { saveSetting, savedSettings } from './bridge.js'

// The reader's look: font, size, theme and page layout. These settings are global, for
// every book, and persisted. Defaults from docs/research/tv-reader-visual-design.md.
//
// - font: Literata, or Atkinson Hyperlegible Next as the sans alternative.
// - size: the body text in dp (CSS px at the TV's 960×540).
// - theme: its colour tokens live in app.css, under :root[data-theme].
// - layout: 'spread' (two pages side by side) or 'single-page' (one centred column).
export const choices = {
    font: ['literata', 'sans'],
    size: ['16', '18', '20', '22', '25'],
    theme: ['sepia', 'dark', 'light'],
    layout: ['spread', 'single-page'],
}
// Whether the look shows one page at a time rather than a Spread.
export const isSinglePage = look => look.layout === 'single-page'

const defaults = { font: 'literata', size: '20', theme: 'sepia', layout: 'spread' }

let look = defaults

export const currentLook = () => look

// Read the saved settings (anything unknown, say from an older version, falls back to
// the default) and apply the theme.
export const loadLook = () => {
    const saved = savedSettings()
    look = Object.fromEntries(Object.entries(defaults).map(([name, fallback]) =>
        [name, choices[name].includes(saved[name]) ? saved[name] : fallback]))
    applyTheme()
    return look
}

// Change one setting, save it and apply the theme; returns the new look.
export const changeLook = (name, value) => {
    look = { ...look, [name]: value }
    saveSetting(name, value)
    applyTheme()
    return look
}

const applyTheme = () => {
    document.documentElement.dataset.theme = look.theme
}

// The theme's colour token (e.g. '--text'), for pages that can't see app.css.
export const themeColor = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
