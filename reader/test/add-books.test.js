import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { renderSVG } from 'uqr'
import { startReader } from './support/reader-harness.js'

const address = '192.168.1.50:8765'
const links = [
    { address, url: `http://${address}/?k=first-key`, error: null },
    { address, url: `http://${address}/?k=second-key`, error: null },
]

let reader
before(async () => {
    reader = await startReader({})
})
after(() => reader.close())

// The QR code's modules, to compare against what a URL should encode to.
const qrPath = svg => svg.match(/<path[^>]* d="([^"]+)"/)[1]
const shownQr = app => app.page.evaluate(() =>
    document.querySelector('#add-books-screen .qr path')?.getAttribute('d'))

// On the empty Shelf, the Add books tile has focus: press OK.
const openAddBooks = async app => {
    assert.equal(await app.page.evaluate(() => document.activeElement.id), 'add-books')
    await app.page.keyboard.press('Enter')
}

describe('the Add books screen', () => {
    test('shows a QR code of the Phone Page link and the written address', async () => {
        const app = await reader.launch({ links })
        await openAddBooks(app)
        assert.equal(await app.page.isVisible('#add-books-screen'), true)
        assert.equal(await app.page.isVisible('#shelf'), false)
        assert.equal(await shownQr(app), qrPath(renderSVG(links[0].url)))
        assert.match(await app.page.textContent('#add-books-screen'), /192\.168\.1\.50:8765/)
        await app.close()
    })

    test('Reset key asks for a second press, then shows the new key', async () => {
        const app = await reader.launch({ links })
        await openAddBooks(app)
        assert.equal(await app.page.evaluate(() => document.activeElement.id), 'reset-key')
        await app.page.keyboard.press('Enter')
        assert.equal(await app.page.evaluate(() => window.keyResets), 0)
        assert.match(await app.page.textContent('#reset-key'), /again/i)
        await app.page.keyboard.press('Enter')
        assert.equal(await app.page.evaluate(() => window.keyResets), 1)
        assert.equal(await shownQr(app), qrPath(renderSVG(links[1].url)))
        await app.close()
    })

    test('Back returns to the Shelf with the tile focused', async () => {
        const app = await reader.launch({ links })
        await openAddBooks(app)
        assert.equal(await app.back(), true)
        assert.equal(await app.page.isVisible('#shelf'), true)
        assert.equal(await app.page.isVisible('#add-books-screen'), false)
        assert.equal(await app.page.evaluate(() => document.activeElement.id), 'add-books')
        await app.close()
    })

    test('off the network it says to connect the TV to Wi-Fi', async () => {
        const app = await reader.launch()
        await openAddBooks(app)
        assert.match(await app.page.textContent('#add-books-screen'), /Connect the TV to Wi-Fi/)
        assert.equal(await shownQr(app), undefined)
        await app.close()
    })
})
