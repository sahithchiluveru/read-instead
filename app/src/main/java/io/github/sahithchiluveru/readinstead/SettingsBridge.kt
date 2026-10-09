package io.github.sahithchiluveru.readinstead

import android.webkit.JavascriptInterface
import io.github.sahithchiluveru.readinstead.library.ReaderSettings
import java.util.concurrent.Executors

/**
 * The reader's settings, exposed to the web reader as `ReadInsteadSettings`: the global ones
 * (font, size, theme, layout, reading speed) and a book's own (a PDF's Pairing and Fit-width,
 * a CBZ's Right to left).
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

    /** A book's own saved settings (Pairing, Fit-width, Right to left), as [load]. */
    @JavascriptInterface
    fun loadBook(bookId: String): String {
        awaitSaves()
        return settings.bookToJson(bookId)
    }

    /** Saves one of a book's own settings; anything else is ignored. */
    @JavascriptInterface
    fun saveBook(bookId: String, name: String, value: String) {
        saves.execute { settings.saveForBook(bookId, name, value) }
    }

    private fun awaitSaves() {
        saves.submit {}.get()
    }
}
