package io.github.sahithchiluveru.readinstead.library

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.RandomAccessFile
import java.util.zip.Inflater

/**
 * Reads a PDF's title and author from its Info dictionary. Only enough of the format is
 * understood to find that dictionary (a classic xref table or an xref stream); anything
 * unusual just means no metadata, and the book is titled by its file name. Whether the
 * PDF can actually be opened is left to the TV's renderer.
 */
internal object PdfInfo {
    private const val TAIL = 64 * 1024
    private const val MAX_SECTIONS = 16
    private const val MAX_STREAM_BYTES = 16 * 1024 * 1024 // an xref stream is far smaller; anything bigger is hostile

    fun read(file: File): BookInfo = RandomAccessFile(file, "r").use { pdf ->
        if ("%PDF-" !in pdf.text(0, 1024)) throw UnreadableBook("not a PDF")
        val info = runCatching { infoDictionary(pdf) }.getOrNull()
        BookInfo(info?.get("Title")?.let(::decodeText), info?.get("Author")?.let(::decodeText), cover = null)
    }

    /** The Info dictionary's string entries, or null if there's none to be found. */
    private fun infoDictionary(pdf: RandomAccessFile): Map<String, ByteArray>? {
        val tail = pdf.text(maxOf(0, pdf.length() - TAIL), TAIL)
        val startxref = Regex("""startxref\s+(\d+)""").findAll(tail).lastOrNull()
            ?.groupValues?.get(1)?.toLong() ?: return null
        // The latest trailer: the classic `trailer` dictionary, or the xref stream's own.
        val trailer = if (pdf.text(startxref, 4).startsWith("xref")) {
            tail.substringAfterLast("trailer", "").substringBefore("startxref")
        } else {
            pdf.text(startxref, 4096).substringBefore("stream")
        }
        if ("/Encrypt" in trailer) return null // its strings are encrypted too
        val number = Regex("""/Info\s+(\d+)\s+\d+\s+R""").find(trailer)?.groupValues?.get(1)?.toInt() ?: return null
        val offset = objectOffset(pdf, startxref, number) ?: return null
        val obj = pdf.text(offset, 16 * 1024)
        if (!Regex("""^\s*$number\s+\d+\s+obj""").containsMatchIn(obj)) return null
        return stringEntries(obj.toByteArray(Charsets.ISO_8859_1), obj.indexOf("<<"))
    }

    /** Where object [number] starts, following earlier xref sections back through /Prev. */
    private fun objectOffset(pdf: RandomAccessFile, startxref: Long, number: Int): Long? {
        var section: Long? = startxref
        repeat(MAX_SECTIONS) {
            val at = section ?: return null
            val (offset, prev) = if (pdf.text(at, 4).startsWith("xref")) classicSection(pdf, at, number)
            else streamSection(pdf, at, number)
            if (offset != null) return offset
            section = prev
        }
        return null
    }

    /** A classic table: subsections of fixed 20-byte entries, then the section's trailer. */
    private fun classicSection(pdf: RandomAccessFile, at: Long, number: Int): Pair<Long?, Long?> {
        var position = at + 4
        while (true) {
            val header = pdf.text(position, 64)
            val match = Regex("""^\s*(\d+)\s+(\d+)[ \t]*(\r\n|\r|\n)""").find(header)
                ?: return null to prevOf(pdf.text(position, 4096).substringAfter("trailer", "").substringBefore("startxref"))
            val (first, count) = match.groupValues[1].toInt() to match.groupValues[2].toInt()
            val entries = position + match.range.last + 1
            if (number in first until first + count) {
                val entry = pdf.text(entries + (number - first) * 20L, 20)
                return (if (entry[17] == 'n') entry.substring(0, 10).toLong() else null) to null
            }
            position = entries + count * 20L
        }
    }

    /** A compressed xref stream: rows of fields sized by /W, for the object ranges in /Index. */
    private fun streamSection(pdf: RandomAccessFile, at: Long, number: Int): Pair<Long?, Long?> {
        val head = pdf.text(at, 4096)
        val dict = head.substringBefore("stream")
        val widths = numbers(dict, "W") ?: return null to null
        val index = numbers(dict, "Index") ?: listOf(0L, number(dict, "Size") ?: return null to null)
        // A direct length only: "/Length 12 0 R" would point elsewhere.
        val length = Regex("""/Length\s+(\d+)(?!\s+\d+\s+R)""").find(dict)?.groupValues?.get(1)?.toLong()
            ?.takeIf { it <= MAX_STREAM_BYTES } ?: return null to null
        val eol = if (head.substringAfter("stream").startsWith("\r\n")) 2 else 1
        val dataStart = at + head.indexOf("stream") + "stream".length + eol
        var data = ByteArray(length.toInt()).also { pdf.seek(dataStart); pdf.readFully(it) }
        if ("/FlateDecode" in dict) data = inflate(data)
        val predictor = number(dict, "Predictor") ?: 1
        if (predictor >= 10) data = unpredict(data, (number(dict, "Columns") ?: 1).toInt())

        val rowSize = widths.sum().toInt()
        var row = 0
        for ((first, count) in index.chunked(2).map { it[0] to it[1] }) {
            if (number in first until first + count) {
                val start = (row + (number - first).toInt()) * rowSize
                val fields = widths.runningFold(start) { offset, width -> offset + width.toInt() }
                    .zipWithNext { from, to -> bigEndian(data, from, to) }
                val type = if (widths[0] == 0L) 1L else fields[0]
                // Type 2 objects sit inside object streams: further than this needs to go.
                return (if (type == 1L) fields[1] else null) to null
            }
            row += count.toInt()
        }
        return null to prevOf(dict)
    }

    private fun bigEndian(data: ByteArray, from: Int, to: Int) =
        (from until to).fold(0L) { value, i -> (value shl 8) or (data[i].toLong() and 0xFF) }

    /** A dictionary entry's number value, e.g. `/Prev 1234`. */
    private fun number(dict: String, key: String) =
        Regex("""/$key\s+(\d+)""").find(dict)?.groupValues?.get(1)?.toLong()

    private fun prevOf(dict: String) = number(dict, "Prev")

    private fun numbers(dict: String, key: String) = Regex("""/$key\s*\[([\d\s]*)]""").find(dict)
        ?.groupValues?.get(1)?.trim()?.split(Regex("\\s+"))?.filter { it.isNotEmpty() }?.map { it.toLong() }

    private fun inflate(data: ByteArray): ByteArray {
        val inflater = Inflater().apply { setInput(data) }
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        try {
            while (!inflater.finished()) {
                val n = inflater.inflate(buffer)
                if (n == 0 && (inflater.needsInput() || inflater.needsDictionary())) break
                out.write(buffer, 0, n)
                if (out.size() > MAX_STREAM_BYTES) throw UnreadableBook("xref stream too large")
            }
        } finally {
            inflater.end()
        }
        return out.toByteArray()
    }

    /** Undoes PNG predictors: each row is a filter byte, then [columns] bytes. */
    private fun unpredict(data: ByteArray, columns: Int): ByteArray {
        val out = ByteArrayOutputStream()
        var previous = ByteArray(columns)
        for (start in data.indices step columns + 1) {
            if (start + columns >= data.size) break
            val filter = data[start].toInt()
            val row = ByteArray(columns)
            for (i in 0 until columns) {
                val raw = data[start + 1 + i].toInt() and 0xFF
                val left = if (i > 0) row[i - 1].toInt() and 0xFF else 0
                val up = previous[i].toInt() and 0xFF
                val upLeft = if (i > 0) previous[i - 1].toInt() and 0xFF else 0
                row[i] = (raw + when (filter) {
                    1 -> left
                    2 -> up
                    3 -> (left + up) / 2
                    4 -> paeth(left, up, upLeft)
                    else -> 0
                }).toByte()
            }
            out.write(row)
            previous = row
        }
        return out.toByteArray()
    }

    private fun paeth(a: Int, b: Int, c: Int): Int {
        val p = a + b - c
        val (pa, pb, pc) = Triple(Math.abs(p - a), Math.abs(p - b), Math.abs(p - c))
        return if (pa <= pb && pa <= pc) a else if (pb <= pc) b else c
    }

    /**
     * The string-valued entries of the dictionary starting at [start] (its `<<`): names
     * map to the raw bytes of literal `(...)` or hex `<...>` strings. Other values,
     * nested dictionaries and arrays included, are skipped.
     */
    private fun stringEntries(bytes: ByteArray, start: Int): Map<String, ByteArray> {
        val entries = mutableMapOf<String, ByteArray>()
        var i = start + 2
        var key: String? = null
        fun at(offset: Int = 0) = bytes.getOrNull(i + offset)?.toInt()?.toChar() ?: '\u0000'
        while (i < bytes.size) {
            val c = at()
            when {
                c.isWhitespace() -> i++
                c == '>' && at(1) == '>' -> return entries
                c == '/' -> {
                    val end = (i + 1 until bytes.size)
                        .firstOrNull { bytes[it].toInt().toChar() in " \t\r\n/<>[]()%" } ?: bytes.size
                    val name = String(bytes, i + 1, end - i - 1, Charsets.ISO_8859_1)
                    key = if (key == null) name else null // a name after a key is that key's value
                    i = end
                }
                c == '(' -> {
                    val (value, end) = literalString(bytes, i)
                    key?.let { entries[it] = value }
                    key = null
                    i = end
                }
                c == '<' && at(1) != '<' -> {
                    val end = (i until bytes.size).first { bytes[it].toInt().toChar() == '>' }
                    val hex = String(bytes, i + 1, end - i - 1, Charsets.ISO_8859_1).filter { !it.isWhitespace() }
                    val value = hex.padEnd(hex.length + hex.length % 2, '0').chunked(2).map { it.toInt(16).toByte() }
                    key?.let { entries[it] = value.toByteArray() }
                    key = null
                    i = end + 1
                }
                c == '<' || c == '[' -> {
                    i = skipNested(bytes, i)
                    key = null
                }
                else -> { // numbers, references, booleans
                    while (i < bytes.size && !at().isWhitespace() && at() !in "/<>[]()") i++
                    key = null
                }
            }
        }
        return entries
    }

    /** Skips a nested dictionary or array starting at [start], strings inside included. */
    private fun skipNested(bytes: ByteArray, start: Int): Int {
        var depth = 0
        var i = start
        while (i < bytes.size) {
            when (bytes[i].toInt().toChar()) {
                '(' -> { i = literalString(bytes, i).second; continue }
                '<', '[' -> depth++
                '>', ']' -> depth--
            }
            i++
            if (depth == 0) return i
        }
        return i
    }

    /** A literal string's bytes, with escapes undone and balanced parentheses kept, and where it ends. */
    private fun literalString(bytes: ByteArray, start: Int): Pair<ByteArray, Int> {
        val out = ByteArrayOutputStream()
        var depth = 0
        var i = start
        while (i < bytes.size) {
            val c = bytes[i].toInt().toChar()
            i++
            when (c) {
                '(' -> if (depth++ > 0) out.write('('.code)
                ')' -> if (--depth > 0) out.write(')'.code) else return out.toByteArray() to i
                '\\' -> {
                    val next = bytes.getOrNull(i)?.toInt()?.toChar() ?: break
                    i++
                    when (next) {
                        'n' -> out.write('\n'.code)
                        'r' -> out.write('\r'.code)
                        't' -> out.write('\t'.code)
                        'b' -> out.write('\b'.code)
                        'f' -> out.write(0x0C)
                        '\r' -> if (bytes.getOrNull(i)?.toInt() == '\n'.code) i++ // line continuation
                        '\n' -> {}
                        in '0'..'7' -> {
                            var value = next - '0'
                            repeat(2) {
                                val digit = bytes.getOrNull(i)?.toInt()?.toChar()
                                if (digit != null && digit in '0'..'7') {
                                    value = value * 8 + (digit - '0')
                                    i++
                                }
                            }
                            out.write(value and 0xFF)
                        }
                        else -> out.write(next.code)
                    }
                }
                else -> out.write(c.code)
            }
        }
        return out.toByteArray() to i
    }

    /** A PDF text string: UTF-16 or UTF-8 with a byte-order mark, else (near enough) Latin-1. */
    private fun decodeText(bytes: ByteArray): String? {
        val text = when {
            bytes.size >= 2 && bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte() ->
                String(bytes, 2, bytes.size - 2, Charsets.UTF_16BE)
            bytes.size >= 3 && bytes[0] == 0xEF.toByte() && bytes[1] == 0xBB.toByte() && bytes[2] == 0xBF.toByte() ->
                String(bytes, 3, bytes.size - 3, Charsets.UTF_8)
            else -> String(bytes, Charsets.ISO_8859_1)
        }
        return text.replace("\u0000", "").collapseWhitespace()
    }

    private fun RandomAccessFile.text(at: Long, length: Int): String {
        if (at < 0 || at >= length()) return ""
        val bytes = ByteArray(minOf(length.toLong(), length() - at).toInt())
        seek(at)
        readFully(bytes)
        return String(bytes, Charsets.ISO_8859_1)
    }
}
