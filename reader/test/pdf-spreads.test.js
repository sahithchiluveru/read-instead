import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { choosePairing, pairPages, spreadIndexOf } from '../src/pdf-spreads.js'

const letter = { width: 612, height: 792 }
const a4 = { width: 595, height: 842 }
const trade = { width: 432, height: 648 } // 6×9 in, a typical book trim
const slide = { width: 960, height: 540 }

describe('choosePairing', () => {
    test("honours the document's own two-page PageLayout", () => {
        const sizes = [letter, letter]
        assert.equal(choosePairing({ pageLayout: 'TwoPageRight', pageCount: 10, sizes }), 'book')
        assert.equal(choosePairing({ pageLayout: 'TwoColumnRight', pageCount: 10, sizes }), 'book')
        assert.equal(choosePairing({ pageLayout: 'TwoPageLeft', pageCount: 100, sizes: [trade, trade] }), 'paper')
        assert.equal(choosePairing({ pageLayout: 'TwoColumnLeft', pageCount: 100, sizes: [trade, trade] }), 'paper')
    })

    test('treats SinglePage/OneColumn, the PDF default, as unset', () => {
        assert.equal(choosePairing({ pageLayout: 'SinglePage', pageCount: 100, sizes: [trade, trade] }), 'book')
        assert.equal(choosePairing({ pageLayout: 'OneColumn', pageCount: 10, sizes: [letter, letter] }), 'paper')
    })

    test('shows landscape pages one per screen', () => {
        assert.equal(choosePairing({ pageLayout: '', pageCount: 30, sizes: [slide, slide, slide] }), 'single')
        // Even when the document asks for two pages.
        assert.equal(choosePairing({ pageLayout: 'TwoPageLeft', pageCount: 30, sizes: [slide, slide] }), 'single')
        // Mostly portrait with one landscape page: still paired.
        assert.equal(choosePairing({ pageLayout: '', pageCount: 5, sizes: [letter, letter, slide] }), 'paper')
    })

    test('pairs like a printed book when the cover differs from the pages', () => {
        assert.equal(choosePairing({ pageLayout: '', pageCount: 12, sizes: [{ width: 640, height: 900 }, letter, letter] }), 'book')
    })

    test('pairs like a printed book for long documents with a book trim', () => {
        assert.equal(choosePairing({ pageLayout: '', pageCount: 530, sizes: [trade, trade, trade] }), 'book')
    })

    test('pairs 1–2 for papers: Letter/A4 or short documents', () => {
        assert.equal(choosePairing({ pageLayout: '', pageCount: 300, sizes: [letter, letter] }), 'paper')
        assert.equal(choosePairing({ pageLayout: '', pageCount: 300, sizes: [a4, a4] }), 'paper')
        assert.equal(choosePairing({ pageLayout: '', pageCount: 12, sizes: [trade, trade] }), 'paper')
        assert.equal(choosePairing({ pageLayout: '', pageCount: 1, sizes: [trade] }), 'paper')
    })
})

describe('pairPages', () => {
    test('book: the cover stands alone on the right, then 2–3, 4–5', () => {
        assert.deepEqual(pairPages('book', 5), [
            { left: null, right: 1 }, { left: 2, right: 3 }, { left: 4, right: 5 }])
        assert.deepEqual(pairPages('book', 4).at(-1), { left: 4, right: null })
    })

    test('paper: 1–2, 3–4, with an odd last page alone on the left', () => {
        assert.deepEqual(pairPages('paper', 5), [
            { left: 1, right: 2 }, { left: 3, right: 4 }, { left: 5, right: null }])
        assert.equal(pairPages('paper', 530).length, 265)
    })

    test('single: one page per screen', () => {
        assert.deepEqual(pairPages('single', 2), [{ left: 1, right: null }, { left: 2, right: null }])
    })
})

test('spreadIndexOf finds the Spread showing a page, clamped to the document', () => {
    const spreads = pairPages('book', 5)
    assert.equal(spreadIndexOf(spreads, 1), 0)
    assert.equal(spreadIndexOf(spreads, 3), 1)
    assert.equal(spreadIndexOf(spreads, 4), 2)
    assert.equal(spreadIndexOf(spreads, 99), 2)
    assert.equal(spreadIndexOf(spreads, NaN), 0)
})
