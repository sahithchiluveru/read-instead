import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chaptersEpub, nestedContentsEpub } from './support/epub-fixtures.js'
import { bookPdf } from './support/pdf-fixtures.js'
import { startReader } from './support/reader-harness.js'

const chapters = { id: 'chapters', format: 'epub' }
const nested = { id: 'nested', format: 'epub' }
const pdfBook = { id: 'book', format: 'pdf' }

let reader
before(async () => {
    reader = await startReader({ chapters: chaptersEpub(), nested: nestedContentsEpub(), book: bookPdf() })
})
after(() => reader.close())

const firstLine = text => text.split('\n')[0]
const focusedText = app => app.page.evaluate(() => document.activeElement?.textContent ?? null)
// In Bar focus, move right to the button with this label.
const focusButton = async (app, label) => {
    for (let i = 0; i < 12 && await focusedText(app) !== label; i++) await app.page.keyboard.press('ArrowRight')
    assert.equal(await focusedText(app), label)
}
// From Reading mode, open a Top Bar button's overlay with ↑, → … and OK.
const openFromBar = async (app, label) => {
    await app.press('ArrowUp')
    await focusButton(app, label)
    return app.press('Enter')
}
// Press a key that shouldn't report a new state, and give it time to (wrongly) do so.
const pressQuietly = async (app, key) => {
    await app.page.keyboard.press(key)
    await app.page.waitForTimeout(150)
}

// The Contents list as shown: label, indent (x of the label) and whether it's highlighted.
const contentsEntries = app => app.page.evaluate(() =>
    [...document.querySelectorAll('#contents li button')].filter(b => b.checkVisibility()).map(button => ({
        label: button.textContent,
        x: Math.round(button.getBoundingClientRect().left + parseFloat(getComputedStyle(button).paddingLeft)),
        current: button.classList.contains('current'),
    })))
const contentsOpen = app => app.page.isVisible('#contents')

const slider = app => app.page.evaluate(() => {
    const panel = document.getElementById('go-to')
    return panel.checkVisibility()
        ? { percent: panel.querySelector('.percent').textContent, chapter: panel.querySelector('.chapter').textContent }
        : null
})
const percentOf = async app => Number((await slider(app)).percent.replace('%', ''))

const returnChip = app => app.page.evaluate(() => {
    const chip = document.querySelector('#top-bar .return')
    return chip.checkVisibility() ? chip.textContent : null
})

describe('Contents', () => {
    test("lists an EPUB's chapters with the current one highlighted and focused", async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const reading = await app.press('ArrowRight')
        const state = await openFromBar(app, 'Contents')
        assert.equal(state.mode, 'contents')
        assert.equal(state.position, reading.position)
        const entries = await contentsEntries(app)
        assert.deepEqual(entries.map(e => e.label), ['Chapter One', 'Chapter Two', 'Chapter Three'])
        assert.deepEqual(entries.map(e => e.current), [false, true, false])
        assert.equal(await focusedText(app), 'Chapter Two')
        await app.close()
    })

    test('↑↓ move through the list and OK jumps to the chapter', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await openFromBar(app, 'Contents')
        const count = await app.stateCount()
        await pressQuietly(app, 'ArrowUp')
        assert.equal(await focusedText(app), 'Chapter One', '↑ stops at the first entry')
        await pressQuietly(app, 'ArrowDown')
        await pressQuietly(app, 'ArrowDown')
        await pressQuietly(app, 'ArrowDown')
        assert.equal(await focusedText(app), 'Chapter Three', '↓ stops at the last entry')
        assert.equal(await app.stateCount(), count, 'moving in the list turns no page')

        await app.press('Enter')
        await app.page.waitForFunction(() => window.reportedStates.at(-1).chapter === 'Chapter Three')
        const state = await app.state()
        assert.equal(state.mode, 'reading')
        assert.match(state.left, /^Chapter Three\s+Three-1 /)
        assert.equal(await contentsOpen(app), false)
        // Reading mode again: ← turns back to the end of Chapter Two.
        assert.equal((await app.press('ArrowLeft')).chapter, 'Chapter Two')
        await app.close()
    })

    test('Back closes the list without moving, back to Bar focus on Contents', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const reading = await app.press('ArrowRight')
        await openFromBar(app, 'Contents')
        await pressQuietly(app, 'ArrowDown')
        assert.equal(await app.back(), true)
        const state = await app.state()
        assert.equal(state.mode, 'bar')
        assert.equal(state.position, reading.position)
        assert.equal(await contentsOpen(app), false)
        assert.equal(await focusedText(app), 'Contents')
        assert.equal(await returnChip(app), null, 'no jump, no Return chip')
        await app.close()
    })

    test('nested entries are indented, all expanded, and jump too', async () => {
        const app = await reader.launch()
        await app.open(nested)
        await openFromBar(app, 'Contents')
        const entries = await contentsEntries(app)
        assert.deepEqual(entries.map(e => e.label), ['Part One', 'Chapter 1', 'Chapter 2', 'Part Two'])
        const [part, first, second, partTwo] = entries.map(e => e.x)
        assert.ok(first > part, 'a nested entry is indented')
        assert.equal(second, first)
        assert.equal(partTwo, part)

        await pressQuietly(app, 'ArrowDown')
        await pressQuietly(app, 'ArrowDown')
        assert.equal(await focusedText(app), 'Chapter 2')
        await app.press('Enter')
        await app.page.waitForFunction(() => window.reportedStates.at(-1).chapter === 'Chapter 2')
        assert.match((await app.state()).left, /^Chapter 2\s+c2-1 /)
        await app.close()
    })

    test("lists a PDF's outline and jumps to a chapter's page", async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        await app.press('ArrowRight') // pages 2–3, in Chapter One
        await openFromBar(app, 'Contents')
        const entries = await contentsEntries(app)
        assert.deepEqual(entries.map(e => [e.label, e.current]), [['Chapter One', true], ['Chapter Two', false]])
        await pressQuietly(app, 'ArrowDown')
        await app.press('Enter')
        await app.page.waitForFunction(() => window.reportedStates.at(-1).chapter === 'Chapter Two')
        const state = await app.state()
        assert.equal(state.mode, 'reading')
        assert.equal(firstLine(state.left), 'Page 10')
        assert.equal(state.pageLabel, 'Pages 10–11 of 45')
        await app.close()
    })

    test('on a PDF cover, before any chapter, nothing is highlighted', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        await openFromBar(app, 'Contents')
        assert.deepEqual((await contentsEntries(app)).map(e => e.current), [false, false])
        assert.equal(await focusedText(app), 'Chapter One')
        await app.close()
    })
})

describe('Go to %', () => {
    test('opens at the current percent; ←/→ move 1%, ↑/↓ move 10%, within 0–100%', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        const state = await openFromBar(app, 'Go to %')
        assert.equal(state.mode, 'go-to')
        assert.deepEqual(await slider(app), { percent: '0%', chapter: '' })
        await pressQuietly(app, 'ArrowLeft')
        assert.equal(await percentOf(app), 0, 'stops at 0%')
        await pressQuietly(app, 'ArrowRight')
        await pressQuietly(app, 'ArrowRight')
        assert.equal(await percentOf(app), 2)
        await pressQuietly(app, 'ArrowUp')
        assert.equal(await percentOf(app), 12)
        await pressQuietly(app, 'ArrowLeft')
        assert.equal(await percentOf(app), 11)
        await pressQuietly(app, 'ArrowDown')
        assert.equal(await percentOf(app), 1)
        for (let i = 0; i < 11; i++) await app.page.keyboard.press('ArrowUp')
        assert.equal(await percentOf(app), 100, 'stops at 100%')
        await app.close()
    })

    test('holding ←/→ speeds up', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        await openFromBar(app, 'Go to %')
        // The remote repeats a held key: the first press, then repeats.
        await app.page.keyboard.down('ArrowRight')
        for (let i = 0; i < 4; i++) await app.page.keyboard.down('ArrowRight')
        assert.equal(await percentOf(app), 5, 'a short hold moves 1% per repeat')
        for (let i = 0; i < 25; i++) await app.page.keyboard.down('ArrowRight')
        await app.page.keyboard.up('ArrowRight')
        assert.ok(await percentOf(app) > 30, 'a long hold moves faster')

        // A fresh press starts slow again.
        const held = await percentOf(app)
        await pressQuietly(app, 'ArrowLeft')
        assert.equal(await percentOf(app), held - 1)
        await app.close()
    })

    test('the target chapter name updates live', async () => {
        const app = await reader.launch()
        const start = await app.open(chapters)
        await openFromBar(app, 'Go to %')
        assert.deepEqual(await slider(app), { percent: `${Math.round(start.progress * 100)}%`, chapter: 'Chapter One' })
        for (let i = 0; i < 10; i++) await app.page.keyboard.press('ArrowUp')
        await app.page.waitForFunction(() => document.querySelector('#go-to .chapter').textContent === 'Chapter Three')
        for (let i = 0; i < 5; i++) await app.page.keyboard.press('ArrowDown')
        await app.page.waitForFunction(() => document.querySelector('#go-to .chapter').textContent === 'Chapter Two')
        assert.equal(await percentOf(app), 50)
        await app.close()
    })

    test('OK jumps to the chosen percent', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        await openFromBar(app, 'Go to %')
        for (let i = 0; i < 5; i++) await app.page.keyboard.press('ArrowUp')
        await app.page.waitForFunction(() => document.querySelector('#go-to .chapter').textContent === 'Chapter Two')
        await app.press('Enter')
        await app.page.waitForFunction(() => window.reportedStates.at(-1).progress > 0)
        const state = await app.state()
        assert.equal(state.mode, 'reading')
        assert.equal(Math.round(state.progress * 100), 50)
        assert.equal(state.chapter, 'Chapter Two')
        assert.equal(await slider(app), null)
        await app.close()
    })

    test('OK jumps in an EPUB too', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await openFromBar(app, 'Go to %')
        for (let i = 0; i < 10; i++) await app.page.keyboard.press('ArrowUp')
        await app.press('Enter')
        await app.page.waitForFunction(() => window.reportedStates.at(-1).chapter === 'Chapter Three')
        assert.equal((await app.state()).mode, 'reading')
        await app.close()
    })

    test('Back cancels without moving, back to Bar focus on Go to %', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const reading = await app.press('ArrowRight')
        await openFromBar(app, 'Go to %')
        await pressQuietly(app, 'ArrowUp')
        await pressQuietly(app, 'ArrowUp')
        assert.equal(await app.back(), true)
        await app.page.waitForTimeout(300)
        const state = await app.state()
        assert.equal(state.mode, 'bar')
        assert.equal(state.position, reading.position)
        assert.equal(await slider(app), null)
        assert.equal(await focusedText(app), 'Go to %')
        assert.equal(await returnChip(app), null)
        await app.close()
    })
})

describe('the Return chip', () => {
    test('after a jump it shows "Return to X%", ↑ focuses it, and OK restores the pre-jump Position', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const before = await app.press('ArrowRight')
        await openFromBar(app, 'Contents')
        await pressQuietly(app, 'ArrowDown')
        await app.press('Enter')
        await app.page.waitForFunction(() => window.reportedStates.at(-1).chapter === 'Chapter Three')
        assert.equal(await returnChip(app), `Return to ${Math.round(before.progress * 100)}%`)

        assert.equal((await app.press('ArrowUp')).mode, 'bar')
        assert.equal(await focusedText(app), `Return to ${Math.round(before.progress * 100)}%`)
        await app.press('Enter')
        await app.page.waitForFunction(position =>
            window.reportedStates.at(-1).position === position, before.position)
        const state = await app.state()
        assert.equal(state.mode, 'reading')
        assert.equal(state.left, before.left)
        assert.equal(await returnChip(app), null, 'used up')
        await app.close()
    })

    test('returns from a Go to % jump in an EPUB', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const before = await app.press('ArrowRight')
        await openFromBar(app, 'Go to %')
        for (let i = 0; i < 10; i++) await app.page.keyboard.press('ArrowUp')
        await app.press('Enter')
        await app.page.waitForFunction(() => window.reportedStates.at(-1).chapter === 'Chapter Three')
        await app.press('ArrowUp')
        await app.press('Enter')
        await app.page.waitForFunction(position =>
            window.reportedStates.at(-1).position === position, before.position)
        assert.equal((await app.state()).left, before.left)
        await app.close()
    })

    test('a jump to the Spread already on screen offers none', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        await app.press('ArrowRight') // pages 2–3, where Chapter One starts
        await openFromBar(app, 'Contents')
        const reading = await app.press('Enter')
        assert.equal(reading.mode, 'reading')
        await app.page.waitForTimeout(300)
        assert.equal(firstLine((await app.state()).left), 'Page 2')
        assert.equal(await returnChip(app), null)
        await app.close()
    })

    test('it leaves the bar after a few seconds but stays reachable in Bar focus', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        await openFromBar(app, 'Go to %')
        for (let i = 0; i < 3; i++) await app.page.keyboard.press('ArrowUp')
        await app.press('Enter')
        await app.page.waitForFunction(() => window.reportedStates.at(-1).progress > 0)
        assert.equal(await returnChip(app), 'Return to 0%')
        await app.page.waitForFunction(() => !document.querySelector('#top-bar .return').checkVisibility(),
            null, { timeout: 10_000 })

        await app.press('ArrowUp')
        assert.equal(await focusedText(app), 'Contents', 'once gone from the bar, Bar focus starts as usual')
        await focusButton(app, 'Return to 0%')
        await app.press('Enter')
        await app.page.waitForFunction(() => window.reportedStates.at(-1).position === '1')
        assert.equal(firstLine((await app.state()).right), 'Page 1')
        await app.close()
    })

    test('a new book starts without one', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        await openFromBar(app, 'Go to %')
        await pressQuietly(app, 'ArrowUp')
        await app.press('Enter')
        await app.page.waitForFunction(() => window.reportedStates.at(-1).progress > 0)
        assert.equal(await app.back(), true)
        await app.open(chapters)
        assert.equal(await returnChip(app), null)
        await app.press('ArrowUp')
        await focusButton(app, 'Shelf')
        await pressQuietly(app, 'ArrowRight')
        assert.equal(await focusedText(app), 'Shelf')
        await app.close()
    })
})
