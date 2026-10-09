// The Top Bar's status line for the Spread on screen, from what the reader reports:
// - PDF: "Chapter 7 · Pages 212–213 of 500 · 42% · ~25 min left in chapter"
// - EPUB: "Chapter 7 · 42% · 12 pages left in chapter · ~25 min left in chapter"
// - CBZ: "Pages 2–3 of 180 · 1%"
// Parts with no value (no chapter, a fixed-layout EPUB's pages left, the time left before
// the reading speed is known) are left out.
export const statusLine = (format, { chapter, pageLabel, progress, pagesLeftInChapter, minutesLeftInChapter }) => [
    chapter,
    format === 'epub' ? null : pageLabel, // an EPUB's page label is its percentage
    `${Math.round(progress * 100)}%`,
    pagesLeft(pagesLeftInChapter),
    minutesLeftInChapter == null ? null : `~${minutesLeftInChapter} min left in chapter`,
].filter(Boolean).join(' · ')

const pagesLeft = count => {
    if (count == null) return null
    if (count === 0) return 'Last page of chapter'
    return `${count} ${count === 1 ? 'page' : 'pages'} left in chapter`
}
