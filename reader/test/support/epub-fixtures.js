// Fixture EPUBs for the Reader-seam tests, built in memory so their contents are
// readable here rather than hidden in binary files.
import { zip } from './zip.js'

const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`

const xhtml = (title, body, head = '') => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>${title}</title>${head}</head>
<body>${body}</body>
</html>`

const opf = ({ title, metadata = '', manifest, spine }) => `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:${title.replace(/\W/g, '-')}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
    ${metadata}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifest}
  </manifest>
  <spine>${spine}</spine>
</package>`

const nav = items => xhtml('Contents', `<nav epub:type="toc"><ol>${
    items.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('')}</ol></nav>`)

const epub = files => zip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', container],
    ...Object.entries(files).map(([path, content]) => [`OEBPS/${path}`, content]),
])

const words = ('the old house stood at the end of a long road where the river bends ' +
    'toward the hills and every evening the light fell slowly across the fields ').split(' ')
// A paragraph of prose that starts with a unique, searchable marker.
const paragraph = (marker, length = 70) =>
    `<p>${marker} ${Array.from({ length }, (_, i) => words[i % (words.length - 1)]).join(' ')}.</p>`

const svg = (width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#8a6"/></svg>`

// Three chapters:
// - "Chapter One" fits in a single column, so its Spread's right page stays blank.
// - "Chapter Two" spans several Spreads and contains a very tall and a very wide image.
// - "Chapter Three" must start in the left column of a fresh Spread.
export const chaptersEpub = () => {
    const chapterTwo = [
        '<h1>Chapter Two</h1>',
        ...Array.from({ length: 6 }, (_, i) => paragraph(`Two-${i + 1}`)),
        '<p><img id="tall" src="tall.svg" alt="tall"/></p>',
        ...Array.from({ length: 6 }, (_, i) => paragraph(`Two-${i + 7}`)),
        '<p><img id="wide" src="wide.svg" alt="wide"/></p>',
        ...Array.from({ length: 6 }, (_, i) => paragraph(`Two-${i + 13}`)),
    ].join('\n')
    return epub({
        'content.opf': opf({
            title: 'Chapters Fixture',
            manifest: `
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch3" href="ch3.xhtml" media-type="application/xhtml+xml"/>
    <item id="tall" href="tall.svg" media-type="image/svg+xml"/>
    <item id="wide" href="wide.svg" media-type="image/svg+xml"/>`,
            spine: '<itemref idref="ch1"/><itemref idref="ch2"/><itemref idref="ch3"/>',
        }),
        'nav.xhtml': nav([['ch1.xhtml', 'Chapter One'], ['ch2.xhtml', 'Chapter Two'], ['ch3.xhtml', 'Chapter Three']]),
        // Books are untrusted: their scripts must never run (they could reach the native bridges).
        'ch1.xhtml': xhtml('Chapter One', '<h1>Chapter One</h1>\n<p>One-1 A short opening chapter.</p>' +
            '<script>window.top.bookScriptRan = "inline"</script>' +
            `<img src="missing.png" alt="" onerror="window.top.bookScriptRan = 'handler'"/>`),
        'ch2.xhtml': xhtml('Chapter Two', chapterTwo),
        'ch3.xhtml': xhtml('Chapter Three', ['<h1>Chapter Three</h1>',
            ...Array.from({ length: 3 }, (_, i) => paragraph(`Three-${i + 1}`))].join('\n')),
        'tall.svg': svg(1000, 3000),
        'wide.svg': svg(3000, 500),
    })
}

// Five pre-paginated pages: the cover stands alone on the right, then 2–3 and 4–5 face each other.
export const fixedLayoutEpub = () => {
    const pages = [1, 2, 3, 4, 5]
    const page = n => xhtml(`Page ${n}`, `<p style="font-size:60px">Page ${n}</p>`,
        '<meta name="viewport" content="width=600, height=800"/>')
    return epub({
        'content.opf': opf({
            title: 'Fixed Layout Fixture',
            metadata: `<meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:spread">landscape</meta>`,
            manifest: pages.map(n =>
                `<item id="p${n}" href="p${n}.xhtml" media-type="application/xhtml+xml"/>`).join('\n'),
            spine: pages.map(n => `<itemref idref="p${n}"/>`).join(''),
        }),
        'nav.xhtml': nav(pages.map(n => [`p${n}.xhtml`, `Page ${n}`])),
        ...Object.fromEntries(pages.map(n => [`p${n}.xhtml`, page(n)])),
    })
}
