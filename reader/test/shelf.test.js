import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chaptersEpub } from './support/epub-fixtures.js'
import { paperPdf } from './support/pdf-fixtures.js'
import { startReader } from './support/reader-harness.js'

const record = (id, title, more = {}) => ({
    id, format: 'epub', title, author: null, progress: 0, unreadable: false, coverType: null, ...more,
})
const chapters = record('chapters', 'Chapters Fixture', {
    author: 'A. Writer', progress: 0.25, coverType: 'image/svg+xml',
})
const paper = record('paper', 'A Paper', { format: 'pdf' })
const broken = record('broken', 'broken', { unreadable: true })
const coverSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#a65a2a"/></svg>'
const wideCoverSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect width="400" height="120" fill="#2a211a"/></svg>'
const address ='192.168.1.50:8765'
const links = [{ address, url: `http://${address}/?k=the-key`, error: null }]

let reader
before(async () => {
    reader = await startReader({ chapters: chaptersEpub(), paper: paperPdf() }, { chapters: coverSvg, wide: wideCoverSvg })
})
after(() => reader.close())

// What each Shelf tile shows, in order.
const tiles = app => app.page.evaluate(() => [...document.querySelectorAll('#shelf .grid button')].map(tile => ({
    id: tile.dataset.id ?? tile.id,
    title: tile.querySelector('.title')?.textContent,
    progress: tile.querySelector('.progress span')?.style.width,
    note: tile.querySelector('.unreadable')?.textContent,
})))
// How a tile's cover image fits its 2:3 box, once the image has loaded.
const coverFit = (app, id) => app.page.evaluate(async id => {
    const img = document.querySelector(`[data-id="${id}"] img`)
    await img.decode()
    await new Promise(requestAnimationFrame)
    return getComputedStyle(img).objectFit
}, id)
const focused = app =>app.page.evaluate(() => document.activeElement.dataset.id ?? document.activeElement.id)
const shelfVisible = app => app.page.isVisible('#shelf')
// The phone deletes a book: the native Library drops it, then tells the reader.
const deleteBook = (app, id) => app.page.evaluate(id => {
    const book = window.libraryBooks.find(book => book.id === id)
    window.libraryBooks = window.libraryBooks.filter(book => book.id !== id)
    window.readInstead.bookDeleted(book)
}, id)

describe('the Shelf', () => {
    test('is the opening screen: covers in order, a progress bar each, then Add books', async () => {
        const app = await reader.launch({ library: [chapters, paper, broken], links })
        assert.equal(await shelfVisible(app), true)
        assert.deepEqual(await tiles(app), [
            { id: 'chapters', title: 'Chapters Fixture', progress: '25%', note: undefined },
            { id: 'paper', title: 'A Paper', progress: '0%', note: undefined },
            { id: 'broken', title: 'broken', progress: undefined, note: "Couldn't open this book" },
            { id: 'add-books', title: 'Add books', progress: undefined, note: undefined },
        ])
        assert.equal(await focused(app), 'chapters')
        assert.equal(await app.page.isVisible('#shelf .empty'), false)
        const cover = await app.page.evaluate(async () => {
            const img = document.querySelector('[data-id="chapters"] img')
            await img.decode()
            return { src: new URL(img.src).pathname, width: img.naturalWidth }
        })
        assert.deepEqual(cover, { src: '/covers/chapters', width: 200 })
        assert.equal(await coverFit(app, 'chapters'), 'cover', 'a portrait cover fills its tile')
        assert.equal(await app.back(), false) // Back on the Shelf leaves the app
        await app.close()
    })

    test('a wide cover (a comic whose first page is a banner) shows whole, not cropped', async () => {
        const app = await reader.launch({ library: [{ ...chapters, id: 'wide' }], links })
        assert.equal(await coverFit(app, 'wide'), 'contain')
        await app.close()
    })

    test('when empty, shows the QR code, the address and how to add books', async () => {
        const app = await reader.launch({ links })
        assert.equal(await app.page.isVisible('#shelf .empty .qr svg'), true)
        const text = await app.page.textContent('#shelf .empty')
        assert.match(text, /Scan with your phone to add books/)
        assert.match(text, /192\.168\.1\.50:8765/)
        assert.deepEqual((await tiles(app)).map(t => t.id), ['add-books'])
        assert.equal(await focused(app), 'add-books')
        await app.close()
    })

    test('the D-pad moves around the grid', async () => {
        const library = Array.from({ length: 7 }, (_, i) => record(`book-${i}`, `Book ${i}`))
        const app = await reader.launch({ library, links })
        const press = async key => {
            await app.page.keyboard.press(key)
            return focused(app)
        }
        // Six to a row: the seventh book and the Add books tile form the second row.
        assert.equal(await press('ArrowDown'), 'book-6')
        assert.equal(await press('ArrowRight'), 'add-books')
        assert.equal(await press('ArrowRight'), 'add-books')
        assert.equal(await press('ArrowUp'), 'book-1')
        assert.equal(await press('ArrowUp'), 'book-1')
        assert.equal(await press('ArrowLeft'), 'book-0')
        assert.equal(await press('ArrowLeft'), 'book-0')
        for (let i = 0; i < 5; i++) await press('ArrowRight')
        assert.equal(await press('ArrowDown'), 'add-books') // nothing below: the last tile
        await app.close()
    })

    test('OK opens a book at its saved Position, and Back returns to it', async () => {
        const app = await reader.launch({ library: [paper, chapters], positions: { paper: '3' }, links })
        await app.page.keyboard.press('ArrowRight')
        await app.page.keyboard.press('ArrowLeft')
        const state = await app.press('Enter')
        assert.equal(state.bookId, 'paper')
        assert.equal(state.position, '3')
        assert.equal(await shelfVisible(app), false)

        assert.equal(await app.back(), true)
        assert.deepEqual(await app.state(), { open: false })
        assert.equal(await shelfVisible(app), true)
        assert.equal(await focused(app), 'paper')
        await app.close()
    })

    test('Back refreshes the Shelf, so the book just read comes first with its new progress', async () => {
        const app = await reader.launch({ library: [paper, chapters], links })
        await app.page.keyboard.press('ArrowRight')
        await app.press('Enter')
        await app.press('ArrowRight')
        // The native side records the reading; the Library now lists chapters first.
        await app.page.evaluate(() => {
            const [paper, chapters] = window.libraryBooks
            window.libraryBooks = [{ ...chapters, progress: 0.5 }, paper]
        })
        await app.back()
        const [first] = await tiles(app)
        assert.deepEqual([first.id, first.progress], ['chapters', '50%'])
        assert.equal(await focused(app), 'chapters')
        await app.close()
    })

    test("an unreadable book doesn't open", async () => {
        const app = await reader.launch({ library: [broken], links })
        await app.page.keyboard.press('Enter')
        await app.page.waitForTimeout(300)
        assert.equal(await app.stateCount(), 0)
        assert.equal(await shelfVisible(app), true)
        await app.close()
    })

    test('a book arriving from the phone appears at once, with a toast', async () => {
        const app = await reader.launch({ library: [chapters], links })
        await app.page.keyboard.press('ArrowRight')
        await app.page.evaluate(paper => {
            window.libraryBooks = [paper, ...window.libraryBooks]
            window.readInstead.bookAdded(paper)
        }, paper)
        assert.deepEqual((await tiles(app)).map(t => t.id), ['paper', 'chapters', 'add-books'])
        assert.equal(await focused(app), 'add-books', 'focus stays where it was')
        assert.equal(await app.page.isVisible('#toast'), true)
        assert.equal(await app.page.textContent('#toast'), 'Added: A Paper')
        await app.page.waitForSelector('#toast', { state: 'hidden', timeout: 8000 })
        await app.close()
    })

    test('the first book replaces the empty state and takes focus', async () => {
        const app = await reader.launch({ links })
        await app.page.evaluate(paper => {
            window.libraryBooks = [paper]
            window.readInstead.bookAdded(paper)
        }, paper)
        assert.equal(await app.page.isVisible('#shelf .empty'), false)
        assert.equal(await focused(app), 'paper')
        await app.close()
    })

    test('a book deleted from the phone disappears, and focus moves to its neighbour', async () => {
        const library = [record('a', 'A'), record('b', 'B'), record('c', 'C')]
        const app = await reader.launch({ library, links })
        await app.page.keyboard.press('ArrowRight')
        assert.equal(await focused(app), 'b')
        await deleteBook(app, 'b')
        assert.deepEqual((await tiles(app)).map(t => t.id), ['a', 'c', 'add-books'])
        assert.equal(await focused(app), 'c')
        await deleteBook(app, 'a') // not the focused one: focus stays put
        assert.equal(await focused(app), 'c')
        await deleteBook(app, 'c')
        assert.equal(await app.page.isVisible('#shelf .empty'), true, 'the last one gone: the QR code is back')
        assert.equal(await focused(app), 'add-books')
        await app.close()
    })

    test('deleting the book open on the TV returns to the Shelf', async () => {
        const app = await reader.launch({ library: [chapters, paper], links })
        await app.open(chapters)
        await app.press('ArrowRight')
        await deleteBook(app, 'chapters')
        assert.deepEqual(await app.state(), { open: false })
        assert.equal(await shelfVisible(app), true)
        assert.deepEqual((await tiles(app)).map(t => t.id), ['paper', 'add-books'])
        assert.equal(await focused(app), 'paper')
        assert.equal(await app.page.textContent('#toast'), 'Deleted from your phone: Chapters Fixture')
        await app.close()
    })

    test('deleting another book while reading leaves the reading alone', async () => {
        const app = await reader.launch({ library: [chapters, paper], links })
        await app.open(chapters)
        const count = await app.stateCount()
        await deleteBook(app, 'paper')
        assert.equal(await app.stateCount(), count)
        assert.equal(await shelfVisible(app), false)
        assert.equal((await app.press('ArrowRight')).bookId, 'chapters')
        await app.close()
    })

    test('a book arriving mid-read shows the toast over the book', async () => {
        const app = await reader.launch({ library: [chapters], links })
        await app.open(chapters)
        await app.page.evaluate(paper => {
            window.libraryBooks = [paper, ...window.libraryBooks]
            window.readInstead.bookAdded(paper)
        }, paper)
        assert.equal(await app.page.textContent('#toast'), 'Added: A Paper')
        assert.equal(await shelfVisible(app), false)
        assert.equal((await app.press('ArrowRight')).bookId, 'chapters', 'still reading')
        await app.close()
    })
})
