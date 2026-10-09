package io.github.sahithchiluveru.readinstead.library

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.io.File
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption.ATOMIC_MOVE
import java.nio.file.StandardCopyOption.REPLACE_EXISTING
import java.security.DigestInputStream
import java.security.MessageDigest
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The books on the TV: their files, covers and records (metadata, Position, progress, PDF settings),
 * plus the app's global settings, all kept under [dir]. Safe to use from any thread.
 */
class Library(
    private val dir: File,
    private val covers: Covers,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    sealed interface AddResult {
        data class Added(val book: Book) : AddResult
        /** The same contents are already on the Shelf; the existing book is untouched. */
        data class Duplicate(val book: Book) : AddResult
        /** Not an EPUB or PDF, so nothing was kept. */
        data object Unsupported : AddResult
    }

    /** What the TV hears when the phone changes the Library. */
    sealed interface Change {
        val book: Book
        data class Added(override val book: Book) : Change
        data class Deleted(override val book: Book) : Change
    }

    @Serializable
    private class Store(val books: List<Book> = emptyList(), val settings: Map<String, String> = emptyMap())

    private val booksDir = dir.resolve("books")
    private val coversDir = dir.resolve("covers")
    private val uploadsDir = dir.resolve("uploads")
    private val storeFile = dir.resolve("library.json")
    private val books = LinkedHashMap<String, Book>()
    private val settings = HashMap<String, String>()
    private val listeners = CopyOnWriteArrayList<(Change) -> Unit>()

    init {
        listOf(booksDir, coversDir, uploadsDir).forEach { it.mkdirs() }
        uploadsDir.listFiles()?.forEach { it.delete() } // left over from an interrupted upload
        if (storeFile.exists()) {
            val store = runCatching { json.decodeFromString<Store>(storeFile.readText()) }.getOrElse {
                // Keep the damaged file for recovery by hand rather than crash on every launch.
                storeFile.renameTo(dir.resolve("library.json.damaged"))
                Store()
            }
            store.books.associateByTo(books) { it.id }
            settings.putAll(store.settings)
        }
    }

    /** Every book, the most recently read first; a new upload counts as just read. */
    @Synchronized
    fun books(): List<Book> = books.values.sortedByDescending { it.lastOpenedAt ?: it.addedAt }

    @Synchronized
    fun book(id: String): Book? = books[id]

    /** The book's file, or null if there's no such book. */
    fun file(id: String): File? = book(id)?.let(::fileOf)

    fun cover(id: String): Cover? {
        val type = book(id)?.coverType ?: return null
        return runCatching { Cover(coversDir.resolve(id).readBytes(), type) }.getOrNull()
    }

    /** Hears about every book added or deleted, on the thread that changed it. */
    fun addListener(listener: (Change) -> Unit) = listeners.add(listener)
    fun removeListener(listener: (Change) -> Unit) = listeners.remove(listener)

    /**
     * Adds a book from [content], named [fileName] on the phone. The contents are streamed
     * to disk (no size limit) while hashed. A book that can't be opened is still added,
     * marked unreadable.
     */
    fun add(fileName: String, content: InputStream): AddResult {
        val format = Format.of(fileName) ?: return AddResult.Unsupported
        val upload = File.createTempFile("upload", ".part", uploadsDir)
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            upload.outputStream().use { DigestInputStream(content, digest).copyTo(it) }
            val id = digest.digest().joinToString("") { "%02x".format(it) }
            book(id)?.let { return AddResult.Duplicate(it) }

            val info = inspect(upload, format)
            val cover = info?.cover?.takeIf { it.type in RASTER_TYPES }
                ?.let { runCatching { covers.shrink(it) }.getOrNull() }
            val book = synchronized(this) {
                books[id]?.let { return AddResult.Duplicate(it) } // the same book arrived twice at once
                Files.move(upload.toPath(), fileOf(id, format).toPath(), REPLACE_EXISTING)
                cover?.let { coversDir.resolve(id).writeBytes(it.bytes) }
                Book(
                    id = id, format = format,
                    title = info?.title ?: fileName.substring(0, fileName.length - format.extension.length - 1),
                    author = info?.author, addedAt = clock(), unreadable = info == null, coverType = cover?.type,
                ).also {
                    books[id] = it
                    save()
                }
            }
            listeners.forEach { it(Change.Added(book)) }
            return AddResult.Added(book)
        } finally {
            upload.delete()
        }
    }

    /** Deletes a book: its file, cover and record, Position included. False if there's no such book. */
    fun delete(id: String): Boolean {
        val book = synchronized(this) {
            val book = books.remove(id) ?: return false
            save()
            fileOf(book).delete()
            coversDir.resolve(id).delete()
            book
        }
        listeners.forEach { it(Change.Deleted(book)) }
        return true
    }

    /** The book was opened on the TV, which puts it first on the Shelf. */
    fun opened(id: String) = update(id) { it.copy(lastOpenedAt = clock()) }

    /** Saves where the reader is in a book, and how far through it that is (0–1). */
    fun savePosition(id: String, position: String, progress: Double) =
        update(id) { it.copy(position = position, progress = progress) }

    /** Saves one of a book's own settings; false if there's no such book. */
    @Synchronized
    fun saveBookSetting(id: String, name: String, value: String): Boolean {
        if (id !in books) return false
        update(id) { it.copy(pdfSettings = it.pdfSettings + (name to value)) }
        return true
    }

    @Synchronized
    fun setting(name: String): String? = settings[name]

    @Synchronized
    fun saveSetting(name: String, value: String) {
        settings[name] = value
        save()
    }

    @Synchronized
    private fun update(id: String, change: (Book) -> Book) {
        books[id] = change(books[id] ?: return)
        save()
    }

    /** Title, author and cover, or null if the book can't be opened. */
    private fun inspect(file: File, format: Format): BookInfo? = runCatching {
        when (format) {
            Format.EPUB -> EpubInfo.read(file)
            Format.PDF -> PdfInfo.read(file).copy(cover = covers.pdfFirstPage(file))
        }
    }.getOrNull()

    private companion object {
        // Covers are served to the phone and the reader, so only plain images: an SVG can carry script.
        val RASTER_TYPES = setOf("image/jpeg", "image/png", "image/gif", "image/webp")
    }

    private fun fileOf(book: Book) = fileOf(book.id, book.format)
    private fun fileOf(id: String, format: Format) = booksDir.resolve("$id.${format.extension}")

    /** Written whole and swapped in, so a crash mid-write never loses the store. */
    private fun save() {
        val temp = dir.resolve("library.json.tmp")
        temp.writeText(json.encodeToString(Store(books.values.toList(), settings.toMap())))
        Files.move(temp.toPath(), storeFile.toPath(), ATOMIC_MOVE, REPLACE_EXISTING)
    }
}

/** What a book's own metadata says about it; null fields fall back to defaults. */
internal data class BookInfo(val title: String?, val author: String?, val cover: Cover?)

/** The book is corrupt, DRM-protected or otherwise can't be read. */
internal class UnreadableBook(message: String) : Exception(message)

/** Metadata text tidied for display: runs of whitespace collapsed, and null if nothing's left. */
internal fun String.collapseWhitespace(): String? = trim().replace(Regex("\\s+"), " ").ifEmpty { null }
