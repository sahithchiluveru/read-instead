package io.github.sahithchiluveru.readinstead.library

import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipFile

/**
 * Reads a CBZ (a ZIP of page images): its pages, in natural filename order, and its
 * ComicInfo.xml (title, writer, and whether it's manga read right to left). The archive is
 * only ever read one entry at a time, never whole: volumes run to hundreds of MB.
 */
internal object CbzInfo {
    private val imageTypes = mapOf(
        "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "png" to "image/png",
        "gif" to "image/gif", "webp" to "image/webp",
    )
    private const val MAX_PAGE_BYTES = 50 * 1024 * 1024

    /** Title and writer from ComicInfo.xml, and the first page as the cover. Throws if there are no pages. */
    fun read(file: File): BookInfo = ZipFile(file).use { zip ->
        val first = pages(zip).firstOrNull() ?: throw UnreadableBook("no page images")
        val comicInfo = zip.entries().asSequence().firstOrNull { it.name.equals("ComicInfo.xml", ignoreCase = true) }
            ?.let { entry -> runCatching { zip.getInputStream(entry).use(::parseXml) }.getOrNull() }
        fun field(name: String) = comicInfo?.elements(name)?.firstNotNullOfOrNull { it.text() }
        BookInfo(
            title = field("Title"),
            author = field("Writer"),
            cover = zip.readImage(first, MAX_COVER_BYTES)?.let { Cover(it, typeOf(first)) },
            rightToLeft = field("Manga").equals("YesAndRightToLeft", ignoreCase = true),
        )
    }

    /** The page images' names, in reading order. */
    fun pageNames(file: File): List<String> = ZipFile(file).use { zip -> pages(zip).map { it.name } }

    /** Page [number] (from 1), or null if there's no such page or it's absurdly large. */
    fun page(file: File, number: Int): Cover? = ZipFile(file).use { zip ->
        val entry = pages(zip).getOrNull(number - 1) ?: return null
        zip.readImage(entry, MAX_PAGE_BYTES)?.let { Cover(it, typeOf(entry)) }
    }

    /** Image entries in natural order; folders, other files and hidden ones (`.name`, `__MACOSX/`) aren't pages. */
    private fun pages(zip: ZipFile): List<ZipEntry> = zip.entries().asSequence()
        .filter { !it.isDirectory && extension(it.name) in imageTypes }
        .filter { entry -> entry.name.split('/').none { it.startsWith('.') || it == "__MACOSX" } }
        .sortedWith(compareBy(pathOrder) { it.name })
        .toList()

    private fun extension(name: String) = name.substringAfterLast('.', "").lowercase()
    private fun typeOf(entry: ZipEntry) = imageTypes.getValue(extension(entry.name))

    /** Paths folder by folder, each name in [naturalOrder], so `Chapter 2/` comes before `Chapter 2 extra/`. */
    private val pathOrder: Comparator<String> = Comparator { a, b ->
        val foldersA = a.split('/')
        val foldersB = b.split('/')
        for (i in 0 until minOf(foldersA.size, foldersB.size)) {
            val order = naturalOrder.compare(foldersA[i], foldersB[i])
            if (order != 0) return@Comparator order
        }
        foldersA.size - foldersB.size
    }

    /**
     * Natural filename order: runs of digits compare as numbers (page2 before page10), the
     * rest ignoring case; names that still tie (page1, page01) fall back to plain order.
     */
    private val naturalOrder: Comparator<String> = Comparator { a, b ->
        val chunksA = chunks(a)
        val chunksB = chunks(b)
        for (i in 0 until minOf(chunksA.size, chunksB.size)) {
            val x = chunksA[i]
            val y = chunksB[i]
            val order = if (x[0].isDigit() && y[0].isDigit()) compareNumbers(x, y) else x.compareTo(y, ignoreCase = true)
            if (order != 0) return@Comparator order
        }
        (chunksA.size - chunksB.size).takeIf { it != 0 } ?: a.compareTo(b)
    }

    private val chunk = Regex("\\d+|\\D+")
    private fun chunks(name: String) = chunk.findAll(name).map { it.value }.toList()

    private fun compareNumbers(x: String, y: String): Int {
        val a = x.trimStart('0')
        val b = y.trimStart('0')
        return if (a.length != b.length) a.length - b.length else a.compareTo(b)
    }
}
