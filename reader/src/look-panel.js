import { choices } from './look.js'

// Font and Theme: panels over the pages, opened from Bar focus, each a few rows of
// choices. ↑↓ move between rows and ←/→ pick a row's choice, which applies at once.
// OK returns to Reading mode and Back to Bar focus.

const labels = {
    font: { literata: 'Literata', sans: 'Atkinson Hyperlegible' },
    size: Object.fromEntries(choices.size.map(size => [size, 'Aa'])),
    theme: { sepia: 'Sepia', dark: 'Dark', light: 'Light' },
    layout: { spread: 'Two pages', 'single-page': 'One page' },
}
const rowTitles = { font: 'Font', size: 'Size', theme: 'Theme', layout: 'Layout' }
// The settings each panel holds.
const panels = { font: ['font', 'size', 'layout'], theme: ['theme'] }

let panel = null // the open panel's element

const rows = () => [...panel.querySelectorAll('.row')]
const optionsOf = row => [...row.querySelectorAll('button')]
const focusedRow = () => document.activeElement.closest('.row')

const option = (name, value, current) => {
    const button = document.createElement('button')
    button.dataset.value = value
    button.textContent = labels[name][value]
    button.classList.toggle('selected', value === current)
    if (name === 'size') button.style.fontSize = `${value}px`
    if (name === 'theme') button.dataset.theme = value // shown in its own colours
    return button
}

// Open a panel ('font' or 'theme') showing the look's current choices, focused on the
// first row's.
export const openLookPanel = (name, look) => {
    panel = document.getElementById(name)
    panel.replaceChildren(...panels[name].map(setting => {
        const row = document.createElement('div')
        row.className = 'row'
        row.dataset.setting = setting
        const title = document.createElement('h2')
        title.textContent = rowTitles[setting]
        const buttons = document.createElement('div')
        buttons.className = 'options'
        buttons.append(...choices[setting].map(value => option(setting, value, look[setting])))
        row.append(title, buttons)
        return row
    }))
    panel.hidden = false
    focusRow(rows()[0])
}

const focusRow = row => row?.querySelector('.selected').focus()

// ↑↓: move to the row above (-1) or below (1), stopping at either end.
export const moveLookRow = direction => {
    const all = rows()
    focusRow(all[all.indexOf(focusedRow()) + direction])
}

// ←/→: pick the choice to the left (-1) or right (1) in the focused row. Returns the
// change, { name, value }, or null at either end.
export const stepLookChoice = direction => {
    const row = focusedRow()
    const options = optionsOf(row)
    const next = options[options.indexOf(document.activeElement) + direction]
    if (!next) return null
    for (const button of options) button.classList.toggle('selected', button === next)
    next.focus()
    return { name: row.dataset.setting, value: next.dataset.value }
}

export const closeLookPanel = () => {
    if (!panel) return
    panel.hidden = true
    panel.replaceChildren()
    panel = null
}
