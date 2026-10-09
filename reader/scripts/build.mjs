// Assembles reader/dist, which the Android app bundles as assets/reader.
// Layout: src/ (our code), vendor/ (foliate-js, pdf.js), books/ (bundled sample books).
import { cp, rm, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const modules = join(root, 'node_modules')

// foliate-js formats we don't support, its demo UI and its own pdf.js copy stay out.
const foliateSkip = ['vendor/pdfjs', 'tests', 'ui', 'rollup', 'reader.html', 'reader.js',
    'mobi.js', 'fb2.js', 'eslint.config.js', 'rollup.config.js', 'package.json', 'package-lock.json', 'comic-book.js', 'opds.js', 'dict.js', 'pdf.js']
const pdfjsFiles = ['build/pdf.min.mjs', 'build/pdf.worker.min.mjs', 'wasm', 'cmaps',
    'standard_fonts', 'iccs', 'LICENSE']

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await cp(join(root, 'src'), join(dist, 'src'), { recursive: true })
await cp(join(root, 'fixtures'), join(dist, 'books'), { recursive: true })

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

console.log(`reader built into ${dist}`)
