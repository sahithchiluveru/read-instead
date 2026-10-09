import { PdfReader } from './pdf-reader.js'
import { EpubReader } from './epub-reader.js'

const readers = { pdf: PdfReader, epub: EpubReader }

const home = document.getElementById('home')
const readerScreen = document.getElementById('reader')
const stage = document.getElementById('stage')
const hud = document.getElementById('hud')

let reader = null
// Presses that arrive mid-turn are queued (as a net direction) rather than dropped.
let queuedTurns = 0
let turning = false
const turnTimes = []

const arrowDirection = key => ({ ArrowRight: 1, ArrowLeft: -1 })[key] ?? 0

const nextFrame = () => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)))

const median = sorted => {
    const mid = sorted.length / 2
    return sorted.length % 2 ? sorted[Math.floor(mid)] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

// Turn latency = key press until the new Spread has been painted.
const recordTurnLatency = (format, ms) => {
    turnTimes.push(ms)
    const sorted = [...turnTimes].sort((a, b) => a - b)
    const summary = `median ${median(sorted)} ms · max ${sorted.at(-1)} ms · ${turnTimes.length} turns`
    hud.textContent = `last ${ms} ms · ${summary}`
    console.log(`[turn] ${format} ${ms}ms ${summary}`)
}

const runQueuedTurns = async () => {
    if (turning) return
    turning = true
    try {
        while (reader && queuedTurns !== 0) {
            const direction = Math.sign(queuedTurns)
            queuedTurns -= direction
            const current = reader
            const start = performance.now()
            const moved = await (direction > 0 ? current.next() : current.prev())
            if (!moved) {
                queuedTurns = 0 // hit the start/end of the book
                break
            }
            await nextFrame()
            recordTurnLatency(current.format, Math.round(performance.now() - start))
        }
    } catch (error) {
        queuedTurns = 0
        console.error(error)
    } finally {
        turning = false
    }
}

const onKey = e => {
    const direction = arrowDirection(e.key)
    if (!reader || !direction) return
    e.preventDefault()
    queuedTurns += direction
    runQueuedTurns()
}

const openBook = async button => {
    const { format, src } = button.dataset
    home.hidden = true
    readerScreen.hidden = false
    turnTimes.length = 0
    queuedTurns = 0
    hud.textContent = 'Opening…'
    const start = performance.now()
    const opening = new readers[format](stage, onKey)
    try {
        await opening.open(src)
        await nextFrame()
        if (readerScreen.hidden) { // Back was pressed while it was opening
            opening.close()
            return
        }
        reader = opening
        const ms = Math.round(performance.now() - start)
        hud.textContent = `opened in ${ms} ms`
        console.log(`[open] ${format} ${ms}ms`)
    } catch (error) {
        hud.textContent = `Couldn't open this book: ${error.message}`
        console.error(error)
        try {
            opening.close()
        } catch {}
    }
    document.body.focus()
}

const closeBook = () => {
    try {
        reader?.close()
    } catch (error) {
        console.error(error)
    }
    reader = null
    queuedTurns = 0
    readerScreen.hidden = true
    home.hidden = false
    home.querySelector('button').focus()
}

addEventListener('keydown', onKey)
home.addEventListener('click', e => {
    const button = e.target.closest('button')
    if (button) openBook(button)
})
home.addEventListener('keydown', e => {
    const direction = arrowDirection(e.key)
    if (!direction) return
    const buttons = [...home.querySelectorAll('button')]
    const i = buttons.indexOf(document.activeElement)
    buttons[Math.max(0, Math.min(buttons.length - 1, i + direction))].focus()
})
home.querySelector('button').focus()

// Called by the Android shell on Back; returns true if the reader handled it.
window.readInstead = {
    back() {
        if (readerScreen.hidden) return false
        closeBook()
        return true
    },
}
