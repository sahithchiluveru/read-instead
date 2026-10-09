import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chaptersEpub } from './support/epub-fixtures.js'
import { bookPdf } from './support/pdf-fixtures.js'
import { startReader } from './support/reader-harness.js'

const chapters = { id: 'chapters', format: 'epub' }
const pdfBook = { id: 'book', format: 'pdf' }
const epubButtons = ['Contents', 'Font', 'Theme', 'Go to %', 'Hide bar', 'Shelf']
const pdfButtons = ['Contents', 'Font', 'Theme', 'Go to %', 'Pairing', 'Fit-width', 'Hide bar', 'Shelf']

let reader
before(async () => {
    reader = await startReader({ chapters: chaptersEpub(), book: bookPdf() })
})
after(() => reader.close())

const statusText = app => app.page.textContent('#top-bar .status')
// The progress line's fill, as a fraction of its track.
const progressFill = app => app.page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 250)) // the 150 ms width ease
    const fill = document.querySelector('#top-bar .progress span').getBoundingClientRect()
    const track = document.querySelector('#top-bar .progress').getBoundingClientRect()
    return fill.width / track.width
})
const barOpacity = app => app.page.evaluate(() => getComputedStyle(document.getElementById('top-bar')).opacity)
const waitForOpacity = (app, opacity) => app.page.waitForFunction(opacity =>
    getComputedStyle(document.getElementById('top-bar')).opacity === opacity, opacity)
// The labels of the Top Bar buttons on screen, in order.
const visibleButtons = app => app.page.evaluate(() =>
    [...document.querySelectorAll('#top-bar button')].filter(b => b.checkVisibility()).map(b => b.textContent))
const focusedButton = app => app.page.evaluate(() =>
    document.activeElement.closest('#top-bar') ? document.activeElement.textContent : null)
// Press a key that shouldn't report a new state, and give it time to (wrongly) do so.
const pressQuietly = async (app, key) => {
    await app.page.keyboard.press(key)
    await app.page.waitForTimeout(250)
}
// Where the first paragraph of the Spread sits on screen.
const textBox = app => app.page.evaluate(() => {
    const renderer = document.querySelector('foliate-view').renderer
    const { doc } = renderer.getContents()[0]
    const frame = doc.defaultView.frameElement.getBoundingClientRect()
    const p = doc.querySelector('p').getBoundingClientRect()
    return { left: frame.left + p.left, top: frame.top + p.top, width: p.width, height: p.height }
})

describe('the Top Bar status', () => {
    test('an EPUB shows chapter · percent · pages left in chapter, counting down', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const first = await app.press('ArrowRight')
        assert.equal(first.chapter, 'Chapter Two')
        const percent = Math.round(first.progress * 100)
        assert.ok(first.pagesLeftInChapter >= 2)
        assert.equal(await statusText(app), `Chapter Two · ${percent}% · ${first.pagesLeftInChapter} pages left in chapter`)
        assert.ok(Math.abs(await progressFill(app) - first.progress) < 0.01)

        const second = await app.press('ArrowRight')
        assert.equal(second.pagesLeftInChapter, first.pagesLeftInChapter - 2)
        let last = second
        while (last.pagesLeftInChapter > 0) last = await app.press('ArrowRight')
        assert.equal(last.chapter, 'Chapter Two')
        assert.match(await statusText(app), / · Last page of chapter$/)
        assert.equal((await app.press('ArrowRight')).chapter, 'Chapter Three')
        await app.close()
    })

    test('a PDF shows chapter · pages · percent', async () => {
        const app = await reader.launch()
        const cover = await app.open(pdfBook)
        assert.equal(await statusText(app), 'Page 1 of 45 · 0%')
        const spread = await app.press('ArrowRight')
        assert.equal(await statusText(app), `Chapter One · Pages 2–3 of 45 · ${Math.round(spread.progress * 100)}%`)
        assert.equal(cover.pagesLeftInChapter, undefined)
        await app.close()
    })

    test('the status line is dim, with tabular figures', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        const style = await app.page.evaluate(() => {
            const status = getComputedStyle(document.querySelector('#top-bar .status'))
            const dim = getComputedStyle(document.documentElement).getPropertyValue('--dim').trim()
            const probe = document.createElement('div')
            probe.style.color = dim
            document.body.append(probe)
            const dimColor = getComputedStyle(probe).color
            probe.remove()
            return { color: status.color, dimColor, figures: status.fontVariantNumeric }
        })
        assert.equal(style.color, style.dimColor)
        assert.equal(style.figures, 'tabular-nums')
        await app.close()
    })
})

describe('hiding the Top Bar', () => {
    test('↓ fades the bar out and back in without moving the text', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const before = await app.press('ArrowRight')
        const box = await textBox(app)
        const count = await app.stateCount()

        await pressQuietly(app, 'ArrowDown')
        await waitForOpacity(app, '0')
        assert.deepEqual(await textBox(app), box)
        assert.equal(await app.stateCount(), count, 'hiding the bar turns no page')

        await pressQuietly(app, 'ArrowDown')
        await waitForOpacity(app, '1')
        assert.deepEqual(await textBox(app), box)
        assert.deepEqual(await app.state(), before)
        await app.close()
    })
})

describe('Bar focus', () => {
    test('↑ enters Bar focus on the first button; ←/→ move between buttons without turning', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const reading = await app.press('ArrowRight')
        assert.deepEqual(await visibleButtons(app), [])

        const bar = await app.press('ArrowUp')
        assert.equal(bar.mode, 'bar')
        assert.equal(bar.left, reading.left)
        assert.deepEqual(await visibleButtons(app), epubButtons)
        assert.equal(await focusedButton(app), 'Contents')

        const count = await app.stateCount()
        await pressQuietly(app, 'ArrowLeft')
        assert.equal(await focusedButton(app), 'Contents', '← stops at the first button')
        await pressQuietly(app, 'ArrowRight')
        await pressQuietly(app, 'ArrowRight')
        assert.equal(await focusedButton(app), 'Theme')
        await pressQuietly(app, 'ArrowLeft')
        assert.equal(await focusedButton(app), 'Font')
        for (let i = 0; i < 8; i++) await app.page.keyboard.press('ArrowRight')
        assert.equal(await focusedButton(app), 'Shelf', '→ stops at the last button')
        assert.equal(await app.stateCount(), count, 'no page turned')
        await app.close()
    })

    test('a PDF also gets Pairing and Fit-width', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        await app.press('ArrowUp')
        assert.deepEqual(await visibleButtons(app), pdfButtons)
        await app.close()
    })

    test('Back returns to Reading mode, and Back again to the Shelf', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await app.press('ArrowUp')
        const count = await app.stateCount()
        assert.equal(await app.back(), true)
        assert.equal((await app.state()).mode, 'reading')
        assert.equal(await app.stateCount(), count + 1)
        assert.deepEqual(await visibleButtons(app), [])
        assert.equal(await focusedButton(app), null)
        assert.equal(await app.page.isVisible('#shelf'), false)
        // Reading mode again: → turns the page.
        assert.equal((await app.press('ArrowRight')).chapter, 'Chapter Two')
        assert.equal(await app.back(), true)
        assert.deepEqual(await app.state(), { open: false })
        assert.equal(await app.page.isVisible('#shelf'), true)
        await app.close()
    })

    test('↓ returns to Reading mode with the bar still showing', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await app.press('ArrowUp')
        assert.equal((await app.press('ArrowDown')).mode, 'reading')
        assert.deepEqual(await visibleButtons(app), [])
        assert.equal(await barOpacity(app), '1')
        await app.close()
    })

    test('↑ shows a hidden bar', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await pressQuietly(app, 'ArrowDown')
        await waitForOpacity(app, '0')
        await app.press('ArrowUp')
        await waitForOpacity(app, '1')
        assert.equal(await focusedButton(app), 'Contents')
        await app.close()
    })

    test('OK on a button not built yet does nothing', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await app.press('ArrowUp')
        const count = await app.stateCount()
        await pressQuietly(app, 'Enter')
        assert.equal(await app.stateCount(), count)
        assert.equal(await focusedButton(app), 'Contents')
        await app.close()
    })

    test('Hide bar hides the bar and returns to Reading mode', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await app.press('ArrowUp')
        while (await focusedButton(app) !== 'Hide bar') await app.page.keyboard.press('ArrowRight')
        const box = await textBox(app)
        assert.equal((await app.press('Enter')).mode, 'reading')
        await waitForOpacity(app, '0')
        assert.deepEqual(await visibleButtons(app), [])
        assert.deepEqual(await textBox(app), box)
        assert.equal((await app.press('ArrowRight')).chapter, 'Chapter Two')
        await app.close()
    })

    test('Shelf leaves the book for the Shelf', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        await app.press('ArrowUp')
        while (await focusedButton(app) !== 'Shelf') await app.page.keyboard.press('ArrowRight')
        assert.deepEqual(await app.press('Enter'), { open: false })
        assert.equal(await app.page.isVisible('#shelf'), true)
        assert.equal(await app.back(), false)
        await app.close()
    })

    test('the focused button is filled with the text colour, scaled 1.05, with a 2 dp accent outline', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await app.press('ArrowUp')
        await app.page.waitForTimeout(250) // the 150 ms focus transition
        const look = await app.page.evaluate(() => {
            const color = value => {
                const probe = document.createElement('div')
                probe.style.color = value
                document.body.append(probe)
                const rgb = getComputedStyle(probe).color
                probe.remove()
                return rgb
            }
            const root = getComputedStyle(document.documentElement)
            const [focused, other] = document.querySelectorAll('#top-bar button')
            const f = getComputedStyle(focused)
            return {
                fill: f.backgroundColor, label: f.color, transform: f.transform,
                outline: `${f.outlineWidth} ${f.outlineStyle} ${f.outlineColor}`,
                otherFill: getComputedStyle(other).backgroundColor,
                text: color(root.getPropertyValue('--text')), bg: color(root.getPropertyValue('--bg')),
                accent: color(root.getPropertyValue('--accent')),
            }
        })
        assert.equal(look.fill, look.text)
        assert.equal(look.label, look.bg)
        assert.equal(look.transform, 'matrix(1.05, 0, 0, 1.05, 0, 0)')
        assert.equal(look.outline, `2px solid ${look.accent}`)
        assert.equal(look.otherFill, 'rgba(0, 0, 0, 0)')
        await app.close()
    })
})
