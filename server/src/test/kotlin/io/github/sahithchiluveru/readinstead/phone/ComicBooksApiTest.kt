package io.github.sahithchiluveru.readinstead.phone

import io.github.sahithchiluveru.readinstead.library.Cover
import io.github.sahithchiluveru.readinstead.library.Covers
import io.github.sahithchiluveru.readinstead.library.ReaderSettings
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Seam 1: uploading CBZ comics and manga to the Shelf, over real HTTP on the JVM. */
class ComicBooksApiTest {
    // Stands in for the TV's image work: covers are shrunk by tagging them.
    private val phone = PhoneHarness(covers = object : Covers {
        override fun shrink(cover: Cover) = Cover("shrunk ".toByteArray() + cover.bytes, "image/jpeg")
    })

    @AfterTest
    fun close() = phone.close()

    private fun JsonObject.text(name: String): String? =
        get(name)?.takeUnless { it is JsonNull }?.jsonPrimitive?.content

    private fun JsonObject.book() = getValue("book") as JsonObject
    private fun JsonObject.unreadable() = getValue("unreadable").jsonPrimitive.boolean

    private fun bookSettings(id: String) = Json.parseToJsonElement(ReaderSettings(phone.library).bookToJson(id))

    @Test
    fun `a CBZ is added, titled by its file name, with its first page shrunk as the cover`() {
        val (result) = phone.uploadResults("One Piece v01.cbz" to FixtureBooks.cbzOf("page10.jpg", "page2.jpg", "page1.jpg"))
        assertEquals("added", result.text("status"))
        val book = result.book()
        assertEquals("cbz", book.text("format"))
        assertEquals("One Piece v01", book.text("title"))
        assertEquals(null, book.text("author"))
        assertEquals(false, book.unreadable())

        val cover = phone.getBytes("/api/books/${book.text("id")}/cover", phone.connect())
        assertEquals(200, cover.statusCode())
        assertContentEquals("shrunk ".toByteArray() + FixtureBooks.pageImage("page1.jpg"), cover.body())
    }

    @Test
    fun `a CBZ takes its title and writer from ComicInfo xml`() {
        val (result) = phone.uploadResults("akira-1.cbz" to
            FixtureBooks.cbzOf("01.png", title = "Akira, Vol. 1", writer = "Katsuhiro Otomo"))
        assertEquals("Akira, Vol. 1", result.book().text("title"))
        assertEquals("Katsuhiro Otomo", result.book().text("author"))
    }

    @Test
    fun `a CBR is refused`() {
        val results = phone.uploadResults("comic.cbr" to "Rar!\u001A\u0007\u0000".toByteArray())
        assertEquals(listOf("unsupported"), results.map { it.text("status") })
        assertEquals(emptyList(), phone.books())
    }

    @Test
    fun `a CBZ without images, or not a ZIP at all, is unreadable`() {
        val results = phone.uploadResults(
            "notes.cbz" to FixtureBooks.cbz(listOf("readme.txt" to "hi".toByteArray(), "pages/" to ByteArray(0))),
            "broken.cbz" to FixtureBooks.garbage,
        )
        assertEquals(listOf("added", "added"), results.map { it.text("status") })
        assertEquals(listOf(true, true), results.map { it.book().unreadable() })
        assertTrue(results.all { it.book().text("coverType") == null })
    }

    @Test
    fun `manga marked right to left in ComicInfo xml starts in right-to-left mode`() {
        val (manga, leftToRight, unknown) = phone.uploadResults(
            "manga.cbz" to FixtureBooks.cbzOf("1.jpg", manga = "YesAndRightToLeft"),
            "western.cbz" to FixtureBooks.cbzOf("1.jpg", "2.jpg", manga = "No"),
            "plain.cbz" to FixtureBooks.cbzOf("1.jpg", "2.jpg", "3.jpg"),
        )
        assertEquals(JsonObject(mapOf("right-to-left" to JsonPrimitive("true"))), bookSettings(manga.book().text("id")!!))
        assertEquals(JsonObject(emptyMap()), bookSettings(leftToRight.book().text("id")!!))
        assertEquals(JsonObject(emptyMap()), bookSettings(unknown.book().text("id")!!))
    }
}
