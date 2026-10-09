package io.github.sahithchiluveru.readinstead.phone

import io.github.sahithchiluveru.readinstead.library.Library
import io.github.sahithchiluveru.readinstead.library.Cover
import io.github.sahithchiluveru.readinstead.library.Covers
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.io.IOException
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Seam 1: uploading books to the Shelf and listing them, over real HTTP on the JVM. */
class BooksApiTest {
    // Stands in for the TV's PDF renderer: the first page of any PDF is a 1×1 PNG.
    private val firstPage = Cover(FixtureBooks.png, "image/png")
    private val phone = PhoneHarness(covers = object : Covers {
        override fun pdfFirstPage(file: File) = firstPage
    })

    @AfterTest
    fun close() = phone.close()

    private fun JsonObject.text(name: String): String? =
        get(name)?.takeUnless { it is JsonNull }?.jsonPrimitive?.content

    private fun JsonObject.status() = text("status")
    private fun JsonObject.book() = getValue("book") as JsonObject
    private fun JsonObject.unreadable() = getValue("unreadable").jsonPrimitive.boolean

    @Test
    fun `an EPUB is added with the title, author and cover from its metadata`() {
        val (result) = phone.uploadResults("moby-dick.epub" to FixtureBooks.epub())
        assertEquals("added", result.status())
        assertEquals("moby-dick.epub", result.text("name"))
        val book = result.book()
        assertEquals("Moby-Dick", book.text("title"))
        assertEquals("Herman Melville", book.text("author"))
        assertEquals("epub", book.text("format"))
        assertEquals(false, book.unreadable())

        val cover = phone.getBytes("/api/books/${book.text("id")}/cover", phone.connect())
        assertEquals(200, cover.statusCode())
        assertEquals("image/png", cover.headers().firstValue("Content-Type").get())
        assertContentEquals(FixtureBooks.png, cover.body())
    }

    @Test
    fun `an EPUB 2 cover is found too`() {
        val (result) = phone.uploadResults("old.epub" to FixtureBooks.epub(title = "Old Style", epub2Cover = true))
        val cover = phone.getBytes("/api/books/${result.book().text("id")}/cover", phone.connect())
        assertContentEquals(FixtureBooks.png, cover.body())
    }

    @Test
    fun `a book without metadata is titled by its file name`() {
        val (result) = phone.uploadResults("The_Untitled Book.epub" to
            FixtureBooks.epub(title = null, author = null, cover = null))
        val book = result.book()
        assertEquals("The_Untitled Book", book.text("title"))
        assertEquals(null, book.text("author"))
        assertEquals(404, phone.get("/api/books/${book.text("id")}/cover", phone.connect()).statusCode())
    }

    @Test
    fun `several files upload in one request, each with its own result`() {
        val results = phone.uploadResults(
            "a.epub" to FixtureBooks.epub(title = "A"),
            "notes.txt" to "hello".toByteArray(),
            "b.pdf" to FixtureBooks.pdf(),
            "a again.epub" to FixtureBooks.epub(title = "A"),
        )
        assertEquals(listOf("a.epub", "notes.txt", "b.pdf", "a again.epub"), results.map { it.text("name") })
        assertEquals(listOf("added", "unsupported", "added", "duplicate"), results.map { it.status() })
        assertEquals(setOf("A", "b"), phone.books().map { it.text("title") }.toSet())
    }

    @Test
    fun `the same book again is a duplicate and keeps its Position`() {
        val (first) = phone.uploadResults("dune.epub" to FixtureBooks.epub(title = "Dune"))
        val id = first.book().text("id")!!
        phone.library.opened(id)
        phone.library.savePosition(id, "epubcfi(/6/4!/4/2)", 0.42)

        val (again) = phone.uploadResults("Dune (1).epub" to FixtureBooks.epub(title = "Dune"))
        assertEquals("duplicate", again.status())
        assertEquals(id, again.book().text("id"))

        val (listed) = phone.books()
        assertEquals("epubcfi(/6/4!/4/2)", listed.text("position"))
        assertEquals(0.42, listed.getValue("progress").jsonPrimitive.double)
        assertEquals("Dune", listed.text("title"))
        assertEquals(1, phone.dir.resolve("books").listFiles()!!.size, "the second copy isn't kept")
    }

    @Test
    fun `files other than EPUB and PDF are refused and not kept`() {
        val results = phone.uploadResults("film.mp4" to ByteArray(1000), "book.mobi" to FixtureBooks.garbage,
            "no extension" to FixtureBooks.epub())
        assertEquals(listOf("unsupported", "unsupported", "unsupported"), results.map { it.status() })
        assertTrue(results.all { (it["book"] ?: JsonNull) is JsonNull })
        assertEquals(emptyList(), phone.books())
        assertEquals(emptyList(), phone.dir.resolve("books").listFiles()?.toList().orEmpty())
    }

    @Test
    fun `a corrupt EPUB is added but marked unreadable`() {
        val (result) = phone.uploadResults("broken.EPUB" to FixtureBooks.garbage)
        assertEquals("added", result.status())
        assertEquals("broken", result.book().text("title"))
        assertEquals(true, result.book().unreadable())
        assertEquals(true, phone.books().single().unreadable())
    }

    @Test
    fun `a DRM-protected EPUB is unreadable, but font obfuscation is fine`() {
        val results = phone.uploadResults("locked.epub" to FixtureBooks.drmEpub(),
            "fonts.epub" to FixtureBooks.obfuscatedFontEpub())
        assertEquals(listOf(true, false), results.map { it.book().unreadable() })
    }

    @Test
    fun `a PDF takes its title and author from its metadata, and its first page as the cover`() {
        val info = """/Title (Moby-Dick \(or, The Whale\)) /Author <FEFF004D0065006C00760069006C006C0065>"""
        for (xrefStream in listOf(false, true)) {
            val (result) = phone.uploadResults("scan-$xrefStream.pdf" to FixtureBooks.pdf(info, xrefStream))
            val book = result.book()
            assertEquals("Moby-Dick (or, The Whale)", book.text("title"), "xref stream: $xrefStream")
            assertEquals("Melville", book.text("author"), "xref stream: $xrefStream")
            assertEquals("pdf", book.text("format"))
            assertEquals(false, book.unreadable())
            val cover = phone.getBytes("/api/books/${book.text("id")}/cover", phone.connect())
            assertContentEquals(FixtureBooks.png, cover.body())
        }
    }

    @Test
    fun `a PDF without metadata is titled by its file name`() {
        val (result) = phone.uploadResults("Annual Report 2025.pdf" to FixtureBooks.pdf(info = "/Title ()"))
        assertEquals("Annual Report 2025", result.book().text("title"))
        assertEquals(null, result.book().text("author"))
    }

    @Test
    fun `a file that isn't really a PDF, or that the TV can't open, is unreadable`() {
        val (fake) = phone.uploadResults("fake.pdf" to FixtureBooks.garbage)
        assertEquals(true, fake.book().unreadable())

        PhoneHarness(covers = object : Covers {
            override fun pdfFirstPage(file: File) = throw IOException("password required")
        }).use { tv ->
            val (locked) = tv.uploadResults("locked.pdf" to FixtureBooks.pdf("/Title (Secret)"))
            assertEquals("added", locked.status())
            assertEquals(true, locked.book().unreadable())
        }
    }

    @Test
    fun `the listing shows the most recently read first, then the newest uploads`() {
        val ids = listOf("First", "Second", "Third").associateWith { title ->
            phone.uploadResults("$title.epub" to FixtureBooks.epub(title = title)).single().book().text("id")!!
        }
        assertEquals(listOf("Third", "Second", "First"), phone.books().map { it.text("title") })
        phone.library.opened(ids.getValue("First"))
        assertEquals(listOf("First", "Third", "Second"), phone.books().map { it.text("title") })
        phone.uploadResults("Fourth.epub" to FixtureBooks.epub(title = "Fourth"))
        assertEquals(listOf("Fourth", "First", "Third", "Second"), phone.books().map { it.text("title") })
    }

    @Test
    fun `books, Positions and covers survive a restart`() {
        val (result) = phone.uploadResults("moby-dick.epub" to FixtureBooks.epub())
        val id = result.book().text("id")!!
        phone.library.savePosition(id, "epubcfi(/6/8)", 0.1)
        phone.restart()
        val (book) = phone.books()
        assertEquals("Moby-Dick", book.text("title"))
        assertEquals("epubcfi(/6/8)", book.text("position"))
        assertEquals(200, phone.get("/api/books/$id/cover", phone.connect()).statusCode())
        assertEquals("duplicate", phone.uploadResults("again.epub" to FixtureBooks.epub()).single().status())
    }

    @Test
    fun `the TV hears about every book added and deleted`() {
        val changes = mutableListOf<String>()
        phone.library.addListener { change ->
            changes += when (change) {
                is Library.Change.Added -> "added ${change.book.title}"
                is Library.Change.Deleted -> "deleted ${change.book.title}"
            }
        }
        val (a) = phone.uploadResults("a.epub" to FixtureBooks.epub(title = "A"), "a2.epub" to FixtureBooks.epub(title = "A"),
            "b.txt" to FixtureBooks.garbage)
        phone.delete(a.book().text("id")!!)
        assertEquals(listOf("added A", "deleted A"), changes)
    }

    @Test
    fun `deleting a book removes its file, cover, record and Position`() {
        val (kept, gone) = phone.uploadResults("kept.epub" to FixtureBooks.epub(title = "Kept"),
            "gone.epub" to FixtureBooks.epub(title = "Gone"))
        val id = gone.book().text("id")!!
        phone.library.savePosition(id, "epubcfi(/6/4)", 0.5)

        assertEquals(204, phone.delete(id).statusCode())
        assertEquals(listOf("Kept"), phone.books().map { it.text("title") })
        assertEquals(404, phone.get("/api/books/$id/cover", phone.connect()).statusCode())
        assertEquals(listOf(kept.book().text("id")), phone.dir.resolve("books").list()!!.map { it.substringBefore('.') })
        assertEquals(1, phone.dir.resolve("covers").list()!!.size)

        // Gone for good: after a restart too, and uploading it again starts afresh.
        phone.restart()
        assertEquals(listOf("Kept"), phone.books().map { it.text("title") })
        val (again) = phone.uploadResults("gone.epub" to FixtureBooks.epub(title = "Gone"))
        assertEquals("added", again.status())
        assertEquals(null, again.book().text("position"))
        assertEquals(0.0, again.book().getValue("progress").jsonPrimitive.double)
    }

    @Test
    fun `deleting an unknown book is not found`() {
        assertEquals(404, phone.delete("0123abcd").statusCode())
    }

    @Test
    fun `deleting needs the Access Key`() {
        val (result) = phone.uploadResults("a.epub" to FixtureBooks.epub())
        assertEquals(401, phone.delete(result.book().text("id")!!, cookie = null).statusCode())
        assertEquals(1, phone.books().size)
    }

    @Test
    fun `uploading and covers need the Access Key`() {
        val upload = phone.upload("a.epub" to FixtureBooks.epub(), cookie = null)
        assertEquals(401, upload.statusCode())
        assertEquals(emptyList(), phone.library.books())
        assertEquals(401, phone.get("/api/books/anything/cover").statusCode())
    }

    @Test
    fun `an unknown book has no cover`() {
        assertEquals(404, phone.get("/api/books/0123abcd/cover", phone.connect()).statusCode())
        assertEquals(404, phone.get("/api/books/..%2Flibrary.json/cover", phone.connect()).statusCode())
    }
}
