// Assembles reader/dist (or the directory given as the first argument), which the
// Android app bundles as assets/reader.
// Layout: src/ (our code), vendor/ (foliate-js, pdf.js, uqr, the reading fonts).
import { cp, rm, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = process.argv[2] ? resolve(process.argv[2]) : join(root, 'dist')
const modules = join(root, 'node_modules')

// foliate-js formats we don't support, its demo UI and its own pdf.js copy stay out.
const foliateSkip = ['vendor/pdfjs', 'tests', 'ui', 'rollup', 'reader.html', 'reader.js',
    'mobi.js', 'fb2.js', 'eslint.config.js', 'rollup.config.js', 'package.json', 'package-lock.json', 'comic-book.js', 'opds.js', 'dict.js', 'pdf.js']
const pdfjsFiles = ['build/pdf.min.mjs', 'build/pdf.worker.min.mjs', 'wasm', 'cmaps',
    'standard_fonts', 'iccs', 'LICENSE']

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await cp(join(root, 'src'), join(dist, 'src'), { recursive: true })

const foliate = join(modules, 'foliate-js')
await cp(foliate, join(dist, 'vendor/foliate-js'), {
    recursive: true,
    filter: path => {
        const rel = path.slice(foliate.length + 1).replaceAll('\\', '/')
        return !foliateSkip.some(skip => rel === skip || rel.startsWith(skip + '/'))
            && !rel.endsWith('.md') && !rel.startsWith('.') && !rel.includes('/.')
    },
})
for (const file of pdfjsFiles)
    await cp(join(modules, 'pdfjs-dist', file), join(dist, 'vendor/pdfjs', file), { recursive: true })

for (const file of ['dist/index.mjs', 'LICENSE'])
    await cp(join(modules, 'uqr', file), join(dist, 'vendor/uqr', file))

// The reading fonts, Latin and Latin Extended only: Literata (with its optical-size axis)
// and Atkinson Hyperlegible Next, upright and italic. Other scripts fall back to the system.
const fonts = {
    literata: ['literata-latin', 'literata-latin-ext'].flatMap(name =>
        [`${name}-opsz-normal.woff2`, `${name}-opsz-italic.woff2`]),
    'atkinson-hyperlegible-next': ['atkinson-hyperlegible-next-latin', 'atkinson-hyperlegible-next-latin-ext']
        .flatMap(name => [`${name}-wght-normal.woff2`, `${name}-wght-italic.woff2`]),
}
for (const [family, files] of Object.entries(fonts)) {
    const from = join(modules, '@fontsource-variable', family)
    for (const file of files) await cp(join(from, 'files', file), join(dist, 'vendor/fonts', file))
    await cp(join(from, 'LICENSE'), join(dist, 'vendor/fonts', `${family}-LICENSE`))
}

console.log(`reader built into ${dist}`)
