import { closeAddBooks, isAddBooksOpen, openAddBooks } from './add-books.js'
import { loadPosition, reportState } from './bridge.js'
import { PdfReader } from './pdf-reader.js'
import { EpubReader } from './epub-reader.js'
import { bookAdded, bookDeleted, initShelf, renderShelf } from './shelf.js'
import {
    blurTopBar, focusTopBar, focusedTopBarAction, hideTopBar, moveTopBarFocus, resetTopBar, showTopBarLocation,
    toggleTopBar,
} from './top-bar.js'

const readers = { pdf: PdfReader, epub: EpubReader }

const shelf = document.getElementById('shelf')
const readerScreen = document.getElementById('reader')
const stage = document.getElementById('stage')
const hud = document.getElementById('hud')

// The open book: { book: { id, format, ... }, reader, ready, mode, location }. Keys only
// reach the reader once it's ready. mode is 'reading' (←/→ turn the Spread) or 'bar' (Bar
// focus: ←/→ move between the Top Bar's buttons); location is the Spread on screen.
// Each reader draws into its own element in the stage, so one abandoned mid-open can't
// touch the next book's pages.
let session = null
// Presses that arrive mid-turn are queued (as a net direction) rather than dropped.
let queuedTurns = 0
let turning = false

const arrowDirection = key => ({ ArrowRight: 1, ArrowLeft: -1 })[key] ?? 0

const nextFrame = () => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)))

const runQueuedTurns = async () => {
    if (turning) return
    turning = true
    try {
        while (session?.ready && queuedTurns !== 0) {
            const direction = Math.sign(queuedTurns)
            queuedTurns -= direction
            const { reader } = session
            const moved = await (direction > 0 ? reader.next() : reader.prev())
            if (!moved) queuedTurns = 0 // hit the start/end of the book
        }
    } catch (error) {
        queuedTurns = 0
        console.error(error)
    } finally {
        turning = false
    }
}

const report = () => {
    const { book, mode, location } = session
    if (location) reportState({ open: true, bookId: book.id, format: book.format, mode, ...location })
}

const setMode = mode => {
    session.mode = mode
    if (mode === 'bar') focusTopBar()
    else blurTopBar()
    report()
}

// What each Top Bar button does; the rest arrive with later overlays.
const barActions = {
    hide() {
        hideTopBar()
        setMode('reading')
    },
    shelf: () => closeBook(),
}

// Reading mode: ←/→ turn the Spread, ↓ hides/shows the Top Bar, ↑ enters Bar focus and
// OK does nothing.
const readingKeys = {
    ArrowUp: () => setMode('bar'),
    ArrowDown: toggleTopBar,
    Enter() {},
}

// Bar focus: ←/→ move between buttons, OK activates, ↓ (or Back) returns to Reading mode.
const barKeys = {
    ArrowLeft: () => moveTopBarFocus(-1),
    ArrowRight: () => moveTopBarFocus(1),
    ArrowUp() {},
    ArrowDown: () => setMode('reading'),
    Enter: () => barActions[focusedTopBarAction()]?.(),
}

const onKey = e => {
    if (!session?.ready) return
    const action = (session.mode === 'bar' ? barKeys : readingKeys)[e.key]
    if (action) {
        e.preventDefault()
        action()
        return
    }
    const direction = arrowDirection(e.key)
    if (!direction) return
    e.preventDefault()
    queuedTurns += direction
    runQueuedTurns()
}

// The Library's book files are served (by the Android shell) at /books/<id>.
const openBook = async book => {
    shelf.hidden = true
    readerScreen.hidden = false
    queuedTurns = 0
    hud.textContent = 'Opening…'
    resetTopBar(book.format)
    const opening = { book, ready: false, mode: 'reading', location: null }
    const onLocation = location => {
        if (session !== opening) return
        opening.location = location
        showTopBarLocation(book.format, location)
        report()
    }
    const pages = document.createElement('div')
    pages.className = 'pages'
    stage.replaceChildren(pages)
    opening.reader = new readers[book.format](pages, { onKey, onLocation })
    session = opening
    try {
        await opening.reader.open(`/books/${encodeURIComponent(book.id)}`, loadPosition(book.id))
        await nextFrame()
        if (session !== opening) { // Back was pressed while it was opening
            opening.reader.close()
            return
        }
        opening.ready = true
        hud.textContent = ''
    } catch (error) {
        try {
            opening.reader.close()
        } catch {}
        if (session !== opening) return // Back was pressed while it was opening
        hud.textContent = `Couldn't open this book: ${error.message}`
        console.error(error)
    }
    document.body.focus()
}

const closeBook = () => {
    const closed = session?.book.id
    blurTopBar()
    if (session?.ready) {
        try {
            session.reader.close()
        } catch (error) {
            console.error(error)
        }
    }
    session = null
    queuedTurns = 0
    stage.replaceChildren()
    reportState({ open: false })
    readerScreen.hidden = true
    shelf.hidden = false
    renderShelf(closed) // the Library has moved this book to the front, with its new progress
}

addEventListener('keydown', onKey)

// A book was deleted from the phone; if it's the one open, the TV goes back to the Shelf.
const onBookDeleted = book => {
    const wasOpen = session?.book.id === book.id
    if (wasOpen) closeBook()
    bookDeleted(book, { wasOpen })
}
initShelf({ openBook, openAddBooks })

window.readInstead = {
    // Open a book from the Library: { id, format: 'epub' | 'pdf' }.
    open: openBook,
    // Called by the Android shell when a book arrives from the phone, or is deleted from it.
    bookAdded,
    bookDeleted: onBookDeleted,
    // Called by the Android shell on Back; returns true if the reader handled it.
    back() {
        if (isAddBooksOpen()) {
            closeAddBooks()
            renderShelf() // an empty Shelf's QR code must show a reset key
            return true
        }
        if (readerScreen.hidden) return false
        if (session?.mode === 'bar') setMode('reading')
        else closeBook()
        return true
    },
}
