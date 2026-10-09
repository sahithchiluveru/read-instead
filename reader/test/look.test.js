import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chaptersEpub, numberedWordsEpub } from './support/epub-fixtures.js'
import { bookPdf } from './support/pdf-fixtures.js'
import { startReader } from './support/reader-harness.js'

const chapters = { id: 'chapters', format: 'epub' }
const numbered = { id: 'numbered', format: 'epub' }
const pdfBook = { id: 'book', format: 'pdf' }

// The colour tokens from docs/research/tv-reader-visual-design.md.
const themes = {
    sepia: { '--bg': '#F4ECD8', '--text': '#3D2F23', '--dim': '#7A6650', '--accent': '#A65A2A' },
    dark: { '--bg': '#1C1B1F', '--text': '#E2DCD2', '--dim': '#9A948B', '--accent': '#E0A458' },
    light: { '--bg': '#F7F7F4', '--text': '#1E1E1E', '--dim': '#6B6B6B', '--accent': '#2F6DB5' },
}

let reader
before(async () => {
    reader = await startReader({ chapters: chaptersEpub(), numbered: numberedWordsEpub(), book: bookPdf() })
})
after(() => reader.close())

const tokens = app => app.page.evaluate(names => {
    const style = getComputedStyle(document.documentElement)
    return Object.fromEntries(names.map(name => [name, style.getPropertyValue(name).trim().toUpperCase()]))
}, Object.keys(themes.sepia))
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

// How the book's text is set, read from the page on screen.
const epubLook = app => app.page.evaluate(() => {
    const { doc } = document.querySelector('foliate-view').renderer.getContents()[0]
    const body = doc.defaultView.getComputedStyle(doc.body)
    const p = doc.defaultView.getComputedStyle(doc.querySelector('p'))
    const families = [...doc.fonts].filter(face => face.status === 'loaded').map(face => face.family)
    return {
        family: body.fontFamily, size: body.fontSize, lineHeight: p.lineHeight, align: p.textAlign,
        hyphens: p.hyphens, color: p.color, loadedFonts: [...new Set(families)],
    }
})
const pdfCanvasLook = app => app.page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('#stage canvas'))
    return { blend: style.mixBlendMode, filter: style.filter }
})
// The horizontal extent of the page's lines on screen: those starting where the line
// holding the first word on screen starts (the next page's lines start a page further on).
const pageExtent = (app, firstWord) => app.page.evaluate(firstWord => {
    const { doc } = document.querySelector('foliate-view').renderer.getContents()[0]
    const frameLeft = doc.defaultView.frameElement.getBoundingClientRect().left
    const lines = node => {
        const range = doc.createRange()
        range.selectNodeContents(node)
        return [...range.getClientRects()].filter(rect => rect.width > 0)
            .map(rect => ({ left: frameLeft + rect.left, right: frameLeft + rect.right }))
    }
    const text = [...doc.querySelectorAll('p')].flatMap(p => [...p.childNodes])
        .find(node => node.data.split(' ').includes(firstWord))
    const range = doc.createRange()
    const at = text.data.split(' ').slice(0, text.data.split(' ').indexOf(firstWord)).join(' ').length
    range.setStart(text, at && at + 1)
    range.setEnd(text, (at && at + 1) + firstWord.length)
    const left = frameLeft + range.getBoundingClientRect().left
    const page = [...doc.querySelectorAll('p')].flatMap(lines).filter(line => Math.abs(line.left - left) < 2)
    return { left, right: Math.max(...page.map(line => line.right)) }
}, firstWord)
const focusedLabel = app => app.page.evaluate(() => document.activeElement.textContent)
const focusedButton = app => app.page.evaluate(() =>
    document.activeElement.closest('#top-bar') ? document.activeElement.textContent : null)
const words = state => `${state.left}\n${state.right}`.match(/w\d+/g)?.map(word => Number(word.slice(1))) ?? []
// Press a key that shouldn't report a new state, and give it time to (wrongly) do so.
const pressQuietly = async (app, key) => {
    await app.page.keyboard.press(key)
    await app.page.waitForTimeout(250)
}

// Bar focus, then OK on the Top Bar button with this label.
const openPanel = async (app, label) => {
    await app.press('ArrowUp')
    for (let i = 0; i < 10 && await focusedButton(app) !== label; i++) await app.page.keyboard.press('ArrowRight')
    assert.equal(await focusedButton(app), label)
    return app.press('Enter')
}

describe('the default look', () => {
    test('Sepia, with the research colour tokens', async () => {
        const app = await reader.launch()
        assert.deepEqual(await tokens(app), themes.sepia)
        assert.equal(await app.page.evaluate(() => getComputedStyle(document.body).backgroundColor), rgb(themes.sepia['--bg']))
        await app.close()
    })

    test('an EPUB is set in Literata at 20 dp, line height 1.5, justified and hyphenated', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const look = await epubLook(app)
        assert.match(look.family, /^"?Literata/)
        assert.ok(look.loadedFonts.some(family => /Literata/.test(family)), 'the bundled Literata loads')
        assert.equal(look.size, '20px')
        assert.equal(look.lineHeight, '30px')
        assert.equal(look.align, 'justify')
        assert.equal(look.hyphens, 'auto')
        assert.equal(look.color, rgb(themes.sepia['--text']))
        await app.close()
    })

    test('a saved setting the reader doesn\'t know falls back to the default', async () => {
        const app = await reader.launch({ settings: { theme: 'neon', size: '99', font: 'comic', layout: 'three' } })
        await app.open(chapters)
        assert.deepEqual(await tokens(app), themes.sepia)
        const look = await epubLook(app)
        assert.equal(look.size, '20px')
        assert.match(look.family, /^"?Literata/)
        assert.notEqual((await app.press('ArrowRight')).right, '', 'two pages to a Spread')
        await app.close()
    })
})

describe('Theme', () => {
    test('opens on the current theme; ←/→ apply each theme at once and save it', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        const panel = await openPanel(app, 'Theme')
        assert.equal(panel.mode, 'theme')
        assert.equal(await focusedLabel(app), 'Sepia')

        await app.press('ArrowRight')
        assert.equal(await focusedLabel(app), 'Dark')
        assert.deepEqual(await tokens(app), themes.dark)
        assert.equal((await epubLook(app)).color, rgb(themes.dark['--text']))
        assert.deepEqual(await app.page.evaluate(() => window.savedSettings), { theme: 'dark' })

        await app.press('ArrowRight')
        assert.deepEqual(await tokens(app), themes.light)
        assert.equal((await epubLook(app)).color, rgb(themes.light['--text']))
        assert.equal(await app.page.evaluate(() => window.savedSettings.theme), 'light')
        await app.close()
    })

    test('a saved theme applies from the start, to the Shelf and every book', async () => {
        const app = await reader.launch({ settings: { theme: 'dark' } })
        assert.deepEqual(await tokens(app), themes.dark)
        await app.open(chapters)
        assert.equal((await epubLook(app)).color, rgb(themes.dark['--text']))
        await app.close()
    })

    test('Back returns to Bar focus on Theme, and OK to Reading mode', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        await openPanel(app, 'Theme')
        assert.equal(await app.back(), true)
        assert.equal((await app.state()).mode, 'bar')
        assert.equal(await focusedButton(app), 'Theme')
        await app.press('Enter')
        assert.equal((await app.press('Enter')).mode, 'reading')
        assert.equal(await app.page.isVisible('#theme'), false)
        assert.equal((await app.press('ArrowRight')).chapter, 'Chapter Two')
        await app.close()
    })

    test('PDF pages are multiplied onto Sepia, inverted in Dark and left alone in Light', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        assert.deepEqual(await pdfCanvasLook(app), { blend: 'multiply', filter: 'none' })
        await openPanel(app, 'Theme')
        await pressQuietly(app, 'ArrowRight')
        const dark = await pdfCanvasLook(app)
        assert.equal(dark.blend, 'normal')
        assert.match(dark.filter, /invert/)
        await pressQuietly(app, 'ArrowRight')
        assert.deepEqual(await pdfCanvasLook(app), { blend: 'normal', filter: 'none' })
        await app.close()
    })
})

describe('Font', () => {
    test('rows for font, size and layout; ↑↓ move between rows, ←/→ change the value', async () => {
        const app = await reader.launch()
        await app.open(chapters)
        assert.equal((await openPanel(app, 'Font')).mode, 'font')
        assert.equal(await focusedLabel(app), 'Literata')
        await app.press('ArrowRight')
        assert.equal(await focusedLabel(app), 'Atkinson Hyperlegible')
        const sans = await epubLook(app)
        assert.match(sans.family, /^"?Atkinson Hyperlegible Next/)
        assert.ok(sans.loadedFonts.some(family => /Atkinson/.test(family)), 'the bundled sans loads')

        await pressQuietly(app, 'ArrowDown')
        assert.equal(await app.page.evaluate(() => document.activeElement.dataset.value), '20')
        await app.press('ArrowRight')
        await app.press('ArrowRight')
        assert.equal((await epubLook(app)).size, '25px')
        const count = await app.stateCount()
        await pressQuietly(app, 'ArrowRight')
        assert.equal(await app.stateCount(), count, '25 dp is the largest size')
        for (let i = 0; i < 4; i++) await app.press('ArrowLeft')
        assert.equal((await epubLook(app)).size, '16px')
        assert.deepEqual(await app.page.evaluate(() => window.savedSettings), { font: 'sans', size: '16' })

        await pressQuietly(app, 'ArrowDown')
        assert.equal(await focusedLabel(app), 'Two pages')
        await pressQuietly(app, 'ArrowUp')
        await pressQuietly(app, 'ArrowUp')
        assert.equal(await focusedLabel(app), 'Atkinson Hyperlegible')
        await app.close()
    })

    test('font and size persist across restarts for all books', async () => {
        const first = await reader.launch()
        await first.open(numbered)
        await openPanel(first, 'Font')
        await first.press('ArrowRight')
        await pressQuietly(first, 'ArrowDown')
        await first.press('ArrowRight')
        const settings = await first.page.evaluate(() => window.savedSettings)
        await first.close()

        const app = await reader.launch({ settings })
        await app.open(chapters)
        const look = await epubLook(app)
        assert.match(look.family, /^"?Atkinson Hyperlegible Next/)
        assert.equal(look.size, '22px')
        await app.close()
    })

    test('a size change reflows the book, keeping the first word on screen in view', async () => {
        const app = await reader.launch()
        await app.open(numbered)
        let state
        for (let i = 0; i < 3; i++) state = await app.press('ArrowRight')
        const [firstWord] = words(state)
        await openPanel(app, 'Font')
        await pressQuietly(app, 'ArrowDown')
        for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft']) {
            const reflowed = await app.press(key)
            assert.equal(reflowed.mode, 'font')
            assert.ok(words(reflowed).includes(firstWord), `w${firstWord} still on screen after ${key}`)
        }
        assert.equal((await epubLook(app)).size, '16px')
        assert.equal(await app.back(), true)
        await app.press('ArrowDown')
        // Turning carries on from the reflowed Spread.
        const shown = await app.state()
        const next = await app.press('ArrowRight')
        assert.equal(words(next)[0], words(shown).at(-1) + 1)
        await app.close()
    })
})

describe('the layout grid', () => {
    test('a Spread is two 408 dp columns with a 48 dp gutter, inside the 48 dp side margins', async () => {
        const app = await reader.launch()
        await app.open(numbered)
        const spread = await app.press('ArrowRight')
        const left = await pageExtent(app, `w${words(spread)[0]}`)
        const right = await pageExtent(app, `w${words({ left: spread.right, right: '' })[0]}`)
        const near = (box, from, to) => Math.abs(box.left - from) < 2 && Math.abs(box.right - to) < 2
        assert.ok(near(left, 48, 456), `left column: ${JSON.stringify(left)}`)
        assert.ok(near(right, 504, 912), `right column: ${JSON.stringify(right)}`)
        await app.close()
    })
})

describe('single-page layout', () => {
    test('an EPUB shows one centred column, turned a page at a time, and the setting is saved', async () => {
        const app = await reader.launch()
        await app.open(numbered)
        const spread = await app.press('ArrowRight')
        await openPanel(app, 'Font')
        await pressQuietly(app, 'ArrowDown')
        await pressQuietly(app, 'ArrowDown')
        const single = await app.press('ArrowRight')
        assert.equal(await focusedLabel(app), 'One page')
        assert.equal(single.right, '')
        assert.ok(words(single).includes(words(spread)[0]), 'the reader stays where they were')
        const box = await pageExtent(app, `w${words(single)[0]}`)
        assert.ok(Math.abs(box.left - 276) < 2 && Math.abs(box.right - 684) < 2,
            `one 408 dp column, centred: ${JSON.stringify(box)}`)
        assert.deepEqual(await app.page.evaluate(() => window.savedSettings), { layout: 'single-page' })

        assert.equal(await app.back(), true)
        await app.press('ArrowDown')
        const next = await app.press('ArrowRight')
        assert.equal(next.right, '')
        assert.equal(words(next)[0], words(single).at(-1) + 1)
        assert.equal(next.pagesLeftInChapter, single.pagesLeftInChapter - 1)
        await app.close()
    })

    test('a PDF shows one page at a time, and a restart keeps the layout', async () => {
        const app = await reader.launch()
        await app.open(pdfBook)
        assert.equal((await app.press('ArrowRight')).pageLabel, 'Pages 2–3 of 45')
        await openPanel(app, 'Font')
        await pressQuietly(app, 'ArrowDown')
        await pressQuietly(app, 'ArrowDown')
        const single = await app.press('ArrowRight')
        assert.equal(single.pageLabel, 'Page 2 of 45')
        assert.equal(single.right, '')
        assert.equal(await app.page.locator('#stage canvas').count(), 1)
        const settings = await app.page.evaluate(() => window.savedSettings)
        await app.close()

        const again = await reader.launch({ settings, positions: { book: '3' } })
        const reopened = await again.open(pdfBook)
        assert.equal(reopened.pageLabel, 'Page 3 of 45')
        assert.equal((await again.press('ArrowRight')).pageLabel, 'Page 4 of 45')
        const [canvas] = await again.page.evaluate(() =>
            [...document.querySelectorAll('#stage canvas')].map(c => c.getBoundingClientRect().toJSON()))
        assert.ok(Math.abs((canvas.left + canvas.right) / 2 - 480) < 2, 'the page is centred')
        await again.close()
    })
})
