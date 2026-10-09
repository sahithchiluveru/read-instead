import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { bookPdf, paperPdf } from './support/pdf-fixtures.js'
import { startReader } from './support/reader-harness.js'

const book = name => ({ id: name, format: 'pdf' })
const page = n => `Page ${n}\nSecond line of page ${n}`
const pagesShown = state => [state.left, state.right].map(text => text.split('\n')[0])
const fitWidth = { book: { 'fit-width': 'true' } }

// The book's 432×648 pt pages across the 864 dp stage are 1296 dp tall, in a 469 dp high
// view: → scrolls by half the view, 234.5 dp, down to the page's bottom at 827 dp.
const STAGE = { width: 864, height: 469 }
const PAGE_HEIGHT = 1296
const STEP = STAGE.height / 2
const BOTTOM = PAGE_HEIGHT - STAGE.height

let reader
before(async () => {
    reader = await startReader({ book: bookPdf(), paper: paperPdf() })
})
after(() => reader.close())

const savedBookSettings = (app, id) => app.page.evaluate(id => window.savedBookSettings[id], id)
const statusText = app => app.page.textContent('#top-bar .status')
const focusedButton = app => app.page.evaluate(() =>
    document.activeElement.closest('#top-bar') ? document.activeElement.textContent : null)

// From Reading mode, press a Top Bar button and resolve to the state reported afterwards.
const pressButton = async (app, label) => {
    await app.press('ArrowUp')
    for (let i = 0; i < 10 && await focusedButton(app) !== label; i++) await app.page.keyboard.press('ArrowRight')
    assert.equal(await focusedButton(app), label)
    return app.press('Enter')
}

// Press a key that shouldn't report a new state, and give it time to (wrongly) do so.
const pressQuietly = async (app, key) => {
    const count = await app.stateCount()
    await app.page.keyboard.press(key)
    await app.page.waitForTimeout(300)
    assert.equal(await app.stateCount(), count, `${key} did nothing`)
}

// The pages on screen: each one's size, and how far down it's scrolled (how far its top
// sits above the stage's).
const view = app => app.page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect()
    return [...document.querySelectorAll('#stage canvas')].map(canvas => {
        const box = canvas.getBoundingClientRect()
        return { width: box.width, height: box.height, scrolled: stage.top - box.top, left: box.left - stage.left }
    })
})
const scrolled = async app => {
    const pages = await view(app)
    assert.equal(pages.length, 1, 'one page on screen')
    return pages[0].scrolled
}
const assertNear = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) <= 1, `${message}: ${actual} is not about ${expected}`)

describe('Pairing', () => {
    test('switches a book between cover-alone and 1–2, saved for the book', async () => {
        const app = await reader.launch()
        assert.deepEqual(pagesShown(await app.open(book('book'))), ['', 'Page 1'])

        const paired = await pressButton(app, 'Pairing')
        assert.deepEqual(pagesShown(paired), ['Page 1', 'Page 2'])
        assert.equal(paired.pageLabel, 'Pages 1–2 of 45')
        assert.equal(paired.mode, 'bar', 'Bar focus stays on Pairing, to switch back')
        assert.equal(await focusedButton(app), 'Pairing')
        assert.deepEqual(await savedBookSettings(app, 'book'), { pairing: 'paper' })
        assert.deepEqual(pagesShown(await app.press('ArrowDown')), ['Page 1', 'Page 2'])
        assert.deepEqual(pagesShown(await app.press('ArrowRight')), ['Page 3', 'Page 4'])

        // Switching back keeps the first page on screen.
        assert.deepEqual(pagesShown(await pressButton(app, 'Pairing')), ['Page 2', 'Page 3'])
        assert.deepEqual(await savedBookSettings(app, 'book'), { pairing: 'book' })
        await app.close()
    })

    test('switches a paper to cover-alone', async () => {
        const app = await reader.launch()
        assert.deepEqual(pagesShown(await app.open(book('paper'))), ['Page 1', 'Page 2'])
        assert.deepEqual(pagesShown(await pressButton(app, 'Pairing')), ['', 'Page 1'])
        assert.deepEqual(await savedBookSettings(app, 'paper'), { pairing: 'book' })
        await app.close()
    })

    test("a book opens with its saved Pairing, and other books keep their own", async () => {
        const app = await reader.launch({ bookSettings: { book: { pairing: 'paper' } } })
        assert.deepEqual(pagesShown(await app.open(book('book'))), ['Page 1', 'Page 2'])
        await app.back()
        assert.deepEqual(pagesShown(await app.open(book('paper'))), ['Page 1', 'Page 2'])
        await app.close()
    })
})

describe('Fit-width', () => {
    test('shows one page across the screen width, saved for the book', async () => {
        const app = await reader.launch()
        await app.open(book('book'))
        await app.press('ArrowRight')

        const fitted = await pressButton(app, 'Fit-width')
        assert.deepEqual([fitted.left, fitted.right], [page(2), ''], 'Now Reading gets the page as left')
        assert.equal(fitted.pageLabel, 'Page 2 of 45')
        assert.equal(fitted.mode, 'bar')
        const [shown] = await view(app)
        assert.deepEqual(shown, { width: STAGE.width, height: PAGE_HEIGHT, scrolled: 0, left: 0 })
        assert.deepEqual(await savedBookSettings(app, 'book'), { 'fit-width': 'true' })

        const spread = await app.press('Enter') // still on Fit-width
        assert.deepEqual(pagesShown(spread), ['Page 2', 'Page 3'])
        assert.equal((await view(app)).length, 2)
        assert.deepEqual(await savedBookSettings(app, 'book'), { 'fit-width': 'false' })
        await app.close()
    })

    test('→ scrolls down half a screen at a time, then moves to the top of the next page', async () => {
        const app = await reader.launch({ bookSettings: fitWidth })
        const opened = await app.open(book('book'))
        assert.deepEqual([opened.left, opened.right], [page(1), ''])
        assert.equal(await scrolled(app), 0)

        const positions = new Set([opened.position])
        for (const expected of [STEP, 2 * STEP, 3 * STEP, BOTTOM]) {
            const state = await app.press('ArrowRight')
            assert.deepEqual([state.left, state.right], [page(1), ''])
            assert.equal(state.pageLabel, 'Page 1 of 45')
            assert.equal(state.progress, 0)
            assertNear(await scrolled(app), expected, 'scrolled down')
            positions.add(state.position)
        }
        assert.equal(positions.size, 5, 'every step is a new Position')
        assert.match(await statusText(app), /^Page 1 of 45 · 0%/)

        const next = await app.press('ArrowRight')
        assert.deepEqual([next.left, next.right], [page(2), ''])
        assert.equal(next.pageLabel, 'Page 2 of 45')
        assert.equal(next.chapter, 'Chapter One')
        assert.equal(next.progress, 1 / 44)
        assert.equal(await scrolled(app), 0)
        assert.match(await statusText(app), /^Chapter One · Page 2 of 45 · 2%/)
        await app.close()
    })

    test('← scrolls up half a screen, then moves to the bottom of the previous page', async () => {
        const app = await reader.launch({ bookSettings: fitWidth, positions: { book: '2' } })
        assert.deepEqual(pagesShown(await app.open(book('book'))), ['Page 2', ''])
        assert.equal(await scrolled(app), 0)

        const previous = await app.press('ArrowLeft')
        assert.deepEqual([previous.left, previous.right], [page(1), ''])
        assertNear(await scrolled(app), BOTTOM, 'at the bottom of page 1')
        for (const expected of [BOTTOM - STEP, BOTTOM - 2 * STEP, BOTTOM - 3 * STEP, 0]) {
            assert.deepEqual(pagesShown(await app.press('ArrowLeft')), ['Page 1', ''])
            assertNear(await scrolled(app), expected, 'scrolled up')
        }
        await pressQuietly(app, 'ArrowLeft') // the top of the book
        await app.close()
    })

    test('→ at the bottom of the last page does nothing', async () => {
        const app = await reader.launch({ bookSettings: fitWidth, positions: { book: '45' } })
        assert.deepEqual(pagesShown(await app.open(book('book'))), ['Page 45', ''])
        for (let i = 0; i < 4; i++) await app.press('ArrowRight')
        assertNear(await scrolled(app), BOTTOM, 'at the bottom')
        await pressQuietly(app, 'ArrowRight')
        await app.close()
    })

    test('the Position keeps the scroll offset and restores it exactly', async () => {
        const app = await reader.launch({ bookSettings: fitWidth })
        await app.open(book('book'))
        for (let i = 0; i < 7; i++) await app.press('ArrowRight')
        const saved = await app.state()
        assert.deepEqual(pagesShown(saved), ['Page 2', ''])
        const offset = await scrolled(app)
        assertNear(offset, 2 * STEP, 'two steps into page 2')
        await app.close()

        const relaunched = await reader.launch({ bookSettings: fitWidth, positions: { book: saved.position } })
        const restored = await relaunched.open(book('book'))
        assert.equal(restored.position, saved.position)
        assert.deepEqual([restored.left, restored.right], [saved.left, saved.right])
        assert.equal(await scrolled(relaunched), offset)
        // And it carries on from there.
        await relaunched.press('ArrowRight')
        assertNear(await scrolled(relaunched), 3 * STEP, 'a step further')
        await relaunched.close()
    })

    test("a scrolled Position opens on its page's Spread without Fit-width", async () => {
        const app = await reader.launch({ bookSettings: fitWidth, positions: { book: '3' } })
        await app.open(book('book'))
        const saved = await app.press('ArrowRight')
        await app.close()

        const relaunched = await reader.launch({ positions: { book: saved.position } })
        assert.deepEqual(pagesShown(await relaunched.open(book('book'))), ['Page 2', 'Page 3'])
        await relaunched.close()
    })

    test('a jump lands at the top of its page', async () => {
        const app = await reader.launch({ bookSettings: fitWidth })
        await app.open(book('book'))
        await app.press('ArrowRight')
        await app.press('ArrowUp')
        await app.press('Enter') // Contents
        await app.page.keyboard.press('ArrowDown')
        const jumped = await app.press('Enter') // Chapter Two
        assert.deepEqual(pagesShown(jumped), ['Page 10', ''])
        assert.equal(await scrolled(app), 0)
        await app.close()
    })
})
