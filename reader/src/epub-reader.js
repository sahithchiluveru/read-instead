import '../vendor/foliate-js/view.js'

// Two-page EPUB reader on top of foliate-js. Each chapter is laid out on its own,
// so chapters always start in the left column of a fresh Spread.
export class EpubReader {
    format = 'epub'
    #view
    #stage
    #onKey

    constructor(stage, onKey) {
        this.#stage = stage
        this.#onKey = onKey
    }

    async open(url) {
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
        await view.init({ showTextStart: true })
    }

    // Resolve to whether the Spread changed. Resolves on foliate's 'relocate' (the new
    // Spread is laid out); foliate's own next()/prev() settle ~100 ms later because it
    // briefly locks navigation after each turn. No 'relocate' means nothing moved
    // (start/end of book, or a turn already in progress).
    #turn(navigate) {
        return new Promise((resolve, reject) => {
            const onRelocate = () => resolve(true)
            this.#view.addEventListener('relocate', onRelocate, { once: true })
            navigate().then(() => resolve(false), reject)
                .finally(() => this.#view.removeEventListener('relocate', onRelocate))
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
