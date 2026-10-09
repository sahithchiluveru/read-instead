import * as pdfjs from '../vendor/pdfjs/build/pdf.min.mjs'
import { LruCache } from './lru.js'
import { choosePairing, columnsOf, pagesOf, pairPages, spreadIndexOf } from './pdf-spreads.js'

const pdfjsUrl = new URL('../vendor/pdfjs/', import.meta.url).href
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsUrl + 'build/pdf.worker.min.mjs'

// Spreads rendered ahead of time, relative to the one on screen.
const PREFETCH_OFFSETS = [1, -1, 2]
// The Spread on screen plus every prefetched one, two pages each, so the
// visible pages are never evicted.
const CACHE_PAGES = (PREFETCH_OFFSETS.length + 1) * 2
// Pages whose sizes decide the pairing.
const SAMPLE_PAGES = 5

// Two-page PDF reader: renders pages into offscreen canvases and swaps them in,
// so a turn to an already-rendered Spread costs no rendering at all.
export class PdfReader {
    format = 'pdf'
    #container
    #onLocation
    #loading
    #doc
    #closed = false
    #pairing
    #spreads = []
    #spread = 0 // index into #spreads
    #chapters // Promise of [{ title, page }] from the outline, by page
    #queue = Promise.resolve()
    #cache = new LruCache(CACHE_PAGES, (_, entry) => entry.then(canvas => {
        canvas.width = canvas.height = 0
    }, () => {}))

    // onLocation receives { position, pageLabel, progress, chapter, left, right } whenever a new
    // Spread is on screen. The Position is the first page number shown.
    constructor(container, { onLocation }) {
        this.#container = container
        this.#onLocation = onLocation
    }

    async open(url, position) {
        this.#loading = pdfjs.getDocument({
            url,
            wasmUrl: pdfjsUrl + 'wasm/',
            cMapUrl: pdfjsUrl + 'cmaps/',
            standardFontDataUrl: pdfjsUrl + 'standard_fonts/',
            iccUrl: pdfjsUrl + 'iccs/',
        })
        const doc = await this.#loading.promise
        this.#doc = doc
        this.#pairing = choosePairing({
            pageLayout: await doc.getPageLayout(),
            pageCount: doc.numPages,
            sizes: await this.#sampleSizes(),
        })
        this.#spreads = pairPages(this.#pairing, doc.numPages)
        this.#chapters = this.#readChapters().catch(error => {
            console.warn('could not read the outline', error)
            return []
        })
        await this.#show(spreadIndexOf(this.#spreads, position ? Number(position) : 1))
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
        this.#container.replaceChildren()
        this.#cache.clear()
        this.#loading?.destroy()
    }

    #sampleSizes() {
        const count = Math.min(SAMPLE_PAGES, this.#doc.numPages)
        return Promise.all(Array.from({ length: count }, async (_, i) => {
            const { width, height } = (await this.#doc.getPage(i + 1)).getViewport({ scale: 1 })
            return { width, height }
        }))
    }

    async #readChapters() {
        const entries = []
        const flatten = items => items?.forEach(item => {
            entries.push(item)
            flatten(item.items)
        })
        flatten(await this.#doc.getOutline())
        const chapters = await Promise.all(entries.map(async ({ title, dest }) =>
            ({ title: title.trim(), page: await this.#pageOfDest(dest) })))
        return chapters.filter(chapter => chapter.page).sort((a, b) => a.page - b.page)
    }

    async #pageOfDest(dest) {
        const explicit = typeof dest === 'string' ? await this.#doc.getDestination(dest) : dest
        const target = explicit?.[0]
        if (target == null) return null
        return 1 + (typeof target === 'number' ? target : await this.#doc.getPageIndex(target))
    }

    async #goTo(spread) {
        if (spread < 0 || spread >= this.#spreads.length) return false
        await this.#show(spread)
        return true
    }

    async #show(spread) {
        this.#spread = spread
        const { left, right } = this.#spreads[spread]
        const slots = [left, right].slice(0, columnsOf(this.#pairing))
        const canvases = await Promise.all(slots.map(n => n && this.#render(n)))
        if (this.#spread !== spread || this.#closed) return // a newer turn won, or the book closed
        // A blank page keeps its partner on the correct side.
        this.#container.replaceChildren(...canvases.map((canvas, i) => canvas ?? blankLike(canvases[1 - i])))
        this.#prefetch(spread)
        this.#report(spread).catch(error => console.error('reporting the location failed', error))
    }

    async #report(spread) {
        const { left, right } = this.#spreads[spread]
        const [leftText, rightText, chapters] = await Promise.all([
            left ? this.#text(left) : '', right ? this.#text(right) : '', this.#chapters])
        if (this.#spread !== spread || this.#closed) return
        const first = left ?? right
        const last = this.#spreads.length - 1
        const pages = this.#doc.numPages
        this.#onLocation({
            position: String(first),
            pageLabel: left && right ? `Pages ${left}–${right} of ${pages}` : `Page ${first} of ${pages}`,
            progress: last ? spread / last : 1,
            chapter: chapters.findLast(chapter => chapter.page <= first)?.title ?? '',
            left: leftText,
            right: rightText,
        })
    }

    // A page's text, one line per line of print.
    async #text(pageNumber) {
        try {
            const page = await this.#doc.getPage(pageNumber)
            const { items } = await page.getTextContent()
            return items.map(item => item.str + (item.hasEOL ? '\n' : '')).join('')
                .split('\n').map(line => line.trim()).filter(Boolean).join('\n')
        } catch (error) {
            console.warn(`text of page ${pageNumber} failed`, error)
            return ''
        }
    }

    #prefetch(spread) {
        for (const offset of PREFETCH_OFFSETS) {
            const s = this.#spreads[spread + offset]
            if (!s) continue
            for (const n of pagesOf(s))
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
        const box = this.#container.getBoundingClientRect()
        const gutter = parseFloat(getComputedStyle(this.#container).columnGap) || 0
        const columns = columnsOf(this.#pairing)
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min((box.width - gutter * (columns - 1)) / columns / base.width, box.height / base.height)
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

const blankLike = canvas => {
    const blank = document.createElement('div')
    blank.style.width = canvas.style.width
    blank.style.height = canvas.style.height
    return blank
}
