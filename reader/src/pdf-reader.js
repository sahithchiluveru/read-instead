import * as pdfjs from '../vendor/pdfjs/build/pdf.min.mjs'
import { isSinglePage } from './look.js'
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
// The pairings the Pairing button switches between: cover alone, or 1–2.
const PAIRINGS = ['book', 'paper']

// Two-page PDF reader: renders pages into offscreen canvases and swaps them in,
// so a turn to an already-rendered Spread costs no rendering at all. In the single-page
// layout, every page is shown alone. The theme tints the pages through app.css.
//
// Each book has its own Pairing and Fit-width. In Fit-width one page fills the width of
// the screen, and →/← scroll it by half a screen before moving to the next/previous page.
// Its Position is then the page and how far down it's scrolled, as a fraction of the
// page's height: "<page>@<fraction>" (just "<page>" at the top).
export class PdfReader {
    format = 'pdf'
    #container
    #onLocation
    #loading
    #doc
    #closed = false
    #autoPairing // how the document's pages pair up, by its PageLayout or the heuristic
    #pairing // the book's own choice of PAIRINGS, or null to go by #autoPairing
    #fitWidth
    #look // the reader's look; only its layout matters here
    #spreads = []
    #spread = 0 // index into #spreads
    #offset = 0 // in Fit-width, how far down the page is scrolled, as a fraction of its height
    #shown = 0 // counts calls to #show, so a stale one can tell
    #chapters // Promise of the outline, in order: [{ title, page, depth }]
    #queue = Promise.resolve()
    #cache = newCache()

    // onLocation receives { position, pageLabel, progress, chapter, left, right } whenever a new
    // Spread is on screen. The Position is the first page number shown (and in Fit-width,
    // the scroll offset). look is the reader's look to start with; only its layout matters
    // here. settings are the book's own saved settings: 'pairing' and 'fit-width'.
    constructor(container, { onLocation, look, settings = {} }) {
        this.#container = container
        this.#onLocation = onLocation
        this.#look = look
        this.#pairing = PAIRINGS.includes(settings.pairing) ? settings.pairing : null
        this.#fitWidth = settings['fit-width'] === 'true'
    }

    // How pages pair up on screen: one at a time for landscape pages, in Fit-width and in
    // the single-page layout, else by the book's Pairing.
    get #shownPairing() {
        if (this.#autoPairing === 'single' || this.#fitWidth || isSinglePage(this.#look)) return 'single'
        return this.#pairing ?? this.#autoPairing
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
        this.#autoPairing = choosePairing({
            pageLayout: await doc.getPageLayout(),
            pageCount: doc.numPages,
            sizes: await this.#sampleSizes(),
        })
        this.#spreads = pairPages(this.#shownPairing, doc.numPages)
        this.#chapters = this.#readChapters().catch(error => {
            console.warn('could not read the outline', error)
            return []
        })
        const { page, offset } = parsePosition(position ?? 1)
        await this.#show(spreadIndexOf(this.#spreads, page), this.#fitWidth ? offset : 0)
    }

    // Resolve to whether the view moved (false at the start/end of the book).
    next() {
        return this.#fitWidth ? this.#scroll(1) : this.#goTo(this.#spread + 1)
    }

    prev() {
        return this.#fitWidth ? this.#scroll(-1) : this.#goTo(this.#spread - 1)
    }

    // The outline as Contents (see EpubReader.contents); an entry's target is its page.
    async contents() {
        const chapters = await this.#chapters
        return {
            entries: chapters.map(({ title, depth, page }) => ({ label: title, depth, target: page })),
            current: chapterIndexAt(chapters, this.#firstPage(this.#spread)),
        }
    }

    // The chapter at a fraction of the book (0–1), as Go to % previews it.
    async chapterAt(fraction) {
        const chapters = await this.#chapters
        return chapters[chapterIndexAt(chapters, this.#firstPage(this.#spreadAt(fraction)))]?.title ?? ''
    }

    // Jump to a page: a Contents entry's target or a Position (its scroll offset kept in
    // Fit-width). Like a turn, resolves to whether the view moved.
    goTo(target) {
        const { page, offset } = parsePosition(target)
        return this.#jump(spreadIndexOf(this.#spreads, page), this.#fitWidth ? offset : 0)
    }

    goToFraction(fraction) {
        return this.#jump(this.#spreadAt(fraction))
    }

    async #jump(spread, offset = 0) {
        if (spread === this.#spread && offset === this.#offset) return false
        return this.#goTo(spread, offset)
    }

    // The inverse of the reported progress.
    #spreadAt(fraction) {
        return Math.round(fraction * (this.#spreads.length - 1))
    }

    #firstPage(spread) {
        const { left, right } = this.#spreads[spread]
        return left ?? right
    }

    // A new look: a change of layout re-pairs the pages and redraws them at their new size,
    // keeping the first page on screen. Resolves once the new Spread is shown.
    setLook(look) {
        return this.#relayout(() => { this.#look = look })
    }

    // Switch the book between cover-alone ('book') and 1–2 ('paper') pairing, as setLook.
    // Resolves to the new Pairing, to be saved for the book. Landscape pages, Fit-width and
    // the single-page layout show one page at a time whatever the Pairing.
    async togglePairing() {
        const pairing = (this.#pairing ?? this.#autoPairing) === 'book' ? 'paper' : 'book'
        await this.#relayout(() => { this.#pairing = pairing })
        return pairing
    }

    // Switch Fit-width on or off, as setLook (so a page shown in Fit-width starts at its top).
    // Resolves to whether it's on, to be saved for the book.
    async toggleFitWidth() {
        const fitWidth = !this.#fitWidth
        await this.#relayout(() => { this.#fitWidth = fitWidth })
        return fitWidth
    }

    // Apply a change to how pages are laid out. If they now show differently, re-pair them
    // and redraw them at their new size, keeping the first page on screen.
    async #relayout(change) {
        const layout = () => `${this.#shownPairing} ${this.#fitWidth}`
        const before = layout()
        change()
        if (layout() === before) return
        const page = this.#firstPage(this.#spread)
        this.#spreads = pairPages(this.#shownPairing, this.#doc.numPages)
        const oldCache = this.#cache
        this.#cache = newCache() // the pages on screen stay until their replacements are drawn
        await this.#show(spreadIndexOf(this.#spreads, page))
        oldCache.clear()
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

    // Entries whose destination isn't a page are left out.
    async #readChapters() {
        const entries = []
        const flatten = (items, depth) => items?.forEach(item => {
            entries.push({ ...item, depth })
            flatten(item.items, depth + 1)
        })
        flatten(await this.#doc.getOutline(), 0)
        const chapters = await Promise.all(entries.map(async ({ title, dest, depth }) =>
            ({ title: title.trim(), page: await this.#pageOfDest(dest), depth })))
        return chapters.filter(chapter => chapter.page)
    }

    async #pageOfDest(dest) {
        const explicit = typeof dest === 'string' ? await this.#doc.getDestination(dest) : dest
        const target = explicit?.[0]
        if (target == null) return null
        return 1 + (typeof target === 'number' ? target : await this.#doc.getPageIndex(target))
    }

    async #goTo(spread, offset = 0) {
        if (spread < 0 || spread >= this.#spreads.length) return false
        await this.#show(spread, offset)
        return true
    }

    // Fit-width: scroll half a screen down (1) or up (-1); from the page's bottom (top), go
    // to the top of the next page (the bottom of the previous one).
    async #scroll(direction) {
        const view = this.#container.clientHeight
        const height = await this.#pageHeight(this.#spread)
        const bottom = Math.max(height - view, 0)
        const at = this.#offset * height
        // Half a pixel of slack absorbs rounding in offset × height.
        if (direction > 0 ? at < bottom - 0.5 : at > 0.5) {
            const to = Math.min(Math.max(at + direction * view / 2, 0), bottom)
            return this.#goTo(this.#spread, to / height)
        }
        const spread = this.#spread + direction
        if (direction > 0 || spread < 0) return this.#goTo(spread)
        const previous = await this.#pageHeight(spread)
        return this.#goTo(spread, Math.max(previous - view, 0) / previous)
    }

    // The height on screen of a Spread's page in Fit-width, in CSS px (as #draw sizes it).
    async #pageHeight(spread) {
        const page = await this.#doc.getPage(this.#firstPage(spread))
        const base = page.getViewport({ scale: 1 })
        return Math.floor(base.height * this.#scaleOf(base))
    }

    async #show(spread, offset = 0) {
        const shown = ++this.#shown
        this.#spread = spread
        this.#offset = offset
        const { left, right } = this.#spreads[spread]
        const slots = [left, right].slice(0, columnsOf(this.#shownPairing))
        const canvases = await Promise.all(slots.map(n => n && this.#render(n)))
        if (shown !== this.#shown || this.#closed) return // a newer turn won, or the book closed
        // A blank page keeps its partner on the correct side.
        this.#container.replaceChildren(...canvases.map((canvas, i) => canvas ?? blankLike(canvases[1 - i])))
        this.#container.classList.toggle('fit-width', this.#fitWidth)
        if (this.#fitWidth) this.#scrollTo(canvases[0], offset)
        this.#prefetch(spread)
        this.#report(shown).catch(error => console.error('reporting the location failed', error))
    }

    // Fit-width: move the page up to show it from offset (a fraction of its height) down,
    // but never past its bottom.
    #scrollTo(canvas, offset) {
        const height = parseFloat(canvas.style.height)
        const scrolled = Math.min(offset * height, Math.max(height - this.#container.clientHeight, 0))
        canvas.style.transform = `translateY(${-scrolled}px)`
    }

    async #report(shown) {
        const spread = this.#spread
        const { left, right } = this.#spreads[spread]
        const [leftText, rightText, chapters] = await Promise.all([
            left ? this.#text(left) : '', right ? this.#text(right) : '', this.#chapters])
        if (shown !== this.#shown || this.#closed) return
        const first = this.#firstPage(spread)
        const last = this.#spreads.length - 1
        const pages = this.#doc.numPages
        this.#onLocation({
            position: this.#offset ? `${first}@${this.#offset}` : String(first),
            pageLabel: left && right ? `Pages ${left}–${right} of ${pages}` : `Page ${first} of ${pages}`,
            progress: last ? spread / last : 1,
            chapter: chapters[chapterIndexAt(chapters, first)]?.title ?? '',
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
        const scale = this.#scaleOf(page.getViewport({ scale: 1 }))
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

    // The scale that fits a page of this size (its viewport at scale 1) on screen: across
    // the width in Fit-width, else whole in its column.
    #scaleOf(base) {
        const box = this.#container.getBoundingClientRect()
        if (this.#fitWidth) return box.width / base.width
        const gutter = parseFloat(getComputedStyle(this.#container).columnGap) || 0
        const columns = columnsOf(this.#shownPairing)
        return Math.min((box.width - gutter * (columns - 1)) / columns / base.width, box.height / base.height)
    }
}

// A Position (or a Contents target: a page number) as its page and scroll offset.
const parsePosition = position => {
    const [page, offset] = String(position).split('@')
    return { page: Number(page), offset: Number(offset) || 0 }
}

// The index of the outline entry a page belongs to: the one starting nearest before it
// (the last listed, if several start on the same page), or -1 before the first chapter.
const chapterIndexAt = (chapters, page) => chapters.reduce((found, { page: start }, i) =>
    start <= page && (found < 0 || start >= chapters[found].page) ? i : found, -1)

// Rendered pages by page number, as promises of their canvases; an evicted page's canvas
// frees its memory.
const newCache = () => new LruCache(CACHE_PAGES, (_, entry) => entry.then(canvas => {
    canvas.width = canvas.height = 0
}, () => {}))

const blankLike = canvas => {
    const blank = document.createElement('div')
    blank.style.width = canvas.style.width
    blank.style.height = canvas.style.height
    return blank
}
