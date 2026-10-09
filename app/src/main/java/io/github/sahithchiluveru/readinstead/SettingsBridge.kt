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

    /** A PDF's own saved settings (Pairing, Fit-width), as [load]. */
    @JavascriptInterface
    fun loadPdf(bookId: String): String = settings.pdfToJson(bookId)

    /** Saves one of a PDF's own settings; anything else is ignored. */
    @JavascriptInterface
    fun savePdf(bookId: String, name: String, value: String) {
        settings.savePdf(bookId, name, value)
    }
}
