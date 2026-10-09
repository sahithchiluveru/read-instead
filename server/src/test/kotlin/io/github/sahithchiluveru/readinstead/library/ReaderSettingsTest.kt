package io.github.sahithchiluveru.readinstead.library

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The reader's global settings (font, size, theme, layout), kept in the Library's store. */
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
}
