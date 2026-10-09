package io.github.sahithchiluveru.readinstead.phone

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals

/** Seam 1: the Now Reading panel's data, from a stubbed Reader session, over real HTTP. */
class NowReadingApiTest {
    private val phone = PhoneHarness()

    @AfterTest
    fun close() = phone.close()

    private fun nowReading(): JsonObject {
        val response = phone.get("/api/now-reading", phone.connect())
        assertEquals(200, response.statusCode())
        assertEquals("no-store", response.headers().firstValue("Cache-Control").orElse(null))
        return Json.parseToJsonElement(response.body()).jsonObject
    }

    private fun addBook(title: String, author: String?): String =
        phone.uploadResults("$title.epub" to FixtureBooks.epub(title = title, author = author))
            .single().getValue("book").jsonObject.getValue("id").let { (it as JsonPrimitive).content }

    @Test
    fun `with nothing open on the TV it says so`() {
        assertEquals(JsonObject(mapOf("open" to JsonPrimitive(false))), nowReading())
    }

    @Test
    fun `shows the Spread on the TV, with the book's title and author`() {
        val id = addBook("Moby-Dick", "Herman Melville")
        phone.spread = Spread(id, chapter = "Chapter 1. Loomings", pageLabel = "Pages 2–3 of 45",
            left = "Call me Ishmael.", right = "Some years ago—never mind how long precisely")
        assertEquals(JsonObject(mapOf(
            "open" to JsonPrimitive(true),
            "bookId" to JsonPrimitive(id),
            "title" to JsonPrimitive("Moby-Dick"),
            "author" to JsonPrimitive("Herman Melville"),
            "chapter" to JsonPrimitive("Chapter 1. Loomings"),
            "pageLabel" to JsonPrimitive("Pages 2–3 of 45"),
            "left" to JsonPrimitive("Call me Ishmael."),
            "right" to JsonPrimitive("Some years ago—never mind how long precisely"),
        )), nowReading())
    }

    @Test
    fun `follows the reader from Spread to Spread`() {
        val id = addBook("Dune", null)
        phone.spread = Spread(id, "", "1%", "A beginning", "")
        assertEquals(JsonPrimitive("A beginning"), nowReading()["left"])
        assertEquals(JsonNull, nowReading()["author"])
        phone.spread = Spread(id, "", "2%", "Further on", "")
        assertEquals(JsonPrimitive("Further on"), nowReading()["left"])
        phone.spread = null
        assertEquals(JsonPrimitive(false), nowReading()["open"])
    }

    @Test
    fun `a book that's no longer on the TV isn't shown`() {
        val id = addBook("Gone", null)
        phone.spread = Spread(id, "", "5%", "text", "")
        phone.library.delete(id)
        assertEquals(JsonPrimitive(false), nowReading()["open"])
    }

    @Test
    fun `needs the Access Key`() {
        val id = addBook("Private", null)
        phone.spread = Spread(id, "", "5%", "secret text", "")
        val response = phone.get("/api/now-reading")
        assertEquals(401, response.statusCode())
        assertEquals(false, "secret text" in response.body())
    }
}
