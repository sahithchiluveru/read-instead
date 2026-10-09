package io.github.sahithchiluveru.readinstead.library

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The reader's settings, kept in the Library's store. Its look (font, size, theme and page
 * layout) is global for every book and kept with the app's other settings; a PDF's Pairing
 * and Fit-width are its own, kept in its record. The reader owns the values; only these
 * names can be read or written, so the reader never sees the Access Key.
 */
class ReaderSettings(private val library: Library) {
    /** The saved settings as a JSON object of strings; one never saved is missing. */
    fun toJson(): String = NAMES.mapNotNull { name -> library.setting(KEY_PREFIX + name)?.let { name to it } }.toJson()

    /** Saves a setting; false (and nothing saved) if it isn't one of the reader's. */
    fun save(name: String, value: String): Boolean {
        if (name !in NAMES) return false
        library.saveSetting(KEY_PREFIX + name, value)
        return true
    }

    /** A PDF's own saved settings, as [toJson]; empty for a book not on the Shelf. */
    fun pdfToJson(bookId: String): String =
        library.book(bookId)?.pdfSettings.orEmpty().filterKeys { it in PDF_NAMES }.toList().toJson()

    /** Saves one of a PDF's own settings; false (and nothing saved) if it isn't one, or there's no such book. */
    fun savePdf(bookId: String, name: String, value: String): Boolean =
        name in PDF_NAMES && library.savePdfSetting(bookId, name, value)

    private fun List<Pair<String, String>>.toJson() =
        JsonObject(associate { (name, value) -> name to JsonPrimitive(value) }).toString()

    private companion object {
        val NAMES = listOf("font", "size", "theme", "layout")
        val PDF_NAMES = listOf("pairing", "fit-width")
        const val KEY_PREFIX = "reader."
    }
}
