package io.github.sahithchiluveru.readinstead.phone

import java.net.http.HttpResponse
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/** Seam 1: the Phone API, exercised over real HTTP on the JVM. */
class PhoneApiTest {
    private val phone = PhoneHarness()
    private val accessKey = phone.accessKey

    @AfterTest
    fun stop() = phone.close()

    private fun get(path: String, cookie: String? = null) = phone.get(path, cookie)
    private fun connect(key: String = accessKey.current) = phone.connect(key)

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
        assertRefused(phone.post("/api/ping?k=${accessKey.current}"))
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
        assertEquals(key, AccessKey(phone.keyStore).current)
        assertTrue(key.length >= 22, "at least 128 bits")
        assertNotEquals(key, AccessKey(MemoryKeyStore()).current)
    }
}
