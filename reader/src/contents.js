// Contents: the book's chapters as one vertical list, nested entries indented and all
// expanded, with the current chapter highlighted. ↑↓ move, OK jumps, Back closes.
const panel = document.getElementById('contents')
const list = panel.querySelector('ol')
const empty = panel.querySelector('.empty')
let entries = []

const entryButtons = () => [...list.querySelectorAll('button')]

// contents: { entries: [{ label, depth, target }], current } from the reader. Focus
// starts on the current chapter (or the first entry, before any chapter).
export const openContents = contents => {
    entries = contents.entries
    list.replaceChildren(...entries.map(({ label, depth }, i) => {
        const button = document.createElement('button')
        button.textContent = label
        button.style.setProperty('--depth', depth)
        button.classList.toggle('current', i === contents.current)
        const item = document.createElement('li')
        item.append(button)
        return item
    }))
    empty.hidden = entries.length > 0
    panel.hidden = false
    focusEntry(entryButtons()[Math.max(contents.current, 0)])
}

const focusEntry = button => {
    button?.focus({ preventScroll: true })
    button?.scrollIntoView({ block: 'nearest' })
}

// Move focus one entry up (-1) or down (1), stopping at either end.
export const moveContentsFocus = direction => {
    const all = entryButtons()
    const index = all.indexOf(document.activeElement)
    focusEntry(all[Math.min(Math.max(index + direction, 0), all.length - 1)])
}

// The focused entry, or null in an empty list.
export const focusedContentsEntry = () => entries[entryButtons().indexOf(document.activeElement)] ?? null

export const closeContents = () => {
    panel.hidden = true
    list.replaceChildren()
    entries = []
}
