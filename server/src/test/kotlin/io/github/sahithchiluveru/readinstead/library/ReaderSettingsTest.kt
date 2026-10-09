package io.github.sahithchiluveru.readinstead.library

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.ByteArrayInputStream
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The reader's settings, kept in the Library's store: global ones (font, size, theme,
 * layout, reading speed) and a PDF's own (Pairing, Fit-width).
 */
class ReaderSettingsTest {
    private val dir = Files.createTempDirectory("read-instead-library").toFile()
    private fun library() = Library(dir, object : Covers {})

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private fun ReaderSettings.saved() = Json.parseToJsonElement(toJson()) as JsonObject

    @Test
    fun `nothing is saved at first`() {
        assertEquals(JsonObject(emptyMap()), ReaderSettings(library()).saved())
    }

    @Test
    fun `saved settings survive a restart`() {
        val settings = ReaderSettings(library())
        assertTrue(settings.save("theme", "dark"))
        assertTrue(settings.save("size", "25"))
        assertTrue(settings.save("theme", "light"))

        val restarted = ReaderSettings(library())
        assertEquals(
            JsonObject(mapOf("theme" to JsonPrimitive("light"), "size" to JsonPrimitive("25"))),
            restarted.saved(),
        )
    }

    @Test
    fun `the reading speed is kept for every book and survives a restart`() {
        val speed = """{"secondsPerCharacter":0.05,"samples":12}"""
        assertTrue(ReaderSettings(library()).save("reading-speed", speed))

        val restarted = ReaderSettings(library())
        assertEquals(JsonObject(mapOf("reading-speed" to JsonPrimitive(speed))), restarted.saved())
    }

    @Test
    fun `only the reader's own settings are read or written, never the Access Key`() {
        val library = library()
        library.saveSetting("accessKey", "secret")
        val settings = ReaderSettings(library)
        assertFalse(settings.save("accessKey", "chosen-by-a-page"))
        assertFalse(settings.save("anything", "else"))
        assertEquals("secret", library.setting("accessKey"))
        assertNull(settings.saved()["accessKey"])
        assertEquals(JsonObject(emptyMap()), settings.saved())
    }

    private fun Library.addBook(): String {
        val added = add("paper.pdf", ByteArrayInputStream("not really a pdf".toByteArray()))
        return (added as Library.AddResult.Added).book.id
    }

    private fun ReaderSettings.savedFor(bookId: String) = Json.parseToJsonElement(pdfToJson(bookId)) as JsonObject

    @Test
    fun `a PDF's own settings are saved with it and survive a restart`() {
        val library = library()
        val id = library.addBook()
        val other = library.add("other.pdf", ByteArrayInputStream("another".toByteArray()))
            .let { (it as Library.AddResult.Added).book.id }
        val settings = ReaderSettings(library)
        assertEquals(JsonObject(emptyMap()), settings.savedFor(id))
        assertTrue(settings.savePdf(id, "pairing", "paper"))
        assertTrue(settings.savePdf(id, "fit-width", "true"))
        assertTrue(settings.savePdf(id, "pairing", "book"))

        val restarted = ReaderSettings(library())
        assertEquals(
            JsonObject(mapOf("pairing" to JsonPrimitive("book"), "fit-width" to JsonPrimitive("true"))),
            restarted.savedFor(id),
        )
        assertEquals(JsonObject(emptyMap()), restarted.savedFor(other), "another book keeps its own")
        assertEquals(JsonObject(emptyMap()), restarted.saved(), "the global settings are untouched")
    }

    @Test
    fun `only a PDF's Pairing and Fit-width can be saved, and only for a book on the Shelf`() {
        val library = library()
        val id = library.addBook()
        val settings = ReaderSettings(library)
        assertFalse(settings.savePdf(id, "position", "12"))
        assertFalse(settings.savePdf(id, "theme", "dark"))
        assertFalse(settings.savePdf("no-such-book", "pairing", "paper"))
        assertEquals(JsonObject(emptyMap()), settings.savedFor(id))
        assertEquals(JsonObject(emptyMap()), settings.savedFor("no-such-book"))
        assertNull(library.book(id)?.position)
    }

    @Test
    fun `deleting a book deletes its settings`() {
        val library = library()
        val id = library.addBook()
        ReaderSettings(library).savePdf(id, "fit-width", "true")
        library.delete(id)
        assertEquals(JsonObject(emptyMap()), ReaderSettings(library).savedFor(id))
    }
}
