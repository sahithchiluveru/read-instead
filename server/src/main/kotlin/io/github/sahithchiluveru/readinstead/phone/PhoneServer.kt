package io.github.sahithchiluveru.readinstead.phone

import io.github.sahithchiluveru.readinstead.library.Book
import io.github.sahithchiluveru.readinstead.library.Library
import io.github.sahithchiluveru.readinstead.library.Library.AddResult
import io.github.sahithchiluveru.readinstead.library.json
import io.github.sahithchiluveru.readinstead.library.toJson
import io.ktor.http.ContentType
import io.ktor.http.Cookie
import io.ktor.http.CookieEncoding
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.cio.CIO
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.request.httpMethod
import io.ktor.server.request.receiveMultipart
import io.ktor.server.request.path
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondRedirect
import io.ktor.server.response.respondText
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import io.ktor.utils.io.jvm.javaio.toInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

/**
 * The HTTP server behind the Phone Page. It runs only while the TV app is in the
 * foreground, on a fixed port so the phone's bookmark keeps working.
 */
class PhoneServer(
    private val accessKey: AccessKey,
    private val library: Library,
    private val session: ReaderSession,
    private val port: Int = PORT,
) {
    private var server: EmbeddedServer<*, *>? = null

    val isRunning: Boolean
        @Synchronized get() = server != null

    /** Starts listening on the LAN and returns the bound port. */
    @Synchronized
    fun start(): Int {
        val running = server ?: embeddedServer(CIO, port = port, host = "0.0.0.0") { phoneApi() }
            .start(wait = false)
            .also { server = it }
        return runBlocking { running.engine.resolvedConnectors().first().port }
    }

    @Synchronized
    fun stop() {
        server?.stop(gracePeriodMillis = 200, timeoutMillis = 1_000)
        server = null
    }

    companion object {
        const val PORT = 8765
        const val COOKIE = "access_key"
        private const val TEN_YEARS = 10 * 365 * 24 * 60 * 60
    }

    private fun Application.phoneApi() {
        // Every route requires the Access Key: from the QR code's `k` parameter once (a page
        // visit, so GET only), then from the cookie it leaves behind.
        intercept(ApplicationCallPipeline.Plugins) {
            val key = call.request.queryParameters["k"]
            if (call.request.httpMethod == HttpMethod.Get && accessKey.matches(key)) {
                call.response.cookies.append(Cookie(
                    COOKIE, key!!, encoding = CookieEncoding.RAW, maxAge = TEN_YEARS, path = "/",
                    httpOnly = true, extensions = mapOf("SameSite" to "Lax"),
                ))
                // Drop the key from the address, so a home-screen bookmark doesn't carry it.
                // One leading slash only: "//host" would send the phone to another site.
                call.respondRedirect("/" + call.request.path().trimStart('/'))
                finish()
            } else if (!accessKey.matches(call.request.cookies[COOKIE, CookieEncoding.RAW])) {
                call.respondText(resource("unauthorized.html"), ContentType.Text.Html, HttpStatusCode.Unauthorized)
                finish()
            }
        }
        routing {
            get("/") { call.respondText(resource("index.html"), ContentType.Text.Html) }
            get("/api/ping") { call.respondText("""{"ok":true}""", ContentType.Application.Json) }
            get("/api/now-reading") {
                // Always the TV's current Spread, never a copy cached by the phone.
                call.response.header(HttpHeaders.CacheControl, "no-store")
                val spread = session.currentSpread()
                val book = spread?.let { library.book(it.bookId) }
                val body = if (spread == null || book == null) """{"open":false}"""
                else json.encodeToString(NowReading(
                    bookId = book.id, title = book.title, author = book.author, chapter = spread.chapter,
                    pageLabel = spread.pageLabel, left = spread.left, right = spread.right,
                ))
                call.respondText(body, ContentType.Application.Json)
            }
            get("/api/books") { call.respondText(library.books().toJson(), ContentType.Application.Json) }
            get("/api/books/{id}/cover") {
                val cover = library.cover(call.parameters["id"]!!)
                if (cover == null) call.respondText("No cover", status = HttpStatusCode.NotFound)
                else call.respondBytes(cover.bytes, ContentType.parse(cover.type))
            }
            delete("/api/books/{id}") {
                if (library.delete(call.parameters["id"]!!)) call.respond(HttpStatusCode.NoContent)
                else call.respondText("No such book", status = HttpStatusCode.NotFound)
            }
            post("/api/books") {
                // Files stream straight to disk, one part at a time, however large they are.
                val results = mutableListOf<UploadResult>()
                call.receiveMultipart(formFieldLimit = Long.MAX_VALUE).forEachPart { part ->
                    if (part is PartData.FileItem) {
                        val name = part.originalFileName.orEmpty()
                        val result = withContext(Dispatchers.IO) { library.add(name, part.provider().toInputStream()) }
                        results += UploadResult.of(name, result)
                    }
                    part.dispose()
                }
                call.respondText(json.encodeToString(UploadResults(results)), ContentType.Application.Json)
            }
        }
    }

    /** The Now Reading panel's data: the four copy variants are all built from it on the phone. */
    @Serializable
    private class NowReading(
        val open: Boolean = true,
        val bookId: String,
        val title: String,
        val author: String?,
        val chapter: String,
        val pageLabel: String,
        val left: String,
        val right: String,
    )

    @Serializable
    private class UploadResults(val results: List<UploadResult>)

    /** One uploaded file's outcome, for the Phone Page to show next to it. */
    @Serializable
    private class UploadResult(val name: String, val status: Status, val book: Book? = null) {
        enum class Status { @SerialName("added") ADDED, @SerialName("duplicate") DUPLICATE, @SerialName("unsupported") UNSUPPORTED }

        companion object {
            fun of(name: String, result: AddResult) = when (result) {
                is AddResult.Added -> UploadResult(name, Status.ADDED, result.book)
                is AddResult.Duplicate -> UploadResult(name, Status.DUPLICATE, result.book)
                AddResult.Unsupported -> UploadResult(name, Status.UNSUPPORTED)
            }
        }
    }

    private fun resource(name: String): String =
        checkNotNull(javaClass.getResource("/phone/$name")) { "missing Phone Page resource $name" }.readText()
}
