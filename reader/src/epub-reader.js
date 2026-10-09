import '../vendor/foliate-js/view.js'
import { bookStyles } from './epub-look.js'
import { isSinglePage } from './look.js'
import { blockBookScripts } from './epub-scripts.js'
import { rangeText, splitAtColumn, wholeWords } from './epub-text.js'

// The layout grid (docs/research/tv-reader-visual-design.md): two 408 dp columns with a
// 48 dp gutter between the 48 dp side margins. The book's view spans the whole 960 dp
// width (app.css), and foliate puts its gap (5% of that: 48 dp) at either edge and
// between columns, so a Spread's columns come out at 408. One centred column is held
// to 408 by its maximum size, which foliate shares with a gap 5/95 of it.
const GAP = '5%'
const maxInlineSize = columns => columns === 1 ? '431px' : '480px'

const nextFrame = () => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)))

// Two-page EPUB reader on top of foliate-js. Each chapter is laid out on its own,
// so chapters always start in the left column of a fresh Spread. Fixed-layout books
// show the publisher's spreads instead. In the single-page layout, a Spread is one
// centred column.
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
    #look // { font, size, layout, ... } (see look.js)
    #relayingOut = false
    #awaitingFonts = new WeakSet() // chapter documents waiting for their fonts

    // onLocation receives { position, pageLabel, progress, chapter, pagesLeftInChapter,
    // charactersLeftInChapter, left, right } whenever a new Spread is on screen. look is the reader's look to start with.
    constructor(stage, { onKey, onLocation, look }) {
        this.#stage = stage
        this.#onKey = onKey
        this.#onLocation = onLocation
        this.#look = look
    }

    // Pages (columns) side by side in a Spread.
    get #columns() {
        return isSinglePage(this.#look) ? 1 : 2
    }

    async open(url, position) {
        const view = document.createElement('foliate-view')
        this.#view = view
        this.#stage.replaceChildren(view)
        await view.open(url)
        blockBookScripts(view.book)
        const paginator = view.renderer
        paginator.setAttribute('flow', 'paginated')
        paginator.setAttribute('max-column-count', String(this.#columns))
        paginator.setAttribute('max-inline-size', maxInlineSize(this.#columns))
        paginator.setAttribute('gap', GAP)
        paginator.setAttribute('margin', '0px')
        if (!view.isFixedLayout) paginator.setStyles(bookStyles(this.#look))
        // Book pages live in iframes; forward their keys so the remote keeps working.
        // Hyphenation needs to know the language, which not every chapter declares.
        const language = [view.book.metadata?.language].flat()[0] || 'en'
        view.addEventListener('load', ({ detail: { doc } }) => {
            doc.addEventListener('keydown', this.#onKey)
            if (!doc.documentElement.lang && !doc.documentElement.getAttribute('xml:lang'))
                doc.documentElement.lang = language
        })
        view.addEventListener('relocate', ({ detail }) => this.#onRelocate(detail))
        await view.init({ lastLocation: position, showTextStart: true })
    }

    // foliate reports a location many times per turn: again for the same Spread as the
    // layout settles, and for the blank padding page it passes on its way to the next
    // chapter. Only a new Spread counts.
    #onRelocate(detail) {
        if (this.#relayingOut || this.#fontsLoading() || !this.#onSpread()
            || detail.cfi === this.#shown?.position) return
        const location = this.#location(detail)
        this.#shown = location
        this.#tocItem = detail.tocItem
        this.#onLocation(location)
        this.#onShown?.()
    }

    // Each chapter is its own document, which loads the reading font anew: until it has,
    // the text is laid out in a fallback font's metrics and the Spread isn't final. Once
    // it has, laying the chapter out again relocates to the anchored Spread.
    #fontsLoading() {
        if (this.#view.isFixedLayout) return false
        const [{ doc } = {}] = this.#view.renderer.getContents()
        if (doc?.fonts.status !== 'loading') return false
        if (this.#awaitingFonts.has(doc)) return true
        this.#awaitingFonts.add(doc)
        doc.fonts.ready.then(() => {
            this.#awaitingFonts.delete(doc)
            if (this.#view?.renderer.getContents()[0]?.doc === doc) this.#view.renderer.render()
        })
        return true
    }

    // Resolves once the chapter on screen has its fonts and is laid out in them.
    async #fontsSettled() {
        const [{ doc } = {}] = this.#view.renderer.getContents()
        if (this.#view.isFixedLayout || !doc
            || (doc.fonts.status !== 'loading' && !this.#awaitingFonts.has(doc))) return
        await doc.fonts.ready
        await nextFrame()
    }

    #onSpread() {
        if (this.#view.isFixedLayout) return true
        const { page, pages } = this.#view.renderer
        return page > 0 && page < pages - 1 // the paginator pads each chapter with a blank page each side
    }

    #location({ cfi, fraction, tocItem, range }) {
        const visible = this.#view.isFixedLayout ? null : wholeWords(range)
        return {
            position: cfi,
            // No fixed pages in a reflowable book: the label is how far through it this is.
            pageLabel: `${Math.round((fraction ?? 0) * 100)}%`,
            progress: fraction ?? 0,
            chapter: tocItem?.label?.trim() ?? '',
            pagesLeftInChapter: this.#pagesLeftInChapter(),
            // A fixed-layout book's sections are pages, not chapters to read through.
            charactersLeftInChapter: visible && charactersFrom(visible),
            ...this.#visibleText(visible),
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
        const column = renderer.size / this.#columns
        const contentEnd = Math.max(0, ...[...rangeOfBody(doc).getClientRects()]
            .filter(rect => rect.width > 0).map(rect => rect.right))
        const chapterPages = Math.ceil(contentEnd / column - 0.01) // ignore sub-pixel overhang
        return Math.max(0, chapterPages - renderer.page * this.#columns)
    }

    // Where a reflowable Spread starts, in its chapter document's coordinates. Each chapter
    // is laid out as columns from x = 0, and the paginator keeps a blank page before it,
    // so the Spread (one paginator page) starts a page before the paginator's scroll.
    get #spreadStart() {
        const renderer = this.#view.renderer
        return renderer.start - renderer.size
    }

    // The left and right page's text; visible is the Spread's range in a reflowable book.
    #visibleText(visible) {
        const renderer = this.#view.renderer
        if (this.#view.isFixedLayout) {
            // One document per page slot, left to right; an empty slot (e.g. beside the
            // cover) is a blank page. A single centred page counts as left.
            const [left = '', right = ''] = renderer.getContents().map(({ doc }) =>
                doc?.body ? rangeText(rangeOfBody(doc)) : '')
            return { left, right }
        }
        if (this.#columns === 1) return { left: rangeText(visible), right: '' }
        // The Spread is one paginator page holding both columns, so the right column starts
        // halfway across it.
        return splitAtColumn(visible, this.#spreadStart + renderer.size / 2)
    }

    // Resolve to whether the Spread changed, as soon as the new Spread is laid out.
    // foliate's own next()/prev() settle ~100 ms later because it briefly locks navigation
    // after each turn, ignoring turns in the meantime. So a turn (or jump) first waits out
    // the previous one, and no new Spread means the start/end of the book (or, for a jump,
    // a target foliate couldn't resolve: it logs and swallows those). A new chapter's
    // Spread may only show once its fonts have loaded.
    async #turn(navigate) {
        await this.#navigating
        return new Promise((resolve, reject) => {
            this.#onShown = () => resolve(true)
            this.#navigating = navigate().then(() => this.#fontsSettled()).then(() => resolve(false), reject)
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

    // Jump to a Contents entry's target or a Position (a CFI). Like a turn, resolves to
    // whether the Spread changed.
    goTo(target) {
        return this.#turn(() => this.#view.goTo(target))
    }

    goToFraction(fraction) {
        return this.#turn(() => this.#view.goToFraction(fraction))
    }

    prev() {
        return this.#turn(() => this.#view.prev())
    }

    // The address of the first image on the Spread (in reading order), or null if it has
    // none. Book images are <img>s, or SVG <image>s as on cover pages. The address stays
    // good while the Spread's chapter is loaded.
    spreadImage() {
        const renderer = this.#view.renderer
        // A fixed-layout Spread is its pages' whole documents.
        const start = this.#spreadStart
        const onSpread = this.#view.isFixedLayout ? () => true
            : ({ left, right }) => left < start + renderer.size && right > start
        for (const { doc } of renderer.getContents()) {
            for (const image of doc?.querySelectorAll('img, image') ?? []) {
                const rect = image.getBoundingClientRect()
                const src = image.currentSrc || image.href?.baseVal
                if (src && rect.width > 0 && rect.height > 0 && onSpread(rect)) return src
            }
        }
        return null
    }

    // Lay the book out in a new look (font, size, theme, layout), keeping the start of the
    // Spread on screen, which foliate anchors to. Resolves once the new Spread is reported,
    // even if it starts where the old one did, since its text and pages left have changed.
    // A fixed-layout book keeps the publisher's own look and spreads.
    setLook(look) {
        if (this.#view.isFixedLayout) return Promise.resolve()
        const relayout = this.#navigating.then(() => this.#relayout(look))
        this.#navigating = relayout.catch(() => {})
        return relayout
    }

    async #relayout(look) {
        this.#look = look
        const renderer = this.#view.renderer
        this.#relayingOut = true
        try {
            renderer.setAttribute('max-column-count', String(this.#columns))
            renderer.setAttribute('max-inline-size', maxInlineSize(this.#columns))
            renderer.setStyles(bookStyles(look))
            await nextFrame() // laid out, so the fonts it needs are loading
            await renderer.getContents()[0]?.doc?.fonts.ready
            await nextFrame() // foliate scrolls back to its anchor once the text has resized
        } finally {
            this.#relayingOut = false
        }
        this.#shown = null
        const location = this.#view.lastLocation
        if (location) this.#onRelocate(location)
    }

    close() {
        this.#view?.close()
        this.#stage.replaceChildren()
    }
}

// Characters from the start of the Spread's range to the end of its chapter document,
// whitespace collapsed. Close to the length of the page text (which also breaks lines between
// paragraphs), but quick enough to count a whole chapter on every turn.
const charactersFrom = visible => {
    const doc = visible.startContainer.ownerDocument
    const rest = rangeOfBody(doc)
    rest.setStart(visible.startContainer, visible.startOffset)
    return rest.toString().replace(/\s+/g, ' ').trim().length
}

const rangeOfBody = doc => {
    const range = doc.createRange()
    range.selectNodeContents(doc.body)
    return range
}
