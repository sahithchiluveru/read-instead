package io.github.sahithchiluveru.readinstead.phone

import io.ktor.http.ContentType
import io.ktor.http.Cookie
import io.ktor.http.CookieEncoding
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.cio.CIO
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path
import io.ktor.server.response.respondRedirect
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.coroutines.runBlocking

/**
 * The HTTP server behind the Phone Page. It runs only while the TV app is in the
 * foreground, on a fixed port so the phone's bookmark keeps working.
 */
class PhoneServer(private val accessKey: AccessKey, private val port: Int = PORT) {
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
        }
    }

    private fun resource(name: String): String =
        checkNotNull(javaClass.getResource("/phone/$name")) { "missing Phone Page resource $name" }.readText()
}
