package io.github.sahithchiluveru.readinstead.library

import org.w3c.dom.Document
import java.io.File
import java.net.URI
import java.util.zip.ZipFile

/** Reads an EPUB's title, author and cover from its package document. */
internal object EpubInfo {
    // Encryption that readers undo themselves, to stop fonts being lifted: not DRM.
    private val fontObfuscation = setOf("http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC")

    fun read(file: File): BookInfo = ZipFile(file).use { zip ->
        if (isEncrypted(zip)) throw UnreadableBook("DRM-protected")
        val opfPath = zip.xml("META-INF/container.xml").elements("rootfile").firstOrNull()
            ?.getAttribute("full-path")?.takeIf { it.isNotEmpty() } ?: throw UnreadableBook("no package document")
        val opf = zip.xml(opfPath)
        if (opf.elements("itemref").isEmpty()) throw UnreadableBook("nothing to read")
        BookInfo(
            title = opf.elements("title").firstNotNullOfOrNull { it.text() },
            author = opf.elements("creator").mapNotNull { it.text() }.joinToString(", ").ifEmpty { null },
            cover = runCatching { cover(zip, opfPath, opf) }.getOrNull(),
        )
    }

    private fun isEncrypted(zip: ZipFile): Boolean {
        if (zip.getEntry("META-INF/encryption.xml") == null) return false
        return zip.xml("META-INF/encryption.xml").elements("EncryptionMethod")
            .any { it.getAttribute("Algorithm") !in fontObfuscation }
    }

    /** The cover image: EPUB 3's cover-image item, else EPUB 2's `<meta name="cover">`, else a likely name. */
    private fun cover(zip: ZipFile, opfPath: String, opf: Document): Cover? {
        val images = opf.elements("item").filter { it.getAttribute("media-type").startsWith("image/") }
        val coverId = opf.elements("meta").firstOrNull { it.getAttribute("name") == "cover" }?.getAttribute("content")
        val item = images.firstOrNull { "cover-image" in it.getAttribute("properties").split(' ') }
            ?: images.firstOrNull { it.getAttribute("id") == coverId }
            ?: images.firstOrNull { "cover" in "${it.getAttribute("id")} ${it.getAttribute("href")}".lowercase() }
            ?: return null
        val entry = zip.getEntry(resolve(opfPath, item.getAttribute("href"))) ?: return null
        val bytes = zip.readImage(entry, MAX_COVER_BYTES) ?: return null
        return Cover(bytes, item.getAttribute("media-type"))
    }

    /** A manifest href, relative to the package document, as a path inside the ZIP. */
    private fun resolve(opfPath: String, href: String): String {
        val decoded = runCatching { URI(href).path }.getOrNull() ?: href
        val segments = opfPath.substringBeforeLast('/', "").split('/').filter { it.isNotEmpty() }.toMutableList()
        for (segment in decoded.split('/')) when (segment) {
            "", "." -> {}
            ".." -> segments.removeLastOrNull()
            else -> segments += segment
        }
        return segments.joinToString("/")
    }

    private fun ZipFile.xml(path: String): Document {
        val entry = getEntry(path) ?: throw UnreadableBook("missing $path")
        return getInputStream(entry).use { parseXml(it) }
    }
}
