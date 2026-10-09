package io.github.sahithchiluveru.readinstead.library

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The reader's look (font, size, theme and page layout): global for every book and kept
 * with the app's other settings in the Library's store. The reader owns the values; only
 * these names can be read or written, so the reader never sees the Access Key.
 */
class ReaderSettings(private val library: Library) {
    /** The saved settings as a JSON object of strings; one never saved is missing. */
    fun toJson(): String = JsonObject(
        NAMES.mapNotNull { name -> library.setting(KEY_PREFIX + name)?.let { name to JsonPrimitive(it) } }.toMap()
    ).toString()

    /** Saves a setting; false (and nothing saved) if it isn't one of the reader's. */
    fun save(name: String, value: String): Boolean {
        if (name !in NAMES) return false
        library.saveSetting(KEY_PREFIX + name, value)
        return true
    }

    private companion object {
        val NAMES = listOf("font", "size", "theme", "layout")
        const val KEY_PREFIX = "reader."
    }
}
