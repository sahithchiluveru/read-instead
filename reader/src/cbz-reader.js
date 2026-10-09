import { isSinglePage } from './look.js'
import { pagesOf, pairPages, spreadIndexOf, spreadLabel } from './pdf-spreads.js'

// Two-page CBZ (comic and manga) reader. The archive is never loaded here: volumes run to
// hundreds of MB and the TV has little memory. The Android shell lists the pages (in natural
// filename order) at <url>/pages and serves each one on its own at <url>/pages/<n>, from 1,
// already scaled down if it's much larger than the screen. Only the pages of the Spread on
// screen and the next one are kept, decoded and ready, so → shows the next Spread at once.
//
// Pages pair like a printed comic: the cover alone, then 2–3, 4–5. In the single-page
// layout every page is shown alone. Each book has its own Right to left: manga's Spreads
// are mirrored, the first page on the right, while → still goes forward through the book.
// Pages are pictures, so there's no text, no chapters and no Contents, and the theme only
// colours the background around them.
export class CbzReader {
    format = 'cbz'
    #container
    #onLocation
    #look // the reader's look; only its layout matters here
    #rightToLeft
    #url
    #pageCount = 0
    #spreads = []
    #spread = 0 // index into #spreads
    #shown = 0 // counts calls to #show, so a stale one can tell
    #closed = false
    #images = new Map() // page number → promise of its decoded <img>

    // onLocation receives { position, pageLabel, progress, chapter, charactersLeftInChapter,
    // left, right } whenever a new Spread is on screen. The Position is the first page shown.
    // settings are the book's own saved settings: 'right-to-left'.
    constructor(container, { onLocation, look, settings = {} }) {
        this.#container = container
        this.#onLocation = onLocation
        this.#look = look
        this.#rightToLeft = settings['right-to-left'] === 'true'
        container.classList.add('comic')
    }

    get #pairing() {
        return isSinglePage(this.#look) ? 'single' : 'book'
    }

    async open(url, position) {
        this.#url = url
        const response = await fetch(`${url}/pages`)
        if (!response.ok) throw new Error(`no pages (${response.status})`)
        this.#pageCount = (await response.json()).length
        if (!this.#pageCount) throw new Error('no pages')
        this.#spreads = pairPages(this.#pairing, this.#pageCount)
        await this.#show(spreadIndexOf(this.#spreads, Number(position ?? 1)))
    }

    // Resolve to whether the view moved (false at the start/end of the book).
    next() {
        return this.#goTo(this.#spread + 1)
    }

    prev() {
        return this.#goTo(this.#spread - 1)
    }

    async contents() {
        return { entries: [], current: -1 }
    }

    async chapterAt() {
        return ''
    }

    // Jump to a page (a Position); resolves to whether the view moved.
    goTo(target) {
        return this.#jump(spreadIndexOf(this.#spreads, Number(target)))
    }

    goToFraction(fraction) {
        return this.#jump(Math.round(fraction * (this.#spreads.length - 1)))
    }

    // The Spread's first page, for the image viewer.
    spreadImage() {
        return this.#pageUrl(this.#firstPage())
    }

    // A new look: a change of layout re-pairs the pages, keeping the first page on screen.
    async setLook(look) {
        const before = this.#pairing
        this.#look = look
        if (this.#pairing === before) return
        const page = this.#firstPage()
        this.#spreads = pairPages(this.#pairing, this.#pageCount)
        await this.#show(spreadIndexOf(this.#spreads, page))
    }

    // Switch Right to left on or off. Resolves to whether it's on, to be saved for the book.
    async toggleRightToLeft() {
        this.#rightToLeft = !this.#rightToLeft
        await this.#show(this.#spread)
        return this.#rightToLeft
    }

    close() {
        this.#closed = true
        this.#container.replaceChildren()
        this.#release(new Set())
    }

    #firstPage() {
        const { left, right } = this.#spreads[this.#spread]
        return left ?? right
    }

    #pageUrl(page) {
        return `${this.#url}/pages/${page}`
    }

    async #jump(spread) {
        if (spread === this.#spread) return false
        return this.#goTo(spread)
    }

    async #goTo(spread) {
        if (spread < 0 || spread >= this.#spreads.length) return false
        await this.#show(spread)
        return true
    }

    async #show(spread) {
        const shown = ++this.#shown
        this.#spread = spread
        const { left, right } = this.#spreads[spread]
        const slots = this.#pairing === 'single' ? [left] : [left, right]
        const images = await Promise.all(slots.map(page => page && this.#image(page)))
        if (shown !== this.#shown || this.#closed) return // a newer turn won, or the book closed
        // A blank slot keeps a lone page on its own side of the spine.
        const columns = images.map(image => {
            const column = document.createElement('div')
            column.className = 'page'
            if (image) column.append(image)
            return column
        })
        if (this.#rightToLeft) columns.reverse()
        this.#container.replaceChildren(...columns)
        this.#prepareNext(spread)
        this.#report()
    }

    // Keep only the pages of this Spread and the next, starting on the next one's.
    #prepareNext(spread) {
        const keep = new Set([spread, spread + 1].flatMap(s => this.#spreads[s] ? pagesOf(this.#spreads[s]) : []))
        this.#release(keep)
        for (const page of keep) this.#image(page)
    }

    // Let go of every page but these, so their memory can be freed.
    #release(keep) {
        for (const [page, image] of this.#images) {
            if (keep.has(page)) continue
            this.#images.delete(page)
            image.then(img => img.removeAttribute('src'))
        }
    }

    // A page as an <img>, decoded off the main thread before it's shown. One that fails
    // shows as a broken image and is fetched again on the next visit.
    #image(page) {
        const cached = this.#images.get(page)
        if (cached) return cached
        const img = new Image()
        img.alt = ''
        img.decoding = 'async'
        img.src = this.#pageUrl(page)
        const job = img.decode().then(() => img, error => {
            if (this.#images.get(page) !== job) return img // let go of meanwhile
            this.#images.delete(page)
            console.warn(`page ${page} failed to load`, error)
            return img
        })
        this.#images.set(page, job)
        return job
    }

    #report() {
        const spread = this.#spreads[this.#spread]
        const last = this.#spreads.length - 1
        this.#onLocation({
            position: String(this.#firstPage()),
            pageLabel: spreadLabel(spread, this.#pageCount),
            progress: last ? this.#spread / last : 1,
            chapter: '',
            charactersLeftInChapter: null,
            left: '',
            right: '',
        })
    }
}
