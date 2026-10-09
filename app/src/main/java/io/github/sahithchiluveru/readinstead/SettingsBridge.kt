package io.github.sahithchiluveru.readinstead

import android.webkit.JavascriptInterface
import io.github.sahithchiluveru.readinstead.library.ReaderSettings

/** The reader's global settings (font, size, theme, layout), exposed to the web reader as `ReadInsteadSettings`. */
class SettingsBridge(private val settings: ReaderSettings) {
    /** The saved settings as a JSON object of strings; one never saved is missing. */
    @JavascriptInterface
    fun load(): String = settings.toJson()

    /** Saves a setting; a name that isn't one of the reader's is ignored. */
    @JavascriptInterface
    fun save(name: String, value: String) {
        settings.save(name, value)
    }
}
