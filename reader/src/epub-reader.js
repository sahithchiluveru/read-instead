import '../vendor/foliate-js/view.js'
import { blockBookScripts } from './epub-scripts.js'
import { rangeText, splitAtColumn } from './epub-text.js'

// Pages (columns) side by side in a Spread.
const COLUMNS = 2

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
    #tocItem = null // the Contents entry of the Spread on screen
    #onShown = null // resolves the turn in progress

    // onLocation receives { position, pageLabel, progress, chapter, pagesLeftInChapter, left,
    // right } whenever a new Spread is on screen.
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
        blockBookScripts(view.book)
        const paginator = view.renderer
        paginator.setAttribute('flow', 'paginated')
        paginator.setAttribute('max-column-count', String(COLUMNS))
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
        this.#tocItem = detail.tocItem
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
            // No fixed pages in a reflowable book: the label is how far through it this is.
            pageLabel: `${Math.round((fraction ?? 0) * 100)}%`,
            progress: fraction ?? 0,
            chapter: tocItem?.label?.trim() ?? '',
            pagesLeftInChapter: this.#pagesLeftInChapter(),
            ...this.#visibleText(range),
        }
    }

    // Pages after this Spread before the next chapter, or null in a fixed-layout book,
    // which has no reflowed pages. Each chapter is laid out on its own, as columns running
    // left to right from x = 0 in its document (the paginator's blank padding page sits
    // before that), so the columns its content reaches into are the chapter's pages.
    #pagesLeftInChapter() {
        if (this.#view.isFixedLayout) return null
        const renderer = this.#view.renderer
        const [{ doc }] = renderer.getContents()
        const column = renderer.size / COLUMNS
        const contentEnd = Math.max(0, ...[...rangeOfBody(doc).getClientRects()]
            .filter(rect => rect.width > 0).map(rect => rect.right))
        const chapterPages = Math.ceil(contentEnd / column - 0.01) // ignore sub-pixel overhang
        return Math.max(0, chapterPages - renderer.page * COLUMNS)
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

    // The Contents in reading order, nested entries flattened after their parent:
    // { entries: [{ label, depth, target }], current }, where current is the index of the
    // Spread's entry (-1 if none) and target is what goTo() takes.
    async contents() {
        const entries = []
        const items = []
        const flatten = (list, depth) => list?.forEach(item => {
            entries.push({ label: item.label?.trim() ?? '', depth, target: item.href })
            items.push(item)
            flatten(item.subitems, depth + 1)
        })
        flatten(this.#view.book.toc, 0)
        return { entries, current: items.indexOf(this.#tocItem) }
    }

    // The chapter at a fraction of the book (0–1), as Go to % previews it.
    async chapterAt(fraction) {
        const { index } = this.#view.resolveNavigation({ fraction })
        return this.#view.getProgressOf(index).tocItem?.label?.trim() ?? ''
    }

    // Jump to a Contents entry's target or a Position (a CFI).
    goTo(target) {
        return this.#jump(() => this.#view.goTo(target))
    }

    goToFraction(fraction) {
        return this.#jump(() => this.#view.goToFraction(fraction))
    }

    // foliate ignores navigation while a turn settles, so a jump waits it out too.
    async #jump(navigate) {
        await this.#navigating
        const jumped = navigate()
        this.#navigating = jumped.catch(() => {})
        await jumped
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
