// Drives the Reader in headless Chromium (the engine behind the TV's WebView) through
// the same key commands the remote sends, and observes what the Reader reports across
// the Reader session bridge.
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../..', import.meta.url))
const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
}

// The TV's WebView lays out at 960×540 CSS px (1080p at 2× density).
const viewport = { width: 960, height: 540 }

// Plays the TV's Library: books are { id: Buffer } served at /books/<id>, covers are
// { id: string } (SVG) served at /covers/<id>, where the Android shell serves them.
export const startReader = async (books, covers = {}) => {
    // Each test file builds its own copy, so parallel test files don't race on dist/.
    const dist = await mkdtemp(join(tmpdir(), 'read-instead-reader-'))
    execFileSync(process.execPath, [join(root, 'scripts/build.mjs'), dist])
    const server = createServer(async (req, res) => {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
        const [, collection, id] = path.match(/^\/(books|covers)\/([^/]+)$/) ?? []
        try {
            const body = collection === 'books' ? books[id]
                : collection === 'covers' ? covers[id]
                : await readFile(join(dist, normalize(path)))
            if (body === undefined) throw new Error('not found')
            const type = collection === 'covers' ? types['.svg'] : types[extname(path)]
            res.writeHead(200, { 'content-type': type ?? 'application/octet-stream' })
            res.end(body)
        } catch {
            res.writeHead(404).end()
        }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const browser = await chromium.launch()

    // A fresh app launch. library is the Shelf's book records, in the native side's order
    // (tests change window.libraryBooks to add books); positions plays the persisted
    // Positions; links are what successive calls for the Phone Page link return (the
    // first, then one per key reset); settings plays the persisted reader settings, which
    // the page's window.savedSettings shows as they're saved; bookSettings plays each
    // book's own persisted settings ({ id: { name: value } }), shown the same way in
    // window.savedBookSettings.
    const launch = async ({ library = [], positions = {}, links = [], settings = {}, bookSettings = {} } = {}) => {
        const context = await browser.newContext({ viewport })
        const page = await context.newPage()
        page.on('pageerror', error => console.error('page error:', error))
        await page.addInitScript(({ library, positions, links, settings, bookSettings }) => {
            window.libraryBooks = library
            window.ReadInsteadLibrary = { books: () => JSON.stringify(window.libraryBooks) }
            window.reportedStates = []
            window.ReadInsteadNative = {
                loadPosition: bookId => positions[bookId] ?? null,
                onReaderState: json => window.reportedStates.push(JSON.parse(json)),
            }
            window.savedSettings = { ...settings }
            window.savedBookSettings = structuredClone(bookSettings)
            window.ReadInsteadSettings = {
                load: () => JSON.stringify(window.savedSettings),
                save: (name, value) => { window.savedSettings[name] = value },
                loadBook: bookId => JSON.stringify(window.savedBookSettings[bookId] ?? {}),
                saveBook: (bookId, name, value) => {
                    window.savedBookSettings[bookId] = { ...window.savedBookSettings[bookId], [name]: value }
                },
            }
            let link = 0
            window.keyResets = 0
            window.ReadInsteadPhone = {
                link: () => JSON.stringify(links[link] ?? { address: null, url: null, error: null }),
                resetKey: () => {
                    window.keyResets++
                    link++
                    return window.ReadInsteadPhone.link()
                },
            }
        }, { library, positions, links, settings, bookSettings })
        await page.goto(`${origin}/src/index.html`)
        return new App(page, context)
    }

    return {
        launch,
        close: async () => {
            await browser.close()
            await new Promise(resolve => server.close(resolve))
            await rm(dist, { recursive: true, force: true })
        },
    }
}

class App {
    constructor(page, context) {
        this.page = page
        this.context = context
    }

    stateCount() {
        return this.page.evaluate(() => window.reportedStates.length)
    }

    // The latest state the Reader reported.
    state() {
        return this.page.evaluate(() => window.reportedStates.at(-1))
    }

    async #nextState(action) {
        const before = await this.stateCount()
        await action()
        await this.page.waitForFunction(n => window.reportedStates.length > n, before)
        // Let any follow-up layout (e.g. late image loads) settle into the final state.
        await this.page.evaluate(() => new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))))
        return this.state()
    }

    // Open a book ({ id, format }) the way the Shelf does.
    open(book) {
        return this.#nextState(() => this.page.evaluate(book => { window.readInstead.open(book) }, book))
    }

    // Press a remote key and resolve to the state reported afterwards.
    press(key) {
        return this.#nextState(() => this.page.keyboard.press(key))
    }

    back() {
        return this.page.evaluate(() => window.readInstead.back())
    }

    close() {
        return this.context.close()
    }
}
