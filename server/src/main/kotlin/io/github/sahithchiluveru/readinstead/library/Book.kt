package io.github.sahithchiluveru.readinstead.library

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

@Serializable
enum class Format(val extension: String, val mimeType: String) {
    @SerialName("epub") EPUB("epub", "application/epub+zip"),
    @SerialName("pdf") PDF("pdf", "application/pdf");

    companion object {
        /** The format a file name declares, or null if it isn't an EPUB or PDF. */
        fun of(fileName: String): Format? =
            entries.firstOrNull { fileName.endsWith(".${it.extension}", ignoreCase = true) }
    }
}

/**
 * A book on the Shelf. Its id is the SHA-256 of the file's contents, so the same book
 * uploaded twice is recognised. [unreadable] books (corrupt, DRM) are kept, so the owner
 * can see them and delete them.
 */
@Serializable
data class Book(
    val id: String,
    val format: Format,
    val title: String,
    val author: String? = null,
    val addedAt: Long,
    val lastOpenedAt: Long? = null,
    val position: String? = null,
    val progress: Double = 0.0,
    val unreadable: Boolean = false,
    val coverType: String? = null,
)

/** A cover image and its media type. */
class Cover(val bytes: ByteArray, val type: String)

/** The platform's image work: rendering PDF pages and resizing covers for the Shelf. */
interface Covers {
    /** The first page of a PDF as an image, or null for none. Throws if the PDF can't be opened. */
    fun pdfFirstPage(file: File): Cover? = null

    /** The cover sized for the Shelf, or null if it isn't a usable image. */
    fun shrink(cover: Cover): Cover? = cover
}

internal val json = Json {
    encodeDefaults = true
    ignoreUnknownKeys = true
}

fun Book.toJson(): String = json.encodeToString(this)
fun List<Book>.toJson(): String = json.encodeToString(this)
