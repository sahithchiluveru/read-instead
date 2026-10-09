import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LruCache } from '../src/lru.js'

test('evicts the least recently used entry and reports it', () => {
    const evicted = []
    const cache = new LruCache(2, (key, value) => evicted.push([key, value]))
    cache.set(1, 'a')
    cache.set(2, 'b')
    cache.get(1)
    cache.set(3, 'c')
    assert.deepEqual(evicted, [[2, 'b']])
    assert.equal(cache.get(2), undefined)
    assert.equal(cache.get(1), 'a')
    assert.equal(cache.get(3), 'c')
})

test('delete forgets an entry without reporting it as evicted', () => {
    const evicted = []
    const cache = new LruCache(2, key => evicted.push(key))
    cache.set('x', 1)
    cache.delete('x')
    assert.equal(cache.get('x'), undefined)
    assert.deepEqual(evicted, [])
})

test('clear evicts everything', () => {
    const evicted = []
    const cache = new LruCache(3, key => evicted.push(key))
    cache.set('x', 1)
    cache.set('y', 2)
    cache.clear()
    assert.deepEqual(evicted, ['x', 'y'])
    assert.equal(cache.get('x'), undefined)
})
