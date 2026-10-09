import { parsePosition, positionOf, scrollFitWidth, scrollPage } from './fit-width.js'
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
// And its own Fit-width (see fit-width.js), for lettering too small to read in a Spread:
// one page at a time, across the screen. With one page, Right to left changes nothing there.
// Pages are pictures, so there's no text, no chapters and no Contents, and the theme only
// colours the background around them.
export class CbzReader {
    format = 'cbz'
    #container
    #onLocation
    #look // the reader's look; only its layout matters here
    #rightToLeft
    #fitWidth
    #url
    #pageCount = 0
    #spreads = []
    #spread = 0 // index into #spreads
    #offset = 0 // in Fit-width, how far down the page is scrolled, as a fraction of its height
    #shown = 0 // counts calls to #show, so a stale one can tell
    #closed = false
    #images = new Map() // page number → promise of its decoded <img>

    // onLocation receives { position, pageLabel, progress, chapter, charactersLeftInChapter,
    // left, right } whenever the view moves: a new Spread, or in Fit-width a scroll. The
    // Position is the first page shown (and in Fit-width, the scroll offset). settings are the book's own saved settings:
    // 'right-to-left' and 'fit-width'.
    constructor(container, { onLocation, look, settings = {} }) {
        this.#container = container
        this.#onLocation = onLocation
        this.#look = look
        this.#rightToLeft = settings['right-to-left'] === 'true'
        this.#fitWidth = settings['fit-width'] === 'true'
        container.classList.add('comic')
    }

    get rightToLeft() {
        return this.#rightToLeft
    }

    // Whether Fit-width is on, so → scrolls rather than turning a whole Spread.
    get fitWidth() {
        return this.#fitWidth
    }

    get #pairing() {
        return this.#fitWidth || isSinglePage(this.#look) ? 'single' : 'book'
    }

    async open(url, position) {
        this.#url = url
        const response = await fetch(`${url}/pages`)
        if (!response.ok) throw new Error(`no pages (${response.status})`)
        this.#pageCount = (await response.json()).length
        if (!this.#pageCount) throw new Error('no pages')
        this.#spreads = pairPages(this.#pairing, this.#pageCount)
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

    async contents() {
        return { entries: [], current: -1 }
    }

    async chapterAt() {
        return ''
    }

    // Jump to a page (a Position, its scroll offset kept in Fit-width); resolves to whether
    // the view moved.
    goTo(target) {
        const { page, offset } = parsePosition(target)
        return this.#jump(spreadIndexOf(this.#spreads, page), this.#fitWidth ? offset : 0)
    }

    goToFraction(fraction) {
        return this.#jump(Math.round(fraction * (this.#spreads.length - 1)))
    }

    // The Spread's first page (in Fit-width, the page), for the image viewer.
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
        await this.#show(this.#spread, this.#offset)
        return this.#rightToLeft
    }

    // Switch Fit-width on or off, keeping the first page on screen (at its top). Resolves to
    // whether it's on, to be saved for the book.
    async toggleFitWidth() {
        const page = this.#firstPage()
        this.#fitWidth = !this.#fitWidth
        this.#spreads = pairPages(this.#pairing, this.#pageCount)
        await this.#show(spreadIndexOf(this.#spreads, page))
        return this.#fitWidth
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

    async #jump(spread, offset = 0) {
        if (spread === this.#spread && offset === this.#offset) return false
        return this.#goTo(spread, offset)
    }

    async #goTo(spread, offset = 0) {
        if (spread < 0 || spread >= this.#spreads.length) return false
        await this.#show(spread, offset)
        return true
    }

    // Fit-width: scroll half a screen down (1) or up (-1), as scrollFitWidth.
    #scroll(direction) {
        const shown = this.#shown
        return scrollFitWidth(direction, {
            spread: this.#spread,
            offset: this.#offset,
            view: this.#container.clientHeight,
            heightOf: spread => this.#pageHeight(spread),
            stillCurrent: () => shown === this.#shown && this.#fitWidth,
            goTo: (spread, offset) => this.#goTo(spread, offset),
        })
    }

    // The height on screen of a Spread's page in Fit-width. Measuring the previous page (to
    // step back to its bottom) lets go of the next one first, so no more than two scans are
    // ever held: the TV has little memory.
    async #pageHeight(spread) {
        const page = this.#spreads[spread].left
        if (spread !== this.#spread) this.#release(new Set([this.#firstPage(), page]))
        return this.#heightOf(await this.#image(page))
    }

    // The height on screen of a decoded page in Fit-width, in CSS px: its shape across the
    // stage's width (0 if it failed to load).
    #heightOf({ naturalWidth, naturalHeight }) {
        return naturalWidth ? this.#container.getBoundingClientRect().width * naturalHeight / naturalWidth : 0
    }

    async #show(spread, offset = 0) {
        const shown = ++this.#shown
        this.#spread = spread
        this.#offset = offset
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
        if (this.#fitWidth)
            scrollPage(columns[0], offset, this.#heightOf(images[0]), this.#container.clientHeight)
        if (this.#rightToLeft) columns.reverse()
        this.#container.replaceChildren(...columns)
        this.#container.classList.toggle('fit-width', this.#fitWidth)
        this.#prepareNext(spread)
        this.#report()
    }

    // Keep only the pages of this Spread and the next (in Fit-width, this page and the next),
    // starting on the next one's.
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
    // shows as a broken image and is fetched again (as soon as it's wanted again).
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
            position: positionOf(this.#firstPage(), this.#offset),
            pageLabel: spreadLabel(spread, this.#pageCount),
            progress: last ? this.#spread / last : 1,
            chapter: '',
            charactersLeftInChapter: null,
            left: '',
            right: '',
        })
    }
}
