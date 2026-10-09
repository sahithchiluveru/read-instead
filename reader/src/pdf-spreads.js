// PDF Spread math. Pages are 1-based, Spreads are 0-based.
// For now every PDF pairs 1–2, 3–4; book-style pairing arrives with the PDF reading ticket.

export const spreadCount = pageCount => Math.ceil(pageCount / 2)

export const spreadPages = (spread, pageCount) => {
    const first = spread * 2 + 1
    return first + 1 <= pageCount ? [first, first + 1] : [first]
}
