import assert from 'node:assert/strict'
import { test } from 'node:test'
import { statusLine } from '../src/status-line.js'

test('a PDF reads chapter · pages · percent', () => {
    assert.equal(statusLine('pdf', { chapter: 'Chapter 7', pageLabel: 'Pages 212–213 of 500', progress: 0.42 }),
        'Chapter 7 · Pages 212–213 of 500 · 42%')
})

test('an EPUB reads chapter · percent · pages left in chapter', () => {
    assert.equal(statusLine('epub', { chapter: 'Chapter 7', pageLabel: '42%', progress: 0.42, pagesLeftInChapter: 12 }),
        'Chapter 7 · 42% · 12 pages left in chapter')
    assert.equal(statusLine('epub', { chapter: 'Chapter 7', pageLabel: '42%', progress: 0.42, pagesLeftInChapter: 1 }),
        'Chapter 7 · 42% · 1 page left in chapter')
    assert.equal(statusLine('epub', { chapter: 'Chapter 7', pageLabel: '42%', progress: 0.42, pagesLeftInChapter: 0 }),
        'Chapter 7 · 42% · Last page of chapter')
})

test('parts it has no value for are left out', () => {
    assert.equal(statusLine('pdf', { chapter: '', pageLabel: 'Page 1 of 45', progress: 0 }), 'Page 1 of 45 · 0%')
    // A fixed-layout EPUB has no reflowed pages to count.
    assert.equal(statusLine('epub', { chapter: 'Cover', pageLabel: '3%', progress: 0.03, pagesLeftInChapter: null }),
        'Cover · 3%')
})
