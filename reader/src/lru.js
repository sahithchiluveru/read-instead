// Small LRU map; `onEvict` lets callers free canvases/bitmaps they no longer need.
export class LruCache {
    #map = new Map()
    constructor(capacity, onEvict = () => {}) {
        this.capacity = capacity
        this.onEvict = onEvict
    }
    get(key) {
        if (!this.#map.has(key)) return undefined
        const value = this.#map.get(key)
        this.#map.delete(key)
        this.#map.set(key, value)
        return value
    }
    set(key, value) {
        if (this.#map.has(key)) this.#map.delete(key)
        this.#map.set(key, value)
        while (this.#map.size > this.capacity) {
            const [oldKey, oldValue] = this.#map.entries().next().value
            this.#map.delete(oldKey)
            this.onEvict(oldKey, oldValue)
        }
    }
    delete(key) {
        this.#map.delete(key)
    }
    clear() {
        for (const [key, value] of this.#map) this.onEvict(key, value)
        this.#map.clear()
    }
}
