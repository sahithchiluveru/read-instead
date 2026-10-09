package io.github.sahithchiluveru.readinstead

import android.webkit.JavascriptInterface
import io.github.sahithchiluveru.readinstead.library.ReaderSettings

/**
 * The reader's settings, exposed to the web reader as `ReadInsteadSettings`: the global ones
 * (font, size, theme, layout) and a PDF's own (Pairing, Fit-width).
 */
class SettingsBridge(private val settings: ReaderSettings) {
    /** The saved settings as a JSON object of strings; one never saved is missing. */
    @JavascriptInterface
    fun load(): String = settings.toJson()

    /** Saves a setting; a name that isn't one of the reader's is ignored. */
    @JavascriptInterface
    fun save(name: String, value: String) {
        settings.save(name, value)
    }

    /** A book's own saved settings, as [load]. */
    @JavascriptInterface
    fun loadBook(bookId: String): String = settings.bookToJson(bookId)

    /** Saves one of a book's own settings; anything else is ignored. */
    @JavascriptInterface
    fun saveBook(bookId: String, name: String, value: String) {
        settings.saveForBook(bookId, name, value)
    }
}
