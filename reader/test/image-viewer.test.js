import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { fixedLayoutEpub, picturesEpub } from './support/epub-fixtures.js'
import { bookPdf } from './support/pdf-fixtures.js'
import { startReader } from './support/reader-harness.js'

const pictures = { id: 'pictures', format: 'epub' }
const fixedLayout = { id: 'fixed-layout', format: 'epub' }
const pdfBook = { id: 'book', format: 'pdf' }

let reader
before(async () => {
    reader = await startReader({ pictures: picturesEpub(), 'fixed-layout': fixedLayoutEpub(), book: bookPdf() })
})
after(() => reader.close())

// Press a key that shouldn't report a new state, and give it time to (wrongly) do so.
const pressQuietly = async (app, key) => {
    await app.page.keyboard.press(key)
    await app.page.waitForTimeout(150)
}

// The image viewer as shown: the image's natural size (which tells the fixture's images
// apart) and its size on screen, or null while it's closed. Waits for the image to load.
const viewer = async app => {
    const open = await app.page.evaluate(() => document.getElementById('image-viewer')?.checkVisibility() ?? false)
    if (!open) return null
    await app.page.waitForFunction(() => document.querySelector('#image-viewer img').complete)
    return app.page.evaluate(() => {
        const image = document.querySelector('#image-viewer img')
        const { width, height } = image.getBoundingClientRect()
        // object-fit: contain draws the image within its box; this is the drawn size.
        const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
        return {
            natural: [image.naturalWidth, image.naturalHeight],
            shown: [Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale)],
            box: [Math.round(width), Math.round(height)],
        }
    })
}

// Open the pictures book and turn to the Spread starting the chapter.
const openAt = async (app, chapter) => turnTo(app, await app.open(pictures), chapter)
const turnTo = async (app, state, chapter) => {
    for (let i = 0; i < 10 && state.chapter !== chapter; i++) state = await app.press('ArrowRight')
    assert.equal(state.chapter, chapter)
    return state
}

describe('Image viewer', () => {
    test("OK opens the Spread's first image full screen, without moving", async () => {
        const app = await reader.launch()
        const reading = await openAt(app, 'Maps')
        const state = await app.press('Enter')
        assert.equal(state.mode, 'image-viewer')
        assert.equal(state.position, reading.position)
        const shown = await viewer(app)
        assert.deepEqual(shown.natural, [400, 300], 'the map, the first of the two images')
        assert.deepEqual(shown.box, [960, 540], 'the viewer fills the screen')
        assert.deepEqual(shown.shown, [720, 540], 'the image is scaled up to fit, uncropped')
        await app.close()
    })

    test('Back closes the viewer, back to Reading mode at the same Position', async () => {
        const app = await reader.launch()
        const reading = await openAt(app, 'Maps')
        await app.press('Enter')
        assert.equal(await app.back(), true)
        const state = await app.state()
        assert.equal(state.mode, 'reading')
        assert.equal(state.position, reading.position)
        assert.equal(await viewer(app), null)
        // Reading mode again: → turns the Spread, and OK opens the image again.
        assert.notEqual((await app.press('ArrowRight')).position, reading.position)
        await app.press('ArrowLeft')
        assert.equal((await app.press('Enter')).mode, 'image-viewer')
        await app.close()
    })

    test('the remote keys do nothing while it is open', async () => {
        const app = await reader.launch()
        const reading = await openAt(app, 'Maps')
        await app.press('Enter')
        const count = await app.stateCount()
        for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter']) await pressQuietly(app, key)
        assert.equal(await app.stateCount(), count, 'no turn, no Bar focus')
        assert.deepEqual((await viewer(app)).natural, [400, 300])
        assert.equal(await app.back(), true)
        assert.equal((await app.state()).position, reading.position)
        await app.close()
    })

    test('OK on a Spread without images still does nothing', async () => {
        const app = await reader.launch()
        const opened = await app.open(pictures)
        await pressQuietly(app, 'Enter')
        assert.equal((await app.state()).mode, 'reading')
        assert.equal(await viewer(app), null)

        // Later in the chapter with the images, past the Spread showing them.
        await turnTo(app, opened, 'Maps')
        const later = await app.press('ArrowRight')
        assert.equal(later.chapter, 'Maps')
        const count = await app.stateCount()
        await pressQuietly(app, 'Enter')
        assert.equal(await app.stateCount(), count)
        assert.equal(await viewer(app), null)
        await app.close()
    })

    test('an image drawn in SVG, as on cover pages, opens too', async () => {
        const app = await reader.launch()
        await openAt(app, 'Plates')
        assert.equal((await app.press('Enter')).mode, 'image-viewer')
        const shown = await viewer(app)
        assert.deepEqual(shown.natural, [600, 400])
        assert.deepEqual(shown.shown, [810, 540])
        await app.close()
    })

    test('a fixed-layout page with a picture opens it', async () => {
        const app = await reader.launch()
        await app.open(fixedLayout)
        await pressQuietly(app, 'Enter') // the cover, alone
        assert.equal((await app.state()).mode, 'reading')
        const spread = await app.press('ArrowRight') // pages 2–3
        assert.equal((await app.press('Enter')).mode, 'image-viewer')
        assert.deepEqual((await viewer(app)).natural, [500, 700])
        assert.equal(await app.back(), true)
        assert.equal((await app.state()).position, spread.position)
        await app.close()
    })

    test('OK pressed while the Spread is turning does nothing', async () => {
        const app = await reader.launch()
        const maps = await openAt(app, 'Maps')
        // → away from the Spread with the images, and OK at once, before the next is shown:
        // no image opens over a Spread that's leaving.
        await app.page.keyboard.press('ArrowRight')
        await app.page.keyboard.press('Enter')
        await app.page.waitForFunction(position => window.reportedStates.at(-1).position !== position,
            maps.position)
        await app.page.waitForTimeout(150)
        const state = await app.state()
        assert.notEqual(state.position, maps.position)
        assert.equal(state.mode, 'reading')
        assert.equal(await viewer(app), null)
        await app.close()
    })

    test('a PDF has no image viewer: OK does nothing (it has Fit-width)', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        await app.page.waitForFunction(() => window.reportedStates.at(-1)?.format === 'pdf')
        const count = await app.stateCount()
        await pressQuietly(app, 'Enter')
        assert.equal(await app.stateCount(), count)
        assert.equal(await viewer(app), null)
        await app.close()
    })
})
