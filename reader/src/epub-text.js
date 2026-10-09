// Text of what's on screen in an EPUB, for Now Reading and Copy.

const isText = node => node.nodeType === Node.TEXT_NODE
    && !node.parentElement?.closest('script, style')

// The text nodes a range touches, with the offsets the range covers in each.
const textSegments = range => {
    const root = range.commonAncestorContainer
    const nodes = []
    if (isText(root)) nodes.push(root)
    else {
        const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode())
            if (isText(node) && range.intersectsNode(node)) nodes.push(node)
    }
    return nodes.map(node => ({
        node,
        start: node === range.startContainer ? range.startOffset : 0,
        end: node === range.endContainer ? range.endOffset : node.length,
    }))
}

const blockOf = node => {
    let el = node.parentElement
    // A floated letter or two is a drop cap, the start of its paragraph's first word, though
    // floating makes it a block.
    const isInline = el => {
        const style = el.ownerDocument.defaultView.getComputedStyle(el)
        return style.display.startsWith('inline') || style.float !== 'none' && el.textContent.trim().length <= 2
    }
    while (el?.parentElement && isInline(el)) el = el.parentElement
    return el
}

// A range's text with one line per paragraph (block element) and whitespace collapsed.
export const rangeText = range => {
    let text = ''
    let block = null
    for (const { node, start, end } of textSegments(range)) {
        const nodeBlock = blockOf(node)
        if (block && nodeBlock !== block) text += '\n'
        block = nodeBlock
        text += node.data.slice(start, end).replace(/\s+/g, ' ')
    }
    return text.split('\n').map(line => line.trim()).filter(Boolean).join('\n')
}

// The first character of a range that is laid out at or right of x (the left edge of the
// right column), or null if all of it sits in the left column. Characters run down the
// left column before the right one, so the answer is found by bisection.
const columnBreak = (range, x) => {
    const doc = range.startContainer.ownerDocument
    const reachesRight = (node, start, end) => {
        const part = doc.createRange()
        part.setStart(node, start)
        part.setEnd(node, end)
        return [...part.getClientRects()].some(rect => rect.width > 0 && rect.left >= x)
    }
    for (const { node, start, end } of textSegments(range)) {
        if (!reachesRight(node, start, end)) continue
        let [lo, hi] = [start + 1, end] // smallest prefix end that reaches the right column
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (reachesRight(node, start, mid)) hi = mid
            else lo = mid + 1
        }
        return { node, offset: lo - 1 }
    }
    return null
}

// A word hyphenated across a page break belongs to the page where it starts, whole.
// The point just past the word a text offset falls inside (or the offset itself, at a
// word's edge).
const wordEnd = ({ node, offset }) => {
    if (!isText(node) || offset === 0 || offset >= node.length || /\s/.test(node.data[offset - 1])
        || /\s/.test(node.data[offset])) return { node, offset }
    const space = node.data.slice(offset).search(/\s/)
    return { node, offset: space === -1 ? node.length : offset + space }
}

// The range with a word split at either end by hyphenation moved wholly onto the page
// where it starts: dropped from the start, completed at the end.
export const wholeWords = range => {
    const whole = range.cloneRange()
    const start = wordEnd({ node: range.startContainer, offset: range.startOffset })
    const end = wordEnd({ node: range.endContainer, offset: range.endOffset })
    whole.setEnd(end.node, end.offset)
    whole.setStart(start.node, start.offset)
    return whole
}

// Split the visible range of a two-column Spread into the left and right page's text.
export const splitAtColumn = (range, x) => {
    const found = columnBreak(range, x)
    if (!found) return { left: rangeText(range), right: '' }
    const point = wordEnd(found)
    const left = range.cloneRange()
    left.setEnd(point.node, point.offset)
    const right = range.cloneRange()
    right.setStart(point.node, point.offset)
    return { left: rangeText(left), right: rangeText(right) }
}
