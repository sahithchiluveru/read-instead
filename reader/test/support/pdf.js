// Minimal PDF writer for fixtures: pages of Helvetica text lines, with an optional
// /PageLayout and outline.

const escape = text => text.replace(/[\\()]/g, c => `\\${c}`)

// pages: [{ width, height, lines: [string] }]
// outline: [{ title, page }] (1-based page numbers), pageLayout: e.g. 'TwoPageRight'.
export const pdf = ({ pages, outline = [], pageLayout }) => {
    const objects = [] // objects[i] is object number i + 1
    const add = body => objects.push(body)
    const ref = n => `${n} 0 R`

    // Fixed numbers: 1 catalog, 2 page tree, 3 font, 4 outline root (if any).
    add(null)
    add(null)
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    const outlineRoot = outline.length ? add(null) : null
    const pageRefs = pages.map(({ width, height, lines }) => {
        const stream = lines.map((line, i) =>
            `BT /F1 24 Tf 40 ${height - 60 - i * 32} Td (${escape(line)}) Tj ET`).join('\n')
        const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
        return add(`<< /Type /Page /Parent ${ref(2)} /MediaBox [0 0 ${width} ${height}] ` +
            `/Resources << /Font << /F1 ${ref(3)} >> >> /Contents ${ref(content)} >>`)
    })
    if (outlineRoot) {
        const first = objects.length + 1
        outline.forEach(({ title, page }, i) => add(`<< /Title (${escape(title)}) /Parent ${ref(outlineRoot)}` +
            (i ? ` /Prev ${ref(first + i - 1)}` : '') +
            (i < outline.length - 1 ? ` /Next ${ref(first + i + 1)}` : '') +
            ` /Dest [${ref(pageRefs[page - 1])} /Fit] >>`))
        objects[outlineRoot - 1] = `<< /Type /Outlines /First ${ref(first)} ` +
            `/Last ${ref(first + outline.length - 1)} /Count ${outline.length} >>`
    }
    objects[0] = `<< /Type /Catalog /Pages ${ref(2)}` +
        (pageLayout ? ` /PageLayout /${pageLayout}` : '') +
        (outlineRoot ? ` /Outlines ${ref(outlineRoot)}` : '') + ' >>'
    objects[1] = `<< /Type /Pages /Kids [${pageRefs.map(ref).join(' ')}] /Count ${pages.length} >>`

    let out = '%PDF-1.7\n'
    const offsets = objects.map((body, i) => {
        const offset = out.length
        out += `${i + 1} 0 obj\n${body}\nendobj\n`
        return offset
    })
    const xref = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
        `trailer\n<< /Size ${objects.length + 1} /Root ${ref(1)} >>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(out, 'latin1')
}
