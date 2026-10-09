import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { numberedWordsEpub } from './support/epub-fixtures.js'
import { bookPdf } from './support/pdf-fixtures.js'
import { startReader } from './support/reader-harness.js'

const numbered = { id: 'numbered', format: 'epub' }
const pdfBook = { id: 'book', format: 'pdf' }

let reader
before(async () => {
    reader = await startReader({ numbered: numberedWordsEpub(120), book: bookPdf() })
})
after(() => reader.close())

// The owner reads at 20 characters a second; the speed is kept in seconds per character.
const PER_SECOND = 20
const learned = (samples = 20) =>
    ({ 'reading-speed': JSON.stringify({ secondsPerCharacter: 1 / PER_SECOND, samples }) })

const statusText = app => app.page.textContent('#top-bar .status')
const savedSpeed = app => app.page.evaluate(() => {
    const saved = window.savedSettings['reading-speed']
    return saved ? JSON.parse(saved) : null
})
const characters = state => state.left.length + state.right.length
const minutesFor = (count, perSecond = PER_SECOND) => Math.max(1, Math.round(count / perSecond / 60))

// The page's clock stands still at a time the test moves on.
const fakeClock = async app => {
    let now = Date.parse('2026-10-09T20:00:00Z')
    await app.page.clock.setFixedTime(now)
    return async seconds => {
        now += seconds * 1000
        await app.page.clock.setFixedTime(now)
    }
}
// Read the Spread on screen at the owner's speed, then turn with →.
const readAndTurn = async (app, wait, state) => {
    await wait(characters(state) / PER_SECOND)
    return app.press('ArrowRight')
}

const focusedText = app => app.page.evaluate(() => document.activeElement?.textContent ?? null)
// Jump 10% ahead with Go to %: ↑ into Bar focus, → to its button, OK, ↑ and OK.
const jumpAhead = async app => {
    await app.press('ArrowUp')
    for (let i = 0; i < 12 && await focusedText(app) !== 'Go to %'; i++) await app.page.keyboard.press('ArrowRight')
    await app.press('Enter')
    await app.page.keyboard.press('ArrowUp')
    return app.press('Enter')
}

describe('time left in chapter', () => {
    test('is learned from → turns and shown once there are enough of them, then saved', async () => {
        const app = await reader.launch()
        const wait = await fakeClock(app)
        let state = await app.open(numbered)
        assert.equal(state.minutesLeftInChapter, null)
        for (let turn = 0; turn < 4; turn++) {
            state = await readAndTurn(app, wait, state)
            assert.equal(state.minutesLeftInChapter, null, `hidden after ${turn + 1} turns`)
            assert.doesNotMatch(await statusText(app), /min left/)
        }
        state = await readAndTurn(app, wait, state)
        assert.ok(state.charactersLeftInChapter > 10_000, `${state.charactersLeftInChapter}`)
        assert.equal(state.minutesLeftInChapter, minutesFor(state.charactersLeftInChapter))
        assert.match(await statusText(app),
            new RegExp(` · \\d+ pages left in chapter · ~${state.minutesLeftInChapter} min left in chapter$`))
        const saved = await savedSpeed(app)
        assert.equal(saved.samples, 5)
        assert.ok(Math.abs(saved.secondsPerCharacter * PER_SECOND - 1) < 0.01, JSON.stringify(saved))

        // It counts down with the chapter.
        const later = await readAndTurn(app, wait, state)
        assert.ok(later.charactersLeftInChapter < state.charactersLeftInChapter)
        assert.equal(later.minutesLeftInChapter, minutesFor(later.charactersLeftInChapter))
        await app.close()
    })

    test('leaves out idle gaps and jumps', async () => {
        const app = await reader.launch({ settings: learned() })
        const wait = await fakeClock(app)
        let state = await app.open(numbered)
        await wait(30 * 60) // dozed off
        state = await app.press('ArrowRight')
        assert.equal((await savedSpeed(app)).samples, 20)

        await wait(characters(state) / PER_SECOND)
        state = await jumpAhead(app)
        await wait(1)
        assert.equal((await savedSpeed(app)).samples, 20, 'a jump is no turn')

        await readAndTurn(app, wait, state)
        assert.equal((await savedSpeed(app)).samples, 21, 'the next normal turn counts')
        await app.close()
    })

    test('a saved speed is used at once, across books and restarts', async () => {
        const app = await reader.launch({ settings: learned() })
        const state = await app.open(numbered)
        assert.equal(state.minutesLeftInChapter, minutesFor(state.charactersLeftInChapter))
        assert.match(await statusText(app), new RegExp(` · ~${state.minutesLeftInChapter} min left in chapter$`))
        await app.close()
    })

    test('a PDF shows it for the chapter on screen, and nothing before the first chapter', async () => {
        // Slow enough that the fixture's short pages take minutes.
        const perSecond = 1
        const app = await reader.launch({
            settings: { 'reading-speed': JSON.stringify({ secondsPerCharacter: 1 / perSecond, samples: 20 }) },
        })
        const cover = await app.open(pdfBook)
        assert.equal(cover.minutesLeftInChapter, null)
        assert.equal(await statusText(app), 'Page 1 of 45 · 0%')

        const spread = await app.press('ArrowRight') // pages 2–3 of Chapter One, which runs to page 9
        const perPage = characters(spread) / 2
        assert.ok(Math.abs(spread.charactersLeftInChapter - 8 * perPage) < 8, `${spread.charactersLeftInChapter}`)
        assert.equal(spread.minutesLeftInChapter, minutesFor(spread.charactersLeftInChapter, perSecond))
        assert.equal(await statusText(app), `Chapter One · Pages 2–3 of 45 · ${Math.round(spread.progress * 100)}%` +
            ` · ~${spread.minutesLeftInChapter} min left in chapter`)

        const next = await app.press('ArrowRight')
        assert.ok(next.charactersLeftInChapter < spread.charactersLeftInChapter)
        await app.close()
    })
})
