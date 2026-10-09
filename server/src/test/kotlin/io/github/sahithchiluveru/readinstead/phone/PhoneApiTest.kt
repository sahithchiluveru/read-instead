package io.github.sahithchiluveru.readinstead.phone

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Seam 1: the Phone API, exercised over real HTTP on the JVM. */
class PhoneApiTest {
    private class MemoryStore : AccessKey.Store {
        var saved: String? = null
        override fun load() = saved
        override fun save(key: String) {
            saved = key
        }
    }

    private val store = MemoryStore()
    private val accessKey = AccessKey(store)
    private val server = PhoneServer(accessKey, port = 0)
    private val client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()
    private lateinit var base: String

    @BeforeTest
    fun start() {
        base = "http://127.0.0.1:${server.start()}"
    }

    @AfterTest
    fun stop() = server.stop()

    private fun get(path: String, cookie: String? = null): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI("$base$path"))
        cookie?.let { request.header("Cookie", it) }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString())
    }

    /** Scans the QR code: visits the key URL and returns the cookie the phone keeps. */
    private fun connect(key: String = accessKey.current): String {
        val response = get("/?k=$key")
        assertEquals(302, response.statusCode())
        val setCookie = assertNotNull(response.headers().firstValue("Set-Cookie").orElse(null))
        return setCookie.substringBefore(';')
    }

    private fun assertRefused(response: HttpResponse<String>) {
        assertEquals(401, response.statusCode())
        assertTrue("Scan the QR code on the TV to connect" in response.body())
    }

    @Test
    fun `the bare address is refused on every route`() {
        for (path in listOf("/", "/api/ping", "/api/books", "/anything")) assertRefused(get(path))
    }

    @Test
    fun `a wrong key is refused`() {
        assertRefused(get("/?k=not-the-key"))
        assertRefused(get("/", cookie = "${PhoneServer.COOKIE}=not-the-key"))
    }

    @Test
    fun `the key URL sets an HttpOnly cookie and drops the key from the address`() {
        val response = get("/?k=${accessKey.current}")
        assertEquals(302, response.statusCode())
        assertEquals("/", response.headers().firstValue("Location").get())
        val setCookie = response.headers().firstValue("Set-Cookie").get()
        assertTrue(setCookie.startsWith("${PhoneServer.COOKIE}=${accessKey.current}"))
        assertTrue("HttpOnly" in setCookie)
        assertTrue("Max-Age=" in setCookie, "the cookie outlives the browser session")
    }

    @Test
    fun `the redirect never leaves the TV`() {
        val response = get("//example.com?k=${accessKey.current}")
        assertEquals("/example.com", response.headers().firstValue("Location").get())
    }

    @Test
    fun `the key only connects on a page visit, not on other requests`() {
        val post = HttpRequest.newBuilder(URI("$base/api/ping?k=${accessKey.current}"))
            .POST(HttpRequest.BodyPublishers.noBody()).build()
        assertRefused(client.send(post, HttpResponse.BodyHandlers.ofString()))
    }

    @Test
    fun `afterwards the cookie alone is enough`() {
        val cookie = connect()
        val page = get("/", cookie)
        assertEquals(200, page.statusCode())
        assertTrue("Read Instead" in page.body())
        assertEquals(200, get("/api/ping", cookie).statusCode())
    }

    @Test
    fun `reset key locks out every connected phone`() {
        val oldKey = accessKey.current
        val oldCookie = connect()
        val newKey = accessKey.reset()
        assertNotEquals(oldKey, newKey)
        assertRefused(get("/", oldCookie))
        assertRefused(get("/?k=$oldKey"))
        assertEquals(200, get("/", connect(newKey)).statusCode())
    }

    @Test
    fun `the key survives restarts and is long and random`() {
        val key = accessKey.current
        assertEquals(key, AccessKey(store).current)
        assertTrue(key.length >= 22, "at least 128 bits")
        assertNotEquals(key, AccessKey(MemoryStore()).current)
    }
}
