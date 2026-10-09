package io.github.sahithchiluveru.readinstead

import android.webkit.JavascriptInterface
import io.github.sahithchiluveru.readinstead.library.ReaderSettings
import java.util.concurrent.Executors

/**
 * The reader's settings, exposed to the web reader as `ReadInsteadSettings`: the global ones
 * (font, size, theme, layout, reading speed) and a PDF's own (Pairing, Fit-width).
 */
class SettingsBridge(private val settings: ReaderSettings) {
    // The reader waits on every bridge call, and the reading speed is saved on most page
    // turns, so saves (disk writes) run off its thread, in order. Loads wait for them.
    private val saves = Executors.newSingleThreadExecutor()

    /** The saved settings as a JSON object of strings; one never saved is missing. */
    @JavascriptInterface
    fun load(): String {
        awaitSaves()
        return settings.toJson()
    }

    /** Saves a setting; a name that isn't one of the reader's is ignored. */
    @JavascriptInterface
    fun save(name: String, value: String) {
        saves.execute { settings.save(name, value) }
    }

    /** A PDF's own saved settings (Pairing, Fit-width), as [load]. */
    @JavascriptInterface
    fun loadPdf(bookId: String): String {
        awaitSaves()
        return settings.pdfToJson(bookId)
    }

    /** Saves one of a PDF's own settings; anything else is ignored. */
    @JavascriptInterface
    fun savePdf(bookId: String, name: String, value: String) {
        saves.execute { settings.savePdf(bookId, name, value) }
    }

    private fun awaitSaves() {
        saves.submit {}.get()
    }
}
