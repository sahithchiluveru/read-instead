// The web side of the native ↔ WebView boundary. The Android shell injects
// `ReadInsteadNative` (the Reader session bridge), `ReadInsteadLibrary` (the books on the
// TV) and `ReadInsteadPhone` (the Phone Page link); in a plain browser none exists and
// nothing is persisted.
const native = () => globalThis.ReadInsteadNative

// The saved Position of a book, or null to start from the beginning.
export const loadPosition = bookId => native()?.loadPosition(bookId) ?? null

// The Library's books, most recently read first:
// [{ id, format, title, author, progress, unreadable, coverType, ... }].
export const libraryBooks = () => JSON.parse(globalThis.ReadInsteadLibrary?.books() ?? '[]')

// The Phone Page link for the Add books screen: { address, url, error }. The url carries
// the Access Key, for the QR code; without one (e.g. no Wi-Fi), error says why.
const phone = () => globalThis.ReadInsteadPhone
const parseLink = json => json ? JSON.parse(json) : { address: null, url: null, error: null }
export const phoneLink = () => parseLink(phone()?.link())

// Reset the Access Key, locking out every connected phone; returns the new link.
export const resetPhoneKey = () => parseLink(phone()?.resetKey())

// Report the Reader's state; the native side saves the Position, keeps the screen on
// while a book is open, and will answer Now Reading from it. Either { open: false } or
// { open: true, bookId, format, mode, position, pageLabel, progress, chapter, left, right }.
export const reportState = state => native()?.onReaderState(JSON.stringify(state))
