import { drawLink } from './add-books.js'
import { libraryBooks, phoneLink } from './bridge.js'

// The Shelf, the app's opening screen: a grid of covers in the Library's order (most
// recently read first), each with a progress bar, then the Add books tile. With no
// books, the Phone Page's QR code takes the place of the covers.
const shelf = document.getElementById('shelf')
const grid = shelf.querySelector('.grid')
const empty = grid.querySelector('.empty')
const addTile = document.getElementById('add-books')
const toast = document.getElementById('toast')
const TOAST_MS = 4000
let books = []
let toastTimer = 0

const element = (tag, className, text) => {
    const el = document.createElement(tag)
    if (className) el.className = className
    if (text !== undefined) el.textContent = text
    return el
}

const tileFor = book => {
    const tile = element('button', 'tile')
    tile.dataset.id = book.id
    const cover = element('span', 'cover')
    const titleCard = () => cover.replaceChildren(element('span', 'title-card', book.title))
    if (book.coverType) {
        const img = element('img')
        img.alt = ''
        img.onerror = titleCard
        img.src = `/covers/${encodeURIComponent(book.id)}`
        cover.append(img)
    } else {
        titleCard()
    }
    tile.append(cover, element('span', 'title', book.title))
    if (book.author) tile.append(element('span', 'author', book.author))
    if (book.unreadable) {
        tile.append(element('span', 'unreadable', "Couldn't open this book"))
    } else {
        const bar = element('span', 'progress')
        const fill = element('span')
        fill.style.width = `${Math.round(book.progress * 100)}%`
        bar.append(fill)
        tile.append(bar)
    }
    return tile
}

const tiles = () => [...grid.querySelectorAll('button')]
const idOf = tile => tile.dataset.id ?? tile.id

const focusTile = id => (tiles().find(tile => idOf(tile) === id) ?? tiles()[0]).focus()

// Re-reads the Library and redraws. Focus goes to the tile with id focusId, else stays
// on the tile it was on (if the Shelf is showing).
export const renderShelf = focusId => {
    const focused = shelf.contains(document.activeElement) ? idOf(document.activeElement) : undefined
    books = libraryBooks()
    grid.querySelectorAll('[data-id]').forEach(tile => tile.remove())
    addTile.before(...books.map(tileFor))
    empty.hidden = books.length > 0
    if (!books.length) drawLink(empty, phoneLink())
    if (!shelf.hidden) focusTile(focusId ?? focused)
}

const showToast = text => {
    toast.textContent = text
    toast.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.hidden = true }, TOAST_MS)
}

// A book arrived from the phone. The first one takes focus from the Add books tile.
export const bookAdded = book => {
    renderShelf(books.length ? undefined : book.id)
    showToast(`Added: ${book.title}`)
}

// A book was deleted from the phone. If its tile had focus, the next tile takes it
// (there's always one: the Add books tile). If it was open, the TV has just come back
// to the Shelf, so say why.
export const bookDeleted = (book, { wasOpen = false } = {}) => {
    const all = tiles()
    const i = all.findIndex(tile => tile === document.activeElement && idOf(tile) === book.id)
    renderShelf(i >= 0 ? idOf(all[i + 1]) : undefined)
    if (wasOpen) showToast(`Deleted from your phone: ${book.title}`)
}

// D-pad focus across the grid: rows wrap at the column count; ↓ into a short last
// row lands on its last tile.
const moveFocus = e => {
    const all = tiles()
    const i = all.indexOf(document.activeElement)
    if (i < 0) return
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length
    const last = all.length - 1
    const target = {
        ArrowLeft: i % columns ? i - 1 : i,
        ArrowRight: (i + 1) % columns && i < last ? i + 1 : i,
        ArrowUp: i >= columns ? i - columns : i,
        ArrowDown: i + columns <= last ? i + columns
            : Math.floor(i / columns) < Math.floor(last / columns) ? last : i,
    }[e.key]
    if (target === undefined) return
    e.preventDefault()
    all[target].focus()
}

export const initShelf = ({ openBook, openAddBooks }) => {
    grid.addEventListener('click', e => {
        const tile = e.target.closest('button')
        if (tile === addTile) return openAddBooks()
        const book = books.find(book => book.id === tile?.dataset.id)
        if (book && !book.unreadable) openBook(book)
    })
    grid.addEventListener('keydown', moveFocus)
    renderShelf()
}
