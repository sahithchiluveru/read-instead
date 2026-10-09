// Drives the Reader in headless Chromium (the engine behind the TV's WebView) through
// the same key commands the remote sends, and observes what the Reader reports across
// the Reader session bridge.
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../..', import.meta.url))
const dist = join(root, 'dist')
const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
    '.epub': 'application/epub+zip', '.pdf': 'application/pdf',
}

// The TV's WebView lays out at 960×540 CSS px (1080p at 2× density).
const viewport = { width: 960, height: 540 }

// books: { 'name.epub': Buffer } served at /test-books/name.epub.
export const startReader = async books => {
    execFileSync(process.execPath, [join(root, 'scripts/build.mjs')])
    const server = createServer(async (req, res) => {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
        const book = path.startsWith('/test-books/') && books[path.slice('/test-books/'.length)]
        try {
            const body = book || await readFile(join(dist, normalize(path)))
            res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
            res.end(body)
        } catch {
            res.writeHead(404).end()
        }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const browser = await chromium.launch()

    // A fresh app launch. savedPositions plays the native side's persisted Positions.
    const launch = async (savedPositions = {}) => {
        const context = await browser.newContext({ viewport })
        const page = await context.newPage()
        page.on('pageerror', error => console.error('page error:', error))
        await page.addInitScript(saved => {
            window.reportedStates = []
            window.ReadInsteadNative = {
                loadPosition: bookId => saved[bookId] ?? null,
                onReaderState: json => window.reportedStates.push(JSON.parse(json)),
            }
        }, savedPositions)
        await page.goto(`${origin}/src/index.html`)
        return new App(page, context)
    }

    return {
        launch,
        close: async () => {
            await browser.close()
            await new Promise(resolve => server.close(resolve))
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
