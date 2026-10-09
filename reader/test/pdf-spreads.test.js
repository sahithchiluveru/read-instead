import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spreadCount, spreadPages } from '../src/pdf-spreads.js'

test('pairs pages 1–2, 3–4 and leaves an odd last page alone', () => {
    assert.equal(spreadCount(530), 265)
    assert.equal(spreadCount(5), 3)
    assert.deepEqual(spreadPages(0, 5), [1, 2])
    assert.deepEqual(spreadPages(1, 5), [3, 4])
    assert.deepEqual(spreadPages(2, 5), [5])
})

test('a single-page document is one spread', () => {
    assert.equal(spreadCount(1), 1)
    assert.deepEqual(spreadPages(0, 1), [1])
})
