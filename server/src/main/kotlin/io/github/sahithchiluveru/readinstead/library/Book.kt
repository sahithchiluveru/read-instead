package io.github.sahithchiluveru.readinstead.library

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNames
import java.io.File

@Serializable
enum class Format(val extension: String, val mimeType: String) {
    @SerialName("epub") EPUB("epub", "application/epub+zip"),
    @SerialName("pdf") PDF("pdf", "application/pdf"),
    /** A comic or manga: a ZIP of page images (CBR, a RAR, isn't supported). */
    @SerialName("cbz") CBZ("cbz", "application/vnd.comicbook+zip");

    companion object {
        /** The format a file name declares, or null if it isn't an EPUB, PDF or CBZ. */
        fun of(fileName: String): Format? =
            entries.firstOrNull { fileName.endsWith(".${it.extension}", ignoreCase = true) }
    }
}

/**
 * A book on the Shelf. Its id is the SHA-256 of the file's contents, so the same book
 * uploaded twice is recognised. [unreadable] books (corrupt, DRM) are kept, so the owner
 * can see them and delete them. [settings] are the reader's settings for this book alone
 * (a PDF's Pairing and Fit-width, a CBZ's Right to left; see [ReaderSettings]); records
 * saved before CBZ support kept them as `pdfSettings`.
 */
@OptIn(ExperimentalSerializationApi::class)
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
    @JsonNames("pdfSettings") val settings: Map<String, String> = emptyMap(),
)

/** A cover image and its media type. */
class Cover(val bytes: ByteArray, val type: String)

/** A CBZ's own setting: whether its Spreads read right to left, as manga does. */
internal const val RIGHT_TO_LEFT = "right-to-left"

/**
 * The platform's image work: rendering PDF pages, resizing covers for the Shelf and fitting
 * comic pages to the screen.
 */
interface Covers {
    /** The first page of a PDF as an image, or null for none. Throws if the PDF can't be opened. */
    fun pdfFirstPage(file: File): Cover? = null

    /** The cover sized for the Shelf, or null if it isn't a usable image. */
    fun shrink(cover: Cover): Cover? = cover

    /**
     * A CBZ page for the screen: one much larger than the screen is scaled down, others are
     * kept as they are. [fullWidth] is for Fit-width, where the page fills the screen's width,
     * so it's kept at least that wide.
     */
    fun fitPage(page: Cover, fullWidth: Boolean = false): Cover = page
}

internal val json = Json {
    encodeDefaults = true
    ignoreUnknownKeys = true
}

fun Book.toJson(): String = json.encodeToString(this)
fun List<Book>.toJson(): String = json.encodeToString(this)
