import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { bookPdf, paperPdf, slidesPdf, twoPageRightPdf } from './support/pdf-fixtures.js'
import { startReader } from './support/reader-harness.js'

const book = name => ({ id: name, format: 'pdf' })
const page = n => `Page ${n}\nSecond line of page ${n}`
const pagesShown = state => [state.left, state.right].map(text => text.split('\n')[0])

let reader
before(async () => {
    reader = await startReader({
        book: bookPdf(),
        paper: paperPdf(),
        'two-page-right': twoPageRightPdf(),
        slides: slidesPdf(),
    })
})
after(() => reader.close())

// Where the pages sit on screen, as fractions of the stage width.
const pageBoxes = app => app.page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect()
    return [...document.querySelectorAll('#stage canvas')].map(canvas => {
        const { left, right } = canvas.getBoundingClientRect()
        return { left: (left - stage.left) / stage.width, right: (right - stage.left) / stage.width }
    })
})

describe('reading a PDF', () => {
    test('a book pairs like print: the cover alone on the right, then 2–3', async () => {
        const app = await reader.launch()
        const cover = await app.open(book('book'))
        assert.equal(cover.open, true)
        assert.equal(cover.format, 'pdf')
        assert.deepEqual([cover.left, cover.right], ['', page(1)])
        assert.equal(cover.chapter, '')
        const [coverBox] = await pageBoxes(app)
        assert.ok(coverBox.left >= 0.5, 'the cover sits on the right half')

        const spread = await app.press('ArrowRight')
        assert.deepEqual([spread.left, spread.right], [page(2), page(3)])
        assert.equal(spread.position, '2')
        assert.equal(spread.chapter, 'Chapter One')
        await app.close()
    })

    test('a paper pairs 1–2, 3–4, with the odd last page alone', async () => {
        const app = await reader.launch()
        assert.deepEqual(pagesShown(await app.open(book('paper'))), ['Page 1', 'Page 2'])
        assert.deepEqual(pagesShown(await app.press('ArrowRight')), ['Page 3', 'Page 4'])
        const last = await app.press('ArrowRight')
        assert.deepEqual(pagesShown(last), ['Page 5', ''])
        assert.equal(last.progress, 1)
        // → at the end of the book does nothing.
        const count = await app.stateCount()
        await app.page.keyboard.press('ArrowRight')
        await app.page.waitForTimeout(300)
        assert.equal(await app.stateCount(), count)
        assert.deepEqual(pagesShown(await app.press('ArrowLeft')), ['Page 3', 'Page 4'])
        await app.close()
    })

    test("the document's own PageLayout wins over the heuristic", async () => {
        const app = await reader.launch()
        assert.deepEqual(pagesShown(await app.open(book('two-page-right'))), ['', 'Page 1'])
        assert.deepEqual(pagesShown(await app.press('ArrowRight')), ['Page 2', 'Page 3'])
        await app.close()
    })

    test('landscape pages show one per screen', async () => {
        const app = await reader.launch()
        assert.deepEqual(pagesShown(await app.open(book('slides'))), ['Page 1', ''])
        const boxes = await pageBoxes(app)
        assert.equal(boxes.length, 1)
        assert.ok(boxes[0].right - boxes[0].left > 0.9, 'the slide fills the screen width')
        assert.deepEqual(pagesShown(await app.press('ArrowRight')), ['Page 2', ''])
        await app.close()
    })

    test('progress grows with each Spread and the chapter follows the outline', async () => {
        const app = await reader.launch()
        const states = [await app.open(book('book'))]
        for (let i = 0; i < 5; i++) states.push(await app.press('ArrowRight'))
        for (let i = 1; i < states.length; i++) assert.ok(states[i].progress > states[i - 1].progress)
        assert.deepEqual(pagesShown(states.at(-1)), ['Page 10', 'Page 11'])
        assert.equal(states.at(-1).chapter, 'Chapter Two')
        await app.close()
    })

    test('reopens at the saved Spread', async () => {
        const app = await reader.launch()
        await app.open(book('book'))
        await app.press('ArrowRight')
        await app.press('ArrowRight')
        const saved = await app.press('ArrowRight')
        assert.equal(saved.position, '6')
        await app.close()

        const relaunched = await reader.launch({ positions: { book: saved.position } })
        const restored = await relaunched.open(book('book'))
        assert.deepEqual([restored.left, restored.right], [saved.left, saved.right])
        await relaunched.close()
    })
})
