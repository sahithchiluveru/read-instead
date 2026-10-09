// Fixture PDFs for the Reader-seam tests. Every page reads "Page N" then
// "Second line of page N".
import { pdf } from './pdf.js'

const pages = (count, size) => Array.from({ length: count }, (_, i) => ({
    ...size, lines: [`Page ${i + 1}`, `Second line of page ${i + 1}`],
}))

const letter = { width: 612, height: 792 }

// A 45-page book at a 6×9 in trim, with chapters in its outline: paired like print.
export const bookPdf = () => pdf({
    pages: pages(45, { width: 432, height: 648 }),
    outline: [{ title: 'Chapter One', page: 2 }, { title: 'Chapter Two', page: 10 }],
})

// A short Letter-size report: paired 1–2, 3–4.
export const paperPdf = () => pdf({ pages: pages(5, letter) })

// A Letter-size document whose /PageLayout asks for print-style pairing.
export const twoPageRightPdf = () => pdf({ pages: pages(6, letter), pageLayout: 'TwoPageRight' })

// 16:9 slides: one per screen.
export const slidesPdf = () => pdf({ pages: pages(4, { width: 960, height: 540 }) })
