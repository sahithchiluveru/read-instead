import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chaptersEpub, fixedLayoutEpub } from './support/epub-fixtures.js'
import { startReader } from './support/reader-harness.js'

const chapters = { id: 'chapters', format: 'epub' }
const fixedLayout = { id: 'fixed-layout', format: 'epub' }

let reader
before(async () => {
    reader = await startReader({
        chapters: chaptersEpub(),
        'fixed-layout': fixedLayoutEpub(),
    })
})
after(() => reader.close())

// Turn forward until the predicate holds, returning every state seen on the way.
const turnUntil = async (app, done, limit = 30) => {
    const states = []
    for (let i = 0; i < limit; i++) {
        const state = await app.press('ArrowRight')
        states.push(state)
        if (done(state)) return states
    }
    throw new Error('never reached the expected Spread')
}

describe('reading an EPUB', () => {
    test('opens on the first chapter, whose Spread has a blank right page', async () => {
        const app = await reader.launch()
        const state = await app.open(chapters)
        assert.equal(state.open, true)
        assert.equal(state.bookId, 'chapters')
        assert.equal(state.mode, 'reading')
        assert.equal(state.chapter, 'Chapter One')
        assert.match(state.left, /^Chapter One\s+One-1 A short opening chapter\.$/)
        assert.equal(state.right, '')
        await app.close()
    })

    test("never runs the book's own scripts", async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await app.page.waitForTimeout(300)
        assert.equal(await app.page.evaluate(() => window.bookScriptRan), undefined)
        await app.close()
    })

    test('→ shows the next Spread and ← the previous one', async () => {
        const app = await reader.launch()
        const first = await app.open(chapters)
        const second = await app.press('ArrowRight')
        assert.equal(second.chapter, 'Chapter Two')
        assert.match(second.left, /^Chapter Two\s+Two-1 /)
        assert.notEqual(second.right, '')
        const third = await app.press('ArrowRight')
        assert.notEqual(third.left, second.left)
        assert.ok(third.progress > second.progress && second.progress > first.progress)
        // EPUBs have no fixed pages: the label is how far through the book this Spread is.
        for (const state of [first, second, third])
            assert.equal(state.pageLabel, `${Math.round(state.progress * 100)}%`)
        assert.deepEqual(await app.press('ArrowLeft'), second)
        assert.deepEqual(await app.press('ArrowLeft'), first)
        await app.close()
    })

    test('quick presses are all turned, none dropped', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await app.press('ArrowRight')
        const twoAhead = await app.press('ArrowRight')
        await app.press('ArrowLeft')
        await app.press('ArrowLeft')
        await app.page.keyboard.press('ArrowRight')
        await app.page.keyboard.press('ArrowRight')
        await app.page.waitForFunction(left => window.reportedStates.at(-1).left === left, twoAhead.left)
        await app.close()
    })

    test('every chapter starts in the left column of a fresh Spread', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const states = await turnUntil(app, s => s.chapter === 'Chapter Three')
        const [chapterThree, lastOfTwo] = [states.at(-1), states.at(-2)]
        assert.match(chapterThree.left, /^Chapter Three\s+Three-1 /)
        assert.equal(lastOfTwo.chapter, 'Chapter Two')
        assert.doesNotMatch(lastOfTwo.left + lastOfTwo.right, /Three/)
        await app.close()
    })

    test('left and right text cover the chapter in order, with nothing lost or repeated', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const first = await app.press('ArrowRight')
        const chapterText = await app.page.evaluate(() =>
            document.querySelector('foliate-view').renderer.getContents()[0].doc.body.textContent)
        const rest = await turnUntil(app, s => s.chapter === 'Chapter Three')
        const pages = [first, ...rest.slice(0, -1)].flatMap(s => [s.left, s.right])
        const words = text => text.split(/\s+/).filter(Boolean)
        assert.deepEqual(words(pages.join(' ')), words(chapterText))
        // One line per paragraph: a page never runs two paragraphs together.
        for (const page of pages) assert.doesNotMatch(page, /\.Two-/)
        await app.close()
    })

    test('images scale to fit within one column', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await app.press('ArrowRight')
        const images = await app.page.evaluate(() => {
            const renderer = document.querySelector('foliate-view').renderer
            const { doc } = renderer.getContents()[0]
            const column = renderer.size / 2
            const height = renderer.getBoundingClientRect().height
            return ['tall', 'wide'].map(id => {
                const { left, right, width, height: h } = doc.getElementById(id).getBoundingClientRect()
                return {
                    id, fitsColumn: width <= column && h <= height,
                    sameColumn: Math.floor(left / column) === Math.floor((right - 1) / column),
                }
            })
        })
        for (const image of images) assert.deepEqual(image, { ...image, fitsColumn: true, sameColumn: true })
        await app.close()
    })

    test('OK does nothing in Reading mode', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const before = await app.press('ArrowRight')
        const count = await app.stateCount()
        await app.page.keyboard.press('Enter')
        await app.page.waitForTimeout(300)
        assert.equal(await app.stateCount(), count)
        assert.deepEqual(await app.state(), before)
        await app.close()
    })

    test('Back leaves the book and returns to the Shelf', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        assert.equal(await app.back(), true)
        assert.deepEqual(await app.state(), { open: false })
        assert.equal(await app.page.isVisible('#shelf'), true)
        assert.equal(await app.back(), false) // nothing left to close: the app exits
        await app.close()
    })

    test('reports a Position on every turn and reopens at the same Spread', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const states = [await app.press('ArrowRight'), await app.press('ArrowRight'), await app.press('ArrowRight')]
        for (const state of states) assert.match(state.position, /^epubcfi\(/)
        const saved = states.at(-1)
        await app.close()

        const relaunched = await reader.launch({ positions: { [chapters.id]: saved.position } })
        const restored = await relaunched.open(chapters)
        assert.equal(restored.left, saved.left)
        assert.equal(restored.right, saved.right)
        await relaunched.close()
    })
})

describe('reading a fixed-layout EPUB', () => {
    test('shows the publisher-defined spreads: cover alone, then facing pages', async () => {
        const app = await reader.launch()
        const cover = await app.open(fixedLayout)
        assert.deepEqual([cover.left, cover.right], ['', 'Page 1'])
        const spread = await app.press('ArrowRight')
        assert.deepEqual([spread.left, spread.right], ['Page 2', 'Page 3'])
        const last = await app.press('ArrowRight')
        assert.deepEqual([last.left, last.right], ['Page 4', 'Page 5'])
        const back = await app.press('ArrowLeft')
        assert.deepEqual([back.left, back.right], ['Page 2', 'Page 3'])
        await app.close()
    })

    test('reopens at the saved Spread', async () => {
        const app = await reader.launch()
        await app.open(fixedLayout)
        await app.press('ArrowRight')
        const saved = await app.press('ArrowRight')
        await app.close()

        const relaunched = await reader.launch({ positions: { [fixedLayout.id]: saved.position } })
        const restored = await relaunched.open(fixedLayout)
        assert.deepEqual([restored.left, restored.right], ['Page 4', 'Page 5'])
        await relaunched.close()
    })
})
