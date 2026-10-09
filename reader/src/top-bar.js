import { statusLine } from './status-line.js'

// The Top Bar: a progress line and a status line in the reader's reserved top band, and
// the reader's buttons, revealed in Bar focus. Hiding it only fades the band, so the
// pages below never move.
const bar = document.getElementById('top-bar')
const fill = bar.querySelector('.progress span')
const status = bar.querySelector('.status')
const buttonRow = bar.querySelector('.buttons')

// The buttons this book offers, in order (Pairing and Fit-width are PDF-only).
const buttons = () => [...buttonRow.querySelectorAll('button')].filter(button => !button.hidden)

// A freshly opened book: an empty, visible bar with the buttons for its format.
export const resetTopBar = format => {
    bar.classList.remove('faded')
    status.textContent = ''
    fill.style.width = '0'
    for (const button of buttonRow.querySelectorAll('[data-format]'))
        button.hidden = button.dataset.format !== format
    blurTopBar()
}

export const showLocation = (format, location) => {
    status.textContent = statusLine(format, location)
    fill.style.width = `${location.progress * 100}%`
}

export const toggleTopBar = () => bar.classList.toggle('faded')

export const hideTopBar = () => bar.classList.add('faded')

// Bar focus: show the bar if hidden and focus its first button.
export const focusTopBar = () => {
    bar.classList.remove('faded')
    buttonRow.hidden = false
    buttons()[0].focus()
}

// Back to Reading mode: the buttons go and focus returns to the page.
export const blurTopBar = () => {
    buttonRow.hidden = true
    if (bar.contains(document.activeElement)) document.activeElement.blur()
}

// Move focus one button left (-1) or right (1), stopping at either end.
export const moveTopBarFocus = direction => {
    const all = buttons()
    const index = all.indexOf(document.activeElement)
    all[Math.min(Math.max(index + direction, 0), all.length - 1)].focus()
}

// The action of the focused button ('hide', 'shelf', ...).
export const focusedAction = () => buttonRow.contains(document.activeElement)
    ? document.activeElement.dataset.action : null
