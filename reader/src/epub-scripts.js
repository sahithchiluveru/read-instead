// Books are untrusted files from the internet, and Android exposes the native bridges
// (Access Key, Positions) to every frame, including the book's. So no book script runs:
// each (X)HTML document gets a policy forbidding scripts and nested frames, and SVG
// documents, where that policy can't be declared, lose their scripts and handlers.

const POLICY = "script-src 'none'; object-src 'none'; frame-src 'none'"
const HTML_TYPES = ['application/xhtml+xml', 'text/html']
const SVG_TYPE = 'image/svg+xml'

const addPolicy = markup => {
    const meta = `<meta http-equiv="Content-Security-Policy" content="${POLICY}"/>`
    const head = markup.match(/<head\b[^>]*>/i)
    if (head) return markup.replace(head[0], head[0] + meta)
    const html = markup.match(/<html\b[^>]*>/i)
    return html ? markup.replace(html[0], `${html[0]}<head>${meta}</head>`) : meta + markup
}

const stripSvgScripts = markup => {
    const doc = new DOMParser().parseFromString(markup, SVG_TYPE)
    if (doc.querySelector('parsererror')) return ''
    for (const script of doc.querySelectorAll('script')) script.remove()
    for (const el of doc.querySelectorAll('*'))
        for (const { name, value } of [...el.attributes])
            if (/^on/i.test(name) || /^\s*javascript:/i.test(value)) el.removeAttribute(name)
    return new XMLSerializer().serializeToString(doc)
}

// Listen on a foliate book's transformTarget, which sees each document as it's loaded.
export const blockBookScripts = book => book.transformTarget?.addEventListener('data', ({ detail }) => {
    if (HTML_TYPES.includes(detail.type)) detail.data = Promise.resolve(detail.data).then(addPolicy)
    else if (detail.type === SVG_TYPE) detail.data = Promise.resolve(detail.data).then(stripSvgScripts)
})
