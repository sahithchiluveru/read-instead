// Reader session bridge: the web side of the native ↔ WebView boundary. The Android
// shell injects `ReadInsteadNative`; in a plain browser there is no bridge and nothing
// is persisted.
const native = () => globalThis.ReadInsteadNative

// The saved Position of a book, or null to start from the beginning.
export const loadPosition = bookId => native()?.loadPosition(bookId) ?? null

// Report the Reader's state; the native side saves the Position, keeps the screen on
// while a book is open, and will answer Now Reading from it. Either { open: false } or
// { open: true, bookId, format, mode, position, progress, chapter, left, right }.
export const reportState = state => native()?.onReaderState(JSON.stringify(state))
