import { closeAddBooks, isAddBooksOpen, openAddBooks } from './add-books.js'
import { loadPosition, reportState } from './bridge.js'
import { PdfReader } from './pdf-reader.js'
import { EpubReader } from './epub-reader.js'

const readers = { pdf: PdfReader, epub: EpubReader }

const home = document.getElementById('home')
const readerScreen = document.getElementById('reader')
const stage = document.getElementById('stage')
const hud = document.getElementById('hud')

// The open book: { book: { id, format, src }, reader, ready }. Keys only reach the
// reader once it's ready. Each reader draws into its own element in the stage, so one
// abandoned mid-open can't touch the next book's pages.
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

// Reading mode: ←/→ turn the Spread, OK does nothing.
const onKey = e => {
    if (!session?.ready) return
    if (e.key === 'Enter') {
        e.preventDefault()
        return
    }
    const direction = arrowDirection(e.key)
    if (!direction) return
    e.preventDefault()
    queuedTurns += direction
    runQueuedTurns()
}

const openBook = async book => {
    home.hidden = true
    readerScreen.hidden = false
    queuedTurns = 0
    hud.textContent = 'Opening…'
    const opening = { book, ready: false }
    const report = location => {
        if (session !== opening) return
        reportState({ open: true, bookId: book.id, format: book.format, mode: 'reading', ...location })
    }
    const pages = document.createElement('div')
    pages.className = 'pages'
    stage.replaceChildren(pages)
    opening.reader = new readers[book.format](pages, { onKey, onLocation: report })
    session = opening
    try {
        await opening.reader.open(book.src, loadPosition(book.id))
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
    home.hidden = false
    home.querySelector('button').focus()
}

addEventListener('keydown', onKey)
home.addEventListener('click', e => {
    const button = e.target.closest('button')
    if (button?.id === 'add-books') openAddBooks()
    else if (button) openBook({ ...button.dataset })
})
home.addEventListener('keydown', e => {
    const direction = arrowDirection(e.key)
    if (!direction) return
    const buttons = [...home.querySelectorAll('button')]
    const i = buttons.indexOf(document.activeElement)
    buttons[Math.max(0, Math.min(buttons.length - 1, i + direction))].focus()
})
home.querySelector('button').focus()

window.readInstead = {
    // Open a book: { id, format: 'epub' | 'pdf', src }.
    open: openBook,
    // Called by the Android shell on Back; returns true if the reader handled it.
    back() {
        if (isAddBooksOpen()) {
            closeAddBooks()
            return true
        }
        if (readerScreen.hidden) return false
        closeBook()
        return true
    },
}
