import { statusLine } from './status-line.js'

// The Top Bar: a progress line and a status line in the reader's reserved top band, and
// the reader's buttons, revealed in Bar focus. Hiding it only fades the band, so the
// pages below never move.
const bar = document.getElementById('top-bar')
const fill = bar.querySelector('.progress span')
const status = bar.querySelector('.status')
const buttonRow = bar.querySelector('.buttons')
// "Return to X%", offered after a jump: shown in the band for a few seconds, and the last
// stop in Bar focus until it's used or the next jump replaces it.
const returnChip = bar.querySelector('.return')
const RETURN_CHIP_MS = 5000
let returnChipTimer = 0

// The buttons this book offers, in order (Pairing and Fit-width are PDF-only, Right to
// left CBZ-only), then the Return chip if there's somewhere to return to.
const buttons = () => [...buttonRow.querySelectorAll('button'), returnChip].filter(button => !button.hidden)

// A freshly opened book: an empty, visible bar with the buttons for its format.
export const resetTopBar = format => {
    bar.classList.remove('faded')
    status.textContent = ''
    fill.style.width = '0'
    for (const button of buttonRow.querySelectorAll('[data-format]'))
        button.hidden = button.dataset.format !== format
    withdrawReturn()
    blurTopBar()
}

export const showTopBarLocation = (format, location) => {
    status.textContent = statusLine(format, location)
    fill.style.width = `${location.progress * 100}%`
}

export const toggleTopBar = () => bar.classList.toggle('faded')

export const hideTopBar = () => bar.classList.add('faded')

// Bar focus: show the bar if hidden and focus a button: the one with this action if
// given, else the Return chip while it's still showing, else the first.
export const focusTopBar = action => {
    bar.classList.remove('faded')
    bar.classList.add('focused')
    buttonRow.hidden = false
    const all = buttons()
    const target = all.find(button => button.dataset.action === action)
        ?? (returnChip.classList.contains('fresh') ? returnChip : all[0])
    target.focus()
}

// Back to Reading mode: the buttons go and focus returns to the page.
export const blurTopBar = () => {
    bar.classList.remove('focused')
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
export const focusedTopBarAction = () => buttons().includes(document.activeElement)
    ? document.activeElement.dataset.action : null

// After a jump: offer to return to where the reader was (its progress, 0–1).
export const offerReturn = progress => {
    returnChip.textContent = `Return to ${Math.round(progress * 100)}%`
    returnChip.hidden = false
    returnChip.classList.add('fresh')
    clearTimeout(returnChipTimer)
    returnChipTimer = setTimeout(() => returnChip.classList.remove('fresh'), RETURN_CHIP_MS)
}

export const withdrawReturn = () => {
    clearTimeout(returnChipTimer)
    returnChip.classList.remove('fresh')
    returnChip.hidden = true
}
