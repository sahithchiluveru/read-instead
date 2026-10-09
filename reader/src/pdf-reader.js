import * as pdfjs from '../vendor/pdfjs/build/pdf.min.mjs'
import { LruCache } from './lru.js'
import { spreadCount, spreadPages } from './pdf-spreads.js'

const pdfjsUrl = new URL('../vendor/pdfjs/', import.meta.url).href
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsUrl + 'build/pdf.worker.min.mjs'

// Spreads rendered ahead of time, relative to the one on screen.
const PREFETCH_OFFSETS = [1, -1, 2]
// The Spread on screen plus every prefetched one, two pages each, so the
// visible pages are never evicted.
const CACHE_PAGES = (PREFETCH_OFFSETS.length + 1) * 2

// Two-page PDF reader: renders pages into offscreen canvases and swaps them in,
// so a turn to an already-rendered Spread costs no rendering at all.
export class PdfReader {
    format = 'pdf'
    #loading
    #doc
    #closed = false
    #stage
    #spread = 0
    #queue = Promise.resolve()
    #cache = new LruCache(CACHE_PAGES, (_, entry) => entry.then(canvas => {
        canvas.width = canvas.height = 0
    }, () => {}))

    constructor(stage) {
        this.#stage = stage
    }

    async open(url) {
        this.#loading = pdfjs.getDocument({
            url,
            wasmUrl: pdfjsUrl + 'wasm/',
            cMapUrl: pdfjsUrl + 'cmaps/',
            standardFontDataUrl: pdfjsUrl + 'standard_fonts/',
            iccUrl: pdfjsUrl + 'iccs/',
        })
        this.#doc = await this.#loading.promise
        await this.#show(0)
    }

    get #spreadCount() {
        return spreadCount(this.#doc.numPages)
    }

    // Resolve to whether the Spread changed (false at the start/end of the book).
    next() {
        return this.#goTo(this.#spread + 1)
    }

    prev() {
        return this.#goTo(this.#spread - 1)
    }

    close() {
        this.#closed = true
        this.#stage.replaceChildren()
        this.#cache.clear()
        this.#loading?.destroy()
    }

    async #goTo(spread) {
        if (spread < 0 || spread >= this.#spreadCount) return false
        await this.#show(spread)
        return true
    }

    async #show(spread) {
        this.#spread = spread
        const pages = spreadPages(spread, this.#doc.numPages)
        const canvases = await Promise.all(pages.map(n => this.#render(n)))
        if (this.#spread !== spread || this.#closed) return // a newer turn won, or the book closed
        this.#stage.replaceChildren(...canvases)
        this.#prefetch(spread)
    }

    #prefetch(spread) {
        for (const offset of PREFETCH_OFFSETS) {
            const s = spread + offset
            if (s < 0 || s >= this.#spreadCount) continue
            for (const n of spreadPages(s, this.#doc.numPages))
                this.#render(n).catch(error => console.warn(`prefetch of page ${n} failed`, error))
        }
    }

    #render(pageNumber) {
        const cached = this.#cache.get(pageNumber)
        if (cached) return cached
        // Serialise renders: the TV has little CPU and memory to spare.
        const job = this.#queue.then(() => this.#draw(pageNumber))
        this.#queue = job.catch(() => {})
        this.#cache.set(pageNumber, job)
        // Forget failures so the page is retried on the next visit.
        job.catch(() => {
            if (this.#cache.get(pageNumber) === job) this.#cache.delete(pageNumber)
        })
        return job
    }

    async #draw(pageNumber) {
        if (this.#closed) throw new Error('book closed')
        const page = await this.#doc.getPage(pageNumber)
        const box = this.#stage.getBoundingClientRect()
        const gutter = parseFloat(getComputedStyle(this.#stage).columnGap) || 0
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min((box.width - gutter) / 2 / base.width, box.height / base.height)
        const dpr = devicePixelRatio || 1
        const viewport = page.getViewport({ scale: scale * dpr })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
        await page.render({ canvas, viewport }).promise
        page.cleanup()
        return canvas
    }
}
