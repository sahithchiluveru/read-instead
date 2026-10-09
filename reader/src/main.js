import { closeAddBooks, isAddBooksOpen, openAddBooks } from './add-books.js'
import { loadPosition, reportState } from './bridge.js'
import { closeContents, focusedContentsEntry, moveContentsFocus, openContents } from './contents.js'
import { closeGoTo, goToTarget, leapGoTo, nudgeGoTo, openGoTo } from './go-to.js'
import { PdfReader } from './pdf-reader.js'
import { EpubReader } from './epub-reader.js'
import { bookAdded, bookDeleted, initShelf, renderShelf } from './shelf.js'
import {
    blurTopBar, focusTopBar, focusedTopBarAction, hideTopBar, moveTopBarFocus, offerReturn, resetTopBar,
    showTopBarLocation, toggleTopBar, withdrawReturn,
} from './top-bar.js'

const readers = { pdf: PdfReader, epub: EpubReader }

const shelf = document.getElementById('shelf')
const readerScreen = document.getElementById('reader')
const stage = document.getElementById('stage')
const hud = document.getElementById('hud')

// The open book: { book: { id, format, ... }, reader, ready, mode, location, returnTo }.
// Keys only reach the reader once it's ready. mode is 'reading' (←/→ turn the Spread),
// 'bar' (Bar focus: ←/→ move between the Top Bar's buttons), or an overlay opened from
// it: 'contents' or 'go-to'. location is the Spread on screen, and returnTo the one
// before the last jump, which the Return chip goes back to.
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

// In Bar focus, focus starts on the button with this action, if given.
const setMode = (mode, action) => {
    session.mode = mode
    if (mode === 'bar') focusTopBar(action)
    else blurTopBar()
    report()
}

// Go somewhere else in the book from an overlay, back in Reading mode, and offer the
// Return chip for the Spread left behind.
const jump = async navigate => {
    const jumping = session
    const from = jumping.location
    setMode('reading')
    queuedTurns = 0
    try {
        await navigate(jumping.reader)
    } catch (error) {
        console.error(error)
        return
    }
    if (session !== jumping || !from) return
    jumping.returnTo = from
    offerReturn(from.progress)
}

// Contents waits for the reader's list, so Bar focus may have been left meanwhile.
const openContentsOverlay = async () => {
    const opening = session
    let contents
    try {
        contents = await opening.reader.contents()
    } catch (error) {
        console.error(error)
        return
    }
    if (session !== opening || opening.mode !== 'bar') return
    openContents(contents)
    setMode('contents')
}

// What each Top Bar button does; the rest arrive with later overlays.
const barActions = {
    contents: openContentsOverlay,
    'go-to'() {
        const { reader, location } = session
        openGoTo(location ?? { progress: 0, chapter: '' }, fraction => reader.chapterAt(fraction))
        setMode('go-to')
    },
    hide() {
        hideTopBar()
        setMode('reading')
    },
    shelf: () => closeBook(),
    return() {
        const { position } = session.returnTo
        session.returnTo = null
        withdrawReturn()
        setMode('reading')
        queuedTurns = 0
        session.reader.goTo(position).catch(error => console.error(error))
    },
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

// Contents: ↑↓ move through the chapters, OK jumps to one.
const contentsKeys = {
    ArrowLeft() {},
    ArrowRight() {},
    ArrowUp: () => moveContentsFocus(-1),
    ArrowDown: () => moveContentsFocus(1),
    Enter() {
        const entry = focusedContentsEntry()
        if (!entry) return
        closeContents()
        jump(reader => reader.goTo(entry.target))
    },
}

// Go to %: ←/→ move 1% (faster when held), ↑/↓ 10%, OK jumps (unless it hasn't moved).
const goToKeys = {
    ArrowLeft: e => nudgeGoTo(-1, e.repeat),
    ArrowRight: e => nudgeGoTo(1, e.repeat),
    ArrowUp: () => leapGoTo(1),
    ArrowDown: () => leapGoTo(-1),
    Enter() {
        const fraction = goToTarget()
        closeGoTo()
        if (fraction === null) setMode('reading')
        else jump(reader => reader.goToFraction(fraction))
    },
}

const keysByMode = { reading: readingKeys, bar: barKeys, contents: contentsKeys, 'go-to': goToKeys }

// Back leaves an overlay for Bar focus on its button, and Bar focus for Reading mode.
const backByMode = {
    bar: () => setMode('reading'),
    contents() {
        closeContents()
        setMode('bar', 'contents')
    },
    'go-to'() {
        closeGoTo()
        setMode('bar', 'go-to')
    },
}

const onKey = e => {
    if (!session?.ready) return
    const action = keysByMode[session.mode][e.key]
    if (action) {
        e.preventDefault()
        action(e)
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
    const opening = { book, ready: false, mode: 'reading', location: null, returnTo: null }
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
    closeContents()
    closeGoTo()
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
        const back = backByMode[session?.mode]
        if (back) back()
        else closeBook()
        return true
    },
}
