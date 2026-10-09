package io.github.sahithchiluveru.readinstead.library

import org.w3c.dom.Document
import org.w3c.dom.Element
import java.io.InputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory

// Reading the insides of book files (EPUB and CBZ are both ZIPs, with XML metadata).

/** Larger covers are ignored, so a bad file can't exhaust memory while the cover is shrunk. */
internal const val MAX_COVER_BYTES = 20 * 1024 * 1024

/** An image entry's bytes, or null if it's larger than [maxBytes]. */
internal fun ZipFile.readImage(entry: ZipEntry, maxBytes: Int): ByteArray? {
    if (entry.size > maxBytes) return null
    // The declared size can be missing or wrong, so the read is capped too.
    val bytes = getInputStream(entry).use { it.readNBytes(maxBytes + 1) }
    return bytes.takeIf { it.size <= maxBytes }
}

/** Parses XML from a book file. */
internal fun parseXml(input: InputStream): Document = parser().parse(input)

// Book files are untrusted: nothing external is fetched, and entity expansion is capped.
private fun parser() = DocumentBuilderFactory.newInstance().apply {
    isNamespaceAware = true
    isExpandEntityReferences = false
    for ((feature, on) in listOf(
        XMLConstants.FEATURE_SECURE_PROCESSING to true,
        "http://apache.org/xml/features/nonvalidating/load-external-dtd" to false,
        "http://xml.org/sax/features/external-general-entities" to false,
        "http://xml.org/sax/features/external-parameter-entities" to false,
    )) runCatching { setFeature(feature, on) } // not every platform's parser knows every feature
}.newDocumentBuilder()

/** Elements by local name, whatever their namespace prefix. */
internal fun Document.elements(localName: String): List<Element> {
    val all = getElementsByTagName("*")
    return (0 until all.length).map { all.item(it) as Element }
        .filter { (it.localName ?: it.tagName.substringAfter(':')) == localName }
}

internal fun Element.text(): String? = textContent.collapseWhitespace()
