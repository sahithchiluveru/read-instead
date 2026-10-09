import '../vendor/foliate-js/view.js'
import { rangeText, splitAtColumn } from './epub-text.js'

// Two-page EPUB reader on top of foliate-js. Each chapter is laid out on its own,
// so chapters always start in the left column of a fresh Spread. Fixed-layout books
// show the publisher's spreads instead.
export class EpubReader {
    format = 'epub'
    #view
    #stage
    #onKey
    #onLocation
    #navigating = Promise.resolve()
    #shown = null // the last location reported
    #onShown = null // resolves the turn in progress

    // onLocation receives { position, progress, chapter, left, right } whenever a new
    // Spread is on screen.
    constructor(stage, { onKey, onLocation }) {
        this.#stage = stage
        this.#onKey = onKey
        this.#onLocation = onLocation
    }

    async open(url, position) {
        const view = document.createElement('foliate-view')
        this.#view = view
        this.#stage.replaceChildren(view)
        await view.open(url)
        const paginator = view.renderer
        paginator.setAttribute('flow', 'paginated')
        paginator.setAttribute('max-column-count', '2')
        paginator.setAttribute('max-inline-size', '432px')
        paginator.setAttribute('gap', '6%')
        paginator.setAttribute('margin', '0px')
        // Book pages live in iframes; forward their keys so the remote keeps working.
        view.addEventListener('load', ({ detail: { doc } }) =>
            doc.addEventListener('keydown', this.#onKey))
        view.addEventListener('relocate', ({ detail }) => this.#onRelocate(detail))
        await view.init({ lastLocation: position, showTextStart: true })
    }

    // foliate reports a location many times per turn: again for the same Spread as the
    // layout settles, and for the blank padding page it passes on its way to the next
    // chapter. Only a new Spread counts.
    #onRelocate(detail) {
        if (!this.#onSpread() || detail.cfi === this.#shown?.position) return
        const location = this.#location(detail)
        this.#shown = location
        this.#onLocation(location)
        this.#onShown?.()
    }

    #onSpread() {
        if (this.#view.isFixedLayout) return true
        const { page, pages } = this.#view.renderer
        return page > 0 && page < pages - 1 // the paginator pads each chapter with a blank page each side
    }

    #location({ cfi, fraction, tocItem, range }) {
        return {
            position: cfi,
            progress: fraction ?? 0,
            chapter: tocItem?.label?.trim() ?? '',
            ...this.#visibleText(range),
        }
    }

    #visibleText(range) {
        const renderer = this.#view.renderer
        if (this.#view.isFixedLayout) {
            // One document per page slot, left to right; an empty slot (e.g. beside the
            // cover) is a blank page. A single centred page counts as left.
            const [left = '', right = ''] = renderer.getContents().map(({ doc }) =>
                doc?.body ? rangeText(rangeOfBody(doc)) : '')
            return { left, right }
        }
        // The Spread is one paginator page holding both columns, so the right column starts
        // halfway across it. The paginator keeps a blank page before the chapter, hence
        // `start - size` for the Spread's left edge in chapter-document coordinates.
        const spreadStart = renderer.start - renderer.size
        return splitAtColumn(range, spreadStart + renderer.size / 2)
    }

    // Resolve to whether the Spread changed, as soon as the new Spread is laid out.
    // foliate's own next()/prev() settle ~100 ms later because it briefly locks navigation
    // after each turn, ignoring turns in the meantime. So a turn first waits out the
    // previous one, and no new Spread means the start/end of the book.
    async #turn(navigate) {
        await this.#navigating
        return new Promise((resolve, reject) => {
            this.#onShown = () => resolve(true)
            this.#navigating = navigate().then(() => resolve(false), reject)
                .finally(() => this.#onShown = null)
        })
    }

    next() {
        return this.#turn(() => this.#view.next())
    }

    prev() {
        return this.#turn(() => this.#view.prev())
    }

    close() {
        this.#view?.close()
        this.#stage.replaceChildren()
    }
}

const rangeOfBody = doc => {
    const range = doc.createRange()
    range.selectNodeContents(doc.body)
    return range
}
