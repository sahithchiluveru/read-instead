package io.github.sahithchiluveru.readinstead.phone

import io.github.sahithchiluveru.readinstead.library.Covers
import io.github.sahithchiluveru.readinstead.library.Library
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/** Keeps the Access Key in memory, standing in for the TV's metadata store. */
class MemoryKeyStore : AccessKey.Store {
    var saved: String? = null
    override fun load() = saved
    override fun save(key: String) {
        saved = key
    }
}

/**
 * The Phone server over a temporary Library, and an HTTP client playing the phone's
 * browser. The Library's clock ticks once per reading, so every event is ordered.
 */
class PhoneHarness(private val covers: Covers = object : Covers {}) : AutoCloseable {
    val dir: File = Files.createTempDirectory("read-instead-library").toFile()
    val keyStore = MemoryKeyStore()
    val accessKey = AccessKey(keyStore)
    private var tick = 0L
    var library = newLibrary()
        private set
    private var server = PhoneServer(accessKey, library, port = 0)
    private val client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()
    private var base = "http://127.0.0.1:${server.start()}"

    private fun newLibrary() = Library(dir, covers, clock = { ++tick })

    /** Closes the app and opens it again: a fresh Library and server over the same storage. */
    fun restart() {
        server.stop()
        library = newLibrary()
        server = PhoneServer(accessKey, library, port = 0)
        base = "http://127.0.0.1:${server.start()}"
    }

    override fun close() {
        server.stop()
        dir.deleteRecursively()
    }

    fun get(path: String, cookie: String? = null): HttpResponse<String> =
        send(HttpRequest.newBuilder(URI("$base$path")), cookie)

    fun getBytes(path: String, cookie: String? = null): HttpResponse<ByteArray> {
        val request = HttpRequest.newBuilder(URI("$base$path"))
        cookie?.let { request.header("Cookie", it) }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofByteArray())
    }

    fun post(path: String, cookie: String? = null): HttpResponse<String> =
        send(HttpRequest.newBuilder(URI("$base$path")).POST(HttpRequest.BodyPublishers.noBody()), cookie)

    private fun send(request: HttpRequest.Builder, cookie: String?): HttpResponse<String> {
        cookie?.let { request.header("Cookie", it) }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString())
    }

    /** Scans the QR code: visits the key URL and returns the cookie the phone keeps. */
    fun connect(key: String = accessKey.current): String {
        val response = get("/?k=$key")
        assertEquals(302, response.statusCode())
        val setCookie = assertNotNull(response.headers().firstValue("Set-Cookie").orElse(null))
        return setCookie.substringBefore(';')
    }

    /** Uploads files from the Phone Page in one multipart request, as (file name, contents). */
    fun upload(vararg files: Pair<String, ByteArray>, cookie: String? = connect()): HttpResponse<String> {
        val boundary = "read-instead-${System.nanoTime()}"
        val body = ByteArrayOutputStream()
        for ((name, content) in files) {
            body.write(("--$boundary\r\nContent-Disposition: form-data; name=\"books\"; filename=\"$name\"\r\n" +
                "Content-Type: application/octet-stream\r\n\r\n").toByteArray())
            body.write(content)
            body.write("\r\n".toByteArray())
        }
        body.write("--$boundary--\r\n".toByteArray())
        val request = HttpRequest.newBuilder(URI("$base/api/books"))
            .header("Content-Type", "multipart/form-data; boundary=$boundary")
            .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
        return send(request, cookie)
    }

    /** Uploads files and returns each one's result. */
    fun uploadResults(vararg files: Pair<String, ByteArray>): List<JsonObject> {
        val response = upload(*files)
        assertEquals(200, response.statusCode(), response.body())
        return json(response.body()).jsonObject.getValue("results").jsonArray.map { it.jsonObject }
    }

    /** The Library listing, as the Phone Page sees it. */
    fun books(): List<JsonObject> {
        val response = get("/api/books", connect())
        assertEquals(200, response.statusCode())
        return (json(response.body()) as JsonArray).map { it.jsonObject }
    }

    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)
}
