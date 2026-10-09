import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { comic } from './support/comic-fixtures.js'
import { startReader } from './support/reader-harness.js'

const book = id => ({ id, format: 'cbz' })
const rightToLeft = { manga: { 'right-to-left': 'true' } }
const fitWidth = { comic: { 'fit-width': 'true' } }

// The fixture's 1800×2700 px pages across the 864 px stage are 1296 px tall, in a 469 px high
// view: → scrolls by half the view, 234.5 px, down to the page's bottom at 827 px.
const STAGE = { width: 864, height: 469 }
const PAGE_HEIGHT = 1296
const STEP = STAGE.height / 2
const BOTTOM = PAGE_HEIGHT - STAGE.height

let reader
before(async () => {
    reader = await startReader({ comic: comic(9), manga: comic(9) })
})
after(() => reader.close())

// The pages on screen, left to right: each one's page number and box, with its left and
// right edges as fractions of the stage's width.
const shown = app => app.page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect()
    return [...document.querySelectorAll('#stage img')].map(img => {
        const box = img.getBoundingClientRect()
        return {
            page: Number(img.src.match(/\/pages\/(\d+)$/)[1]),
            left: (box.left - stage.left) / stage.width,
            right: (box.right - stage.left) / stage.width,
            width: box.width,
            height: box.height,
            scrolled: stage.top - box.top, // how far its top sits above the stage's
            loaded: img.complete && img.naturalWidth > 0,
        }
    }).sort((a, b) => a.left - b.left)
})
const pagesShown = async app => (await shown(app)).map(({ page }) => page)

const statusText = app => app.page.textContent('#top-bar .status')
const savedBookSettings = (app, id) => app.page.evaluate(id => window.savedBookSettings[id], id)
const visibleButtons = app => app.page.evaluate(() =>
    [...document.querySelectorAll('#top-bar button')].filter(b => b.checkVisibility()).map(b => b.textContent))
const rightToLeftPressed = app => app.page.getAttribute('[data-action="right-to-left"]', 'aria-pressed')
const fitWidthPressed = app => app.page.getAttribute('[data-action="fit-width"]', 'aria-pressed')
const focusedButton = app =>app.page.evaluate(() =>
    document.activeElement.closest('#top-bar') ? document.activeElement.textContent : null)

// From Reading mode, go into Bar focus on a Top Bar button.
const focusButton = async (app, label) => {
    await app.press('ArrowUp')
    for (let i = 0; i < 10 && await focusedButton(app) !== label; i++) await app.page.keyboard.press('ArrowRight')
    assert.equal(await focusedButton(app), label)
}

// From Reading mode, press a Top Bar button and resolve to the state reported afterwards.
const pressButton = async (app, label) => {
    await focusButton(app, label)
    return app.press('Enter')
}

// Fit-width: how far down the one page on screen is scrolled.
const scrolled = async app => {
    const pages = await shown(app)
    assert.equal(pages.length, 1, 'one page on screen')
    return pages[0].scrolled
}
const assertNear = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) <= 1, `${message}: ${actual} is not about ${expected}`)

// Press a key that shouldn't report a new state, and give it time to (wrongly) do so.
const pressQuietly = async (app, key) => {
    const count = await app.stateCount()
    await app.page.keyboard.press(key)
    await app.page.waitForTimeout(300)
    assert.equal(await app.stateCount(), count, `${key} did nothing`)
}

describe('reading a CBZ', () => {
    test('opens as two-page Spreads, the cover alone on the right, and ←/→ turn them', async () => {
        const app = await reader.launch()
        const cover = await app.open(book('comic'))
        assert.equal(cover.format, 'cbz')
        assert.equal(cover.position, '1')
        assert.equal(cover.pageLabel, 'Page 1 of 9')
        assert.equal(cover.progress, 0)
        assert.deepEqual([cover.left, cover.right, cover.chapter], ['', '', ''], 'pages are pictures, with no text')
        const [coverBox, ...others] = await shown(app)
        assert.equal(coverBox.page, 1)
        assert.equal(others.length, 0)
        assert.ok(coverBox.left >= 0.5, 'the cover sits on the right half')

        const spread = await app.press('ArrowRight')
        assert.deepEqual(await pagesShown(app), [2, 3])
        assert.equal(spread.position, '2')
        assert.equal(spread.pageLabel, 'Pages 2–3 of 9')
        assert.equal(spread.progress, 0.25)
        assert.equal(await statusText(app), 'Pages 2–3 of 9 · 25%')

        for (let i = 0; i < 3; i++) await app.press('ArrowRight')
        assert.deepEqual(await pagesShown(app), [8, 9])
        assert.equal((await app.state()).progress, 1)
        await pressQuietly(app, 'ArrowRight') // the end of the book
        await app.press('ArrowLeft')
        assert.deepEqual(await pagesShown(app), [6, 7])
        await app.close()
    })

    test('pages are fetched one at a time, only for the Spread on screen and the next', async () => {
        const app = await reader.launch()
        reader.requests.length = 0
        await app.open(book('comic'))
        await app.page.waitForTimeout(300) // let the next Spread load
        assert.deepEqual(new Set(reader.requests),
            new Set(['/books/comic/pages', '/books/comic/pages/1', '/books/comic/pages/2', '/books/comic/pages/3']))

        reader.requests.length = 0
        await app.press('ArrowRight')
        await app.page.waitForTimeout(300)
        assert.deepEqual(new Set(reader.requests), new Set(['/books/comic/pages/4', '/books/comic/pages/5']),
            'the Spread on screen was ready; only the one after it is fetched')
        assert.equal(await app.page.locator('#stage img').count(), 2)
        await app.close()
    })

    test('pages much larger than the screen are fitted into the Spread, loaded before they show', async () => {
        const app = await reader.launch()
        await app.open(book('comic'))
        await app.press('ArrowRight')
        const pages = await shown(app)
        const stage = await app.page.evaluate(() => document.getElementById('stage').getBoundingClientRect().toJSON())
        for (const page of pages) {
            assert.ok(page.loaded, `page ${page.page} is loaded before it's shown`)
            assert.ok(page.height <= stage.height + 0.5, `page ${page.page} fits the stage's height`)
            assert.ok(page.width <= stage.width / 2 + 0.5, `page ${page.page} fits its column`)
        }
        assert.ok(pages[0].right <= 0.5 && pages[1].left >= 0.5, 'one page each side of the spine')
        await app.close()
    })

    test('right to left: the Spread is mirrored, and → still goes forward', async () => {
        const app = await reader.launch({ bookSettings: rightToLeft })
        await app.open(book('manga'))
        const [cover] = await shown(app)
        assert.equal(cover.page, 1)
        assert.ok(cover.right <= 0.5, 'the cover sits on the left half')

        const spread = await app.press('ArrowRight')
        assert.deepEqual(await pagesShown(app), [3, 2], 'the first page is on the right')
        assert.equal(spread.position, '2')
        assert.equal(spread.pageLabel, 'Pages 2–3 of 9')
        await app.press('ArrowRight')
        assert.deepEqual(await pagesShown(app), [5, 4])
        await app.press('ArrowLeft')
        assert.deepEqual(await pagesShown(app), [3, 2])
        await app.close()
    })

    test('the Right to left button switches the book, saved for it', async () => {
        const app = await reader.launch()
        await app.open(book('comic'))
        await app.press('ArrowRight')
        await focusButton(app, 'Right to left')
        assert.deepEqual(await visibleButtons(app),
            ['Contents', 'Font', 'Theme', 'Go to %', 'Fit-width', 'Right to left', 'Hide bar', 'Shelf'])

        const mirrored = await app.press('Enter')
        assert.equal(mirrored.mode, 'bar', 'Bar focus stays on the button, to switch back')
        assert.equal(mirrored.position, '2')
        assert.deepEqual(await pagesShown(app), [3, 2])
        assert.deepEqual(await savedBookSettings(app, 'comic'), { 'right-to-left': 'true' })
        assert.equal(await rightToLeftPressed(app), 'true', 'the button shows it is on')

        await app.press('Enter')
        assert.deepEqual(await pagesShown(app), [2, 3])
        assert.deepEqual(await savedBookSettings(app, 'comic'), { 'right-to-left': 'false' })
        assert.equal(await rightToLeftPressed(app), 'false')
        await app.close()
    })

    test('the Right to left button shows a saved choice when the book opens', async () => {
        const app = await reader.launch({ bookSettings: rightToLeft })
        await app.open(book('manga'))
        assert.equal(await rightToLeftPressed(app), 'true')
        await app.back()
        await app.open(book('comic'))
        assert.equal(await rightToLeftPressed(app), 'false', 'another book starts from its own setting')
        await app.close()
    })

    test('a saved Position is restored', async () => {
        const app = await reader.launch({ positions: { comic: '5' } })
        const state = await app.open(book('comic'))
        assert.deepEqual(await pagesShown(app), [4, 5])
        assert.equal(state.position, '4')
        assert.equal(state.progress, 0.5)
        await app.close()
    })

    test('Contents is empty, and Go to % jumps', async () => {
        const app = await reader.launch()
        await app.open(book('comic'))
        await focusButton(app, 'Contents')
        await app.press('Enter')
        assert.equal((await app.state()).mode, 'contents')
        assert.equal(await app.page.locator('#contents li').count(), 0)
        assert.ok(await app.page.locator('#contents .empty').isVisible())
        await app.back() // to Bar focus
        await app.back() // to Reading mode

        await focusButton(app, 'Go to %')
        await app.page.keyboard.press('Enter')
        for (let i = 0; i < 5; i++) await app.page.keyboard.press('ArrowUp')
        const jumped = await app.press('Enter')
        assert.equal(jumped.progress, 0.5)
        assert.deepEqual(await pagesShown(app), [4, 5])
        await app.close()
    })

    test('the theme tints the background only, never the pages', async () => {
        const app = await reader.launch({ settings: { theme: 'dark' } })
        await app.open(book('comic'))
        const look = await app.page.evaluate(() => {
            const style = getComputedStyle(document.querySelector('#stage img'))
            return { filter: style.filter, blend: style.mixBlendMode, background: getComputedStyle(document.body).backgroundColor }
        })
        assert.deepEqual(look, { filter: 'none', blend: 'normal', background: 'rgb(28, 27, 31)' })
        await app.close()
    })

    test('the single-page layout shows one page at a time', async () => {
        const app = await reader.launch({ settings: { layout: 'single-page' } })
        const first = await app.open(book('comic'))
        assert.equal(first.pageLabel, 'Page 1 of 9')
        const second = await app.press('ArrowRight')
        assert.deepEqual(await pagesShown(app), [2])
        assert.equal(second.pageLabel, 'Page 2 of 9')
        const [page] = await shown(app)
        assert.ok(Math.abs((page.left + page.right) / 2 - 0.5) < 0.01, 'centred')
        await app.close()
    })

    test("OK opens the Spread's first page full screen", async () => {
        const app = await reader.launch({ bookSettings: rightToLeft })
        await app.open(book('manga'))
        await app.press('ArrowRight')
        const state = await app.press('Enter')
        assert.equal(state.mode, 'image-viewer')
        assert.match(await app.page.getAttribute('#image-viewer img', 'src'), /\/books\/manga\/pages\/2$/)
        await app.close()
    })
})

describe('Fit-width on a CBZ', () => {
    test('shows one page across the stage width, saved for the book', async () => {
        const app = await reader.launch()
        await app.open(book('comic'))
        await app.press('ArrowRight')

        const fitted = await pressButton(app, 'Fit-width')
        assert.equal(fitted.mode, 'bar', 'Bar focus stays on Fit-width, to switch back')
        assert.equal(fitted.position, '2')
        assert.equal(fitted.pageLabel, 'Page 2 of 9')
        assert.equal(await statusText(app), 'Page 2 of 9 · 13%')
        const [page, ...others] = await shown(app)
        assert.equal(others.length, 0)
        assert.equal(page.page, 2)
        assert.ok(page.loaded)
        assertNear(page.width, STAGE.width, 'fills the width')
        assertNear(page.height, PAGE_HEIGHT, 'keeps its shape')
        assert.equal(page.scrolled, 0)
        assert.equal(page.left, 0)
        assert.deepEqual(await savedBookSettings(app, 'comic'), { 'fit-width': 'true' })
        assert.equal(await fitWidthPressed(app), 'true', 'the button shows it is on')

        const spread = await app.press('Enter') // still on Fit-width
        assert.deepEqual(await pagesShown(app), [2, 3])
        assert.equal(spread.pageLabel, 'Pages 2–3 of 9')
        assert.deepEqual(await savedBookSettings(app, 'comic'), { 'fit-width': 'false' })
        assert.equal(await fitWidthPressed(app), 'false')
        await app.close()
    })

    test('a saved Fit-width shows when the book opens, and other books keep their own', async () => {
        const app = await reader.launch({ bookSettings: fitWidth })
        await app.open(book('comic'))
        assert.equal(await fitWidthPressed(app), 'true')
        assert.equal((await shown(app)).length, 1)
        await app.back()
        await app.open(book('manga'))
        assert.equal(await fitWidthPressed(app), 'false')
        const [cover] = await shown(app)
        assert.ok(cover.width < STAGE.width / 2, 'the cover is fitted whole')
        await app.close()
    })

    test('→ scrolls down half a screen at a time, then moves to the top of the next page', async () => {
        const app = await reader.launch({ bookSettings: fitWidth })
        const opened = await app.open(book('comic'))
        assert.equal(opened.pageLabel, 'Page 1 of 9')
        assert.equal(await scrolled(app), 0)

        const positions = new Set([opened.position])
        for (const expected of [STEP, 2 * STEP, 3 * STEP, BOTTOM]) {
            const state = await app.press('ArrowRight')
            assert.deepEqual(await pagesShown(app), [1])
            assert.equal(state.pageLabel, 'Page 1 of 9')
            assert.equal(state.progress, 0)
            assert.match(state.position, /^1@0\.\d+/)
            assertNear(await scrolled(app), expected, 'scrolled down')
            positions.add(state.position)
        }
        assert.equal(positions.size, 5, 'every step is a new Position')
        assert.equal(await statusText(app), 'Page 1 of 9 · 0%')

        const next = await app.press('ArrowRight')
        assert.deepEqual(await pagesShown(app), [2])
        assert.equal(next.position, '2')
        assert.equal(next.pageLabel, 'Page 2 of 9')
        assert.equal(next.progress, 1 / 8)
        assert.equal(await scrolled(app), 0)
        await app.close()
    })

    test('← scrolls up half a screen, then moves to the bottom of the previous page', async () => {
        const app = await reader.launch({ bookSettings: fitWidth, positions: { comic: '2' } })
        await app.open(book('comic'))
        assert.deepEqual(await pagesShown(app), [2])

        const previous = await app.press('ArrowLeft')
        assert.deepEqual(await pagesShown(app), [1])
        assert.equal(previous.pageLabel, 'Page 1 of 9')
        assertNear(await scrolled(app), BOTTOM, 'at the bottom of page 1')
        for (const expected of [BOTTOM - STEP, BOTTOM - 2 * STEP, BOTTOM - 3 * STEP, 0]) {
            await app.press('ArrowLeft')
            assert.deepEqual(await pagesShown(app), [1])
            assertNear(await scrolled(app), expected, 'scrolled up')
        }
        await pressQuietly(app, 'ArrowLeft') // the top of the book
        await app.close()
    })

    test('→ at the bottom of the last page does nothing', async () => {
        const app = await reader.launch({ bookSettings: fitWidth, positions: { comic: '9' } })
        await app.open(book('comic'))
        assert.deepEqual(await pagesShown(app), [9])
        for (let i = 0; i < 4; i++) await app.press('ArrowRight')
        assertNear(await scrolled(app), BOTTOM, 'at the bottom')
        await pressQuietly(app, 'ArrowRight')
        await app.close()
    })

    test('the Position keeps the scroll offset and restores it exactly', async () => {
        const app = await reader.launch({ bookSettings: fitWidth })
        await app.open(book('comic'))
        for (let i = 0; i < 7; i++) await app.press('ArrowRight')
        const saved = await app.state()
        assert.deepEqual(await pagesShown(app), [2])
        const offset = await scrolled(app)
        assertNear(offset, 2 * STEP, 'two steps into page 2')
        await app.close()

        const relaunched = await reader.launch({ bookSettings: fitWidth, positions: { comic: saved.position } })
        const restored = await relaunched.open(book('comic'))
        assert.equal(restored.position, saved.position)
        assert.deepEqual(await pagesShown(relaunched), [2])
        assert.equal(await scrolled(relaunched), offset)
        await relaunched.press('ArrowRight')
        assertNear(await scrolled(relaunched), 3 * STEP, 'a step further')
        await relaunched.close()
    })

    test("a scrolled Position opens on its page's Spread without Fit-width", async () => {
        const app = await reader.launch({ positions: { comic: '3@0.25' } })
        const state = await app.open(book('comic'))
        assert.deepEqual(await pagesShown(app), [2, 3])
        assert.equal(state.position, '2')
        await app.close()
    })

    test('only the page on screen and the next one are fetched and kept', async () => {
        const app = await reader.launch({ bookSettings: fitWidth })
        reader.requests.length = 0
        await app.open(book('comic'))
        await app.page.waitForTimeout(300) // let the next page load
        assert.deepEqual(new Set(reader.requests),
            new Set(['/books/comic/pages', '/books/comic/pages/1', '/books/comic/pages/2']))

        reader.requests.length = 0
        for (let i = 0; i < 4; i++) await app.press('ArrowRight') // scrolling fetches nothing
        assert.deepEqual(reader.requests, [])
        await app.press('ArrowRight') // to page 2
        await app.page.waitForTimeout(300)
        assert.deepEqual(reader.requests, ['/books/comic/pages/3'], 'page 2 was ready; only page 3 is fetched')
        assert.equal(await app.page.locator('#stage img').count(), 1)
        await app.close()
    })

    test('Right to left changes nothing in Fit-width, and still applies once it is off', async () => {
        const app = await reader.launch({ bookSettings: fitWidth })
        await app.open(book('comic'))
        const before = await app.press('ArrowRight')
        const offset = await scrolled(app)

        const mirrored = await pressButton(app, 'Right to left')
        assert.equal(mirrored.position, before.position)
        const [page] = await shown(app)
        assert.equal(page.page, 1)
        assert.equal(page.left, 0)
        assertNear(page.width, STAGE.width, 'still fills the width')
        assert.equal(page.scrolled, offset)
        assert.deepEqual(await savedBookSettings(app, 'comic'), { 'fit-width': 'true', 'right-to-left': 'true' })

        await app.page.keyboard.press('ArrowLeft') // onto Fit-width
        assert.equal(await focusedButton(app), 'Fit-width')
        await app.press('Enter')
        const [cover] = await shown(app)
        assert.ok(cover.right <= 0.5, 'the cover sits on the left half, mirrored')
        await app.close()
    })

    test('OK opens the page full screen, and Go to % jumps to the top of a page', async () => {
        const app = await reader.launch({ bookSettings: fitWidth })
        await app.open(book('comic'))
        await app.press('ArrowRight')
        const viewer = await app.press('Enter')
        assert.equal(viewer.mode, 'image-viewer')
        assert.match(await app.page.getAttribute('#image-viewer img', 'src'), /\/books\/comic\/pages\/1$/)
        await app.back()

        await focusButton(app, 'Go to %')
        await app.page.keyboard.press('Enter')
        for (let i = 0; i < 5; i++) await app.page.keyboard.press('ArrowUp')
        const jumped = await app.press('Enter')
        assert.equal(jumped.progress, 0.5)
        assert.equal(jumped.position, '5')
        assert.deepEqual(await pagesShown(app), [5])
        assert.equal(await scrolled(app), 0)
        await app.close()
    })
})
