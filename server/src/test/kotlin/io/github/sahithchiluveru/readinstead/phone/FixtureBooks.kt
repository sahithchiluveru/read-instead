package io.github.sahithchiluveru.readinstead.phone

import java.io.ByteArrayOutputStream
import java.util.Base64
import java.util.zip.CRC32
import java.util.zip.Deflater
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Fixture books for the Phone API tests, built in memory so their contents are readable here. */
object FixtureBooks {
    /** A 1×1 PNG, standing in for a cover image. */
    val png: ByteArray = Base64.getDecoder().decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")

    /** Bytes that are neither a ZIP nor a PDF: a "corrupt" book. */
    val garbage = "this is not a book at all".toByteArray()

    private const val CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""

    private fun chapter(text: String) = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>$text</title></head><body><p>$text</p></body></html>"""

    /**
     * An EPUB with the given metadata. The cover is declared the EPUB 3 way (a manifest
     * item with the cover-image property) or, with [epub2Cover], the EPUB 2 way (a
     * `<meta name="cover">` pointing at the item). [encryption] becomes META-INF/encryption.xml.
     */
    fun epub(
        title: String? = "Moby-Dick",
        author: String? = "Herman Melville",
        cover: ByteArray? = png,
        epub2Cover: Boolean = false,
        encryption: String? = null,
        id: String = "urn:uuid:${title ?: "untitled"}",
    ): ByteArray {
        val coverItem = when {
            cover == null -> ""
            epub2Cover -> """<item id="cover-img" href="images/cover%20art.png" media-type="image/png"/>"""
            else -> """<item id="cover-img" href="images/cover%20art.png" media-type="image/png" properties="cover-image"/>"""
        }
        val opf = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">$id</dc:identifier>
    ${title?.let { "<dc:title>$it</dc:title>" } ?: ""}
    ${author?.let { "<dc:creator>$it</dc:creator>" } ?: ""}
    ${if (cover != null && epub2Cover) """<meta name="cover" content="cover-img"/>""" else ""}
  </metadata>
  <manifest>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    $coverItem
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>"""
        return zip(buildMap {
            put("META-INF/container.xml", CONTAINER.toByteArray())
            encryption?.let { put("META-INF/encryption.xml", it.toByteArray()) }
            put("OEBPS/content.opf", opf.toByteArray())
            put("OEBPS/text/ch1.xhtml", chapter("Call me Ishmael.").toByteArray())
            cover?.let { put("OEBPS/images/cover art.png", it) }
        })
    }

    private fun encryptionXml(algorithm: String, uri: String) = """<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
    xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="$algorithm"/>
    <enc:CipherData><enc:CipherReference URI="$uri"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>"""

    /** An EPUB whose chapter is encrypted, as DRM-protected books are. */
    fun drmEpub() = epub(title = "Locked", encryption =
        encryptionXml("http://www.w3.org/2001/04/xmlenc#aes128-cbc", "OEBPS/text/ch1.xhtml"))

    /** An EPUB that only obfuscates a font, which readers undo themselves: not DRM. */
    fun obfuscatedFontEpub() = epub(title = "Fancy Fonts", encryption =
        encryptionXml("http://www.idpf.org/2008/embedding", "OEBPS/fonts/font.otf"))

    /** The mimetype entry first and stored, as the EPUB container format asks. */
    private fun zip(entries: Map<String, ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            val mimetype = "application/epub+zip".toByteArray()
            zip.putNextEntry(ZipEntry("mimetype").apply {
                method = ZipEntry.STORED
                size = mimetype.size.toLong()
                crc = CRC32().apply { update(mimetype) }.value
            })
            zip.write(mimetype)
            for ((path, content) in entries) {
                zip.putNextEntry(ZipEntry(path))
                zip.write(content)
            }
        }
        return out.toByteArray()
    }

    /**
     * A one-page PDF. [info] is the raw Info dictionary body (e.g. `/Title (Dune)`), or
     * null for none. With [xrefStream], the cross-reference table is a compressed stream
     * with a PNG predictor, as PDF 1.5+ writers produce.
     */
    fun pdf(info: String? = null, xrefStream: Boolean = false): ByteArray {
        val objects = mutableListOf(
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 432 648] >>",
        )
        info?.let { objects += "<< $it >>" }
        val infoRef = if (info != null) "/Info ${objects.size} 0 R" else ""

        val out = ByteArrayOutputStream()
        fun write(text: String) = out.write(text.toByteArray(Charsets.ISO_8859_1))
        write("%PDF-1.7\n%âãÏÓ\n")
        val offsets = objects.mapIndexed { i, body ->
            out.size().also { write("${i + 1} 0 obj\n$body\nendobj\n") }
        }
        val xrefOffset = out.size()
        if (!xrefStream) {
            write("xref\n0 ${objects.size + 1}\n0000000000 65535 f \n")
            for (offset in offsets) write("%010d 00000 n \n".format(offset))
            write("trailer\n<< /Size ${objects.size + 1} /Root 1 0 R $infoRef >>\n")
        } else {
            // Rows of [type(1) offset(4) generation(2)], each prefixed by PNG filter 2 (Up).
            val xrefNumber = objects.size + 1
            val rows = listOf(byteArrayOf(0, 0, 0, 0, 0, -1, -1)) +
                (offsets + xrefOffset).map { offset ->
                    byteArrayOf(1, (offset ushr 24).toByte(), (offset ushr 16).toByte(),
                        (offset ushr 8).toByte(), offset.toByte(), 0, 0)
                }
            val filtered = ByteArrayOutputStream()
            var previous = ByteArray(7)
            for (row in rows) {
                filtered.write(2)
                filtered.write(ByteArray(7) { (row[it] - previous[it]).toByte() })
                previous = row
            }
            val compressed = deflate(filtered.toByteArray())
            write("$xrefNumber 0 obj\n<< /Type /XRef /Size ${xrefNumber + 1} /W [1 4 2] /Root 1 0 R $infoRef " +
                "/Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >> /Length ${compressed.size} >>\nstream\n")
            out.write(compressed)
            write("\nendstream\nendobj\n")
        }
        write("startxref\n$xrefOffset\n%%EOF\n")
        return out.toByteArray()
    }

    private fun deflate(data: ByteArray): ByteArray {
        val deflater = Deflater().apply { setInput(data); finish() }
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        while (!deflater.finished()) out.write(buffer, 0, deflater.deflate(buffer))
        return out.toByteArray()
    }
}
