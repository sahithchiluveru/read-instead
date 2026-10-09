// The web side of the native ↔ WebView boundary. The Android shell injects
// `ReadInsteadNative` (the Reader session bridge), `ReadInsteadLibrary` (the books on the
// TV), `ReadInsteadPhone` (the Phone Page link) and `ReadInsteadSettings` (the reader's
// settings); in a plain browser none exists and nothing is persisted.
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

// The reader's saved settings, by name ('font', 'size', 'theme', 'layout'); a setting
// never saved is missing. Values are strings.
const settings = () => globalThis.ReadInsteadSettings
export const savedSettings = () => JSON.parse(settings()?.load() ?? '{}')

export const saveSetting = (name, value) => settings()?.save(name, String(value))

// The owner's reading speed, kept among the settings as JSON (see reading-speed.js), or null
// if never saved or unreadable.
export const savedReadingSpeed = () => {
    try {
        return JSON.parse(savedSettings()['reading-speed'] ?? 'null')
    } catch {
        return null
    }
}

export const saveReadingSpeed = speed => saveSetting('reading-speed', JSON.stringify(speed))

// A book's own saved settings, by name (a PDF's 'pairing' and 'fit-width', a CBZ's
// 'right-to-left'), the same way.
export const savedBookSettings = bookId => JSON.parse(settings()?.loadBook(bookId) ?? '{}')

export const saveBookSetting = (bookId, name, value) => settings()?.saveBook(bookId, name, String(value))

// Report the Reader's state; the native side saves the Position, keeps the screen on
// while a book is open, and will answer Now Reading from it. Either { open: false } or
// { open: true, bookId, format ('epub', 'pdf' or 'cbz'), mode, position, pageLabel, progress,
// chapter, charactersLeftInChapter, minutesLeftInChapter, left, right }, where mode is 'reading', 'bar'
// (Bar focus), 'contents', 'go-to', 'font', 'theme' or 'image-viewer' (the overlays), and an EPUB adds
// pagesLeftInChapter. The time left is null until the reading speed is known.
export const reportState = state => native()?.onReaderState(JSON.stringify(state))
