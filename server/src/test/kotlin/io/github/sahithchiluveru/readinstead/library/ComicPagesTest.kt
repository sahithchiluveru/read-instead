package io.github.sahithchiluveru.readinstead.library

import io.github.sahithchiluveru.readinstead.phone.FixtureBooks
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonPrimitive
import java.io.ByteArrayInputStream
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** A CBZ's pages, as the TV's reader asks for them: the page list, then one page at a time. */
class ComicPagesTest {
    private val dir = Files.createTempDirectory("read-instead-library").toFile()
    private val fitted = mutableListOf<String>()

    // Stands in for the TV's downscaling: every page served is tagged as fitted, for a
    // Spread or for the full width.
    private val library = Library(dir, object : Covers {
        override fun fitPage(page: Cover, fullWidth: Boolean): Cover {
            fitted += String(page.bytes)
            val tag = if (fullWidth) "full-width " else "fitted "
            return Cover(tag.toByteArray() + page.bytes, page.type)
        }
    })

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private fun add(fileName: String, bytes: ByteArray): String =
        (library.add(fileName, ByteArrayInputStream(bytes)) as Library.AddResult.Added).book.id

    private fun pages(id: String): List<String>? =
        library.pagesJson(id)?.let { json -> (Json.parseToJsonElement(json) as JsonArray).map { it.jsonPrimitive.content } }

    @Test
    fun `pages are in natural filename order, folders included`() {
        val id = add("vol.cbz", FixtureBooks.cbzOf(
            "Chapter 10/page1.jpg", "Chapter 2/page10.jpg", "Chapter 2/Page2.JPG", "Chapter 2/page1.jpeg",
            "cover.png", "Chapter 2 extra/1.jpg", "Chapter 2/page01b.webp", "Chapter 1/p 9.gif",
        ))
        assertEquals(listOf(
            "Chapter 1/p 9.gif", "Chapter 2/page1.jpeg", "Chapter 2/page01b.webp", "Chapter 2/Page2.JPG",
            "Chapter 2/page10.jpg", "Chapter 2 extra/1.jpg", "Chapter 10/page1.jpg", "cover.png",
        ), pages(id))
    }

    @Test
    fun `folders, non-images and hidden files are not pages`() {
        val id = add("vol.cbz", FixtureBooks.cbz(listOf(
            "pages/" to ByteArray(0),
            "pages/001.jpg" to FixtureBooks.pageImage("001.jpg"),
            "pages/notes.txt" to "notes".toByteArray(),
            "pages/thumbs.db" to ByteArray(4),
            "pages/.hidden.jpg" to ByteArray(4),
            "__MACOSX/pages/._001.jpg" to ByteArray(4),
            "pages/vector.svg" to "<svg/>".toByteArray(),
            "pages/002.png" to FixtureBooks.pageImage("002.png"),
        ), title = "Has ComicInfo"))
        assertEquals(listOf("pages/001.jpg", "pages/002.png"), pages(id))
    }

    @Test
    fun `each page is served on its own, by its number from 1, fitted for the screen`() {
        val id = add("vol.cbz", FixtureBooks.cbzOf("b/2.png", "a.jpg", "b/10.png"))
        val first = library.page(id, 1)!!
        assertEquals("image/jpeg", first.type)
        assertContentEquals("fitted ".toByteArray() + FixtureBooks.pageImage("a.jpg"), first.bytes)
        val third = library.page(id, 3)!!
        assertEquals("image/png", third.type)
        assertContentEquals("fitted ".toByteArray() + FixtureBooks.pageImage("b/10.png"), third.bytes)
        assertEquals(listOf("image of a.jpg", "image of b/10.png"), fitted, "only the pages asked for are read")
    }

    @Test
    fun `a page can be fitted to the full screen width, for Fit-width`() {
        val id = add("vol.cbz", FixtureBooks.cbzOf("a.jpg"))
        assertContentEquals("full-width ".toByteArray() + FixtureBooks.pageImage("a.jpg"),
            library.page(id, 1, fullWidth = true)!!.bytes)
    }

    @Test
    fun `there are no pages past either end, nor in other books`() {
        val id = add("vol.cbz", FixtureBooks.cbzOf("1.jpg", "2.jpg"))
        assertNull(library.page(id, 0))
        assertNull(library.page(id, 3))
        assertNull(library.page("no-such-book", 1))
        assertNull(library.pagesJson("no-such-book"))

        val epub = add("book.epub", FixtureBooks.epub())
        assertNull(library.pagesJson(epub))
        assertNull(library.page(epub, 1))
    }

    @Test
    fun `an unreadable CBZ has no pages`() {
        val id = add("broken.cbz", FixtureBooks.garbage)
        assertNull(library.pagesJson(id))
        assertNull(library.page(id, 1))
    }
}
