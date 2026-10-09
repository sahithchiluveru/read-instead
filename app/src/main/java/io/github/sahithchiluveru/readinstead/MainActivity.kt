package io.github.sahithchiluveru.readinstead

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewFeature
import io.github.sahithchiluveru.readinstead.library.Format
import io.github.sahithchiluveru.readinstead.library.Library
import io.github.sahithchiluveru.readinstead.library.ReaderSettings
import io.github.sahithchiluveru.readinstead.library.toJson

internal const val TAG = "ReadInstead"
private const val READER_URL = "https://appassets.androidplatform.net/assets/reader/src/index.html"

/** Thin shell: one fullscreen WebView running the web reader bundled in assets/reader. */
class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var bridge: ReaderSessionBridge
    private val app get() = application as ReadInsteadApp

    // The phone added or deleted a book: the Shelf (and an open book) follow at once.
    private val onLibraryChange: (Library.Change) -> Unit = { change ->
        val function = when (change) {
            is Library.Change.Added -> "bookAdded"
            is Library.Change.Deleted -> "bookDeleted"
        }
        runOnUiThread { webView.evaluateJavascript("window.readInstead?.$function(${change.book.toJson()})", null) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Served from a real https origin so ES modules, workers and fetch() work. The
        // Library's book files and covers are served beside the reader, by book id.
        val library = app.library
        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/books/") { path -> bookResponse(library, path) }
            .addPathHandler("/covers/") { id ->
                library.cover(id)?.let { WebResourceResponse(it.type, null, it.bytes.inputStream()) }
            }
            .build()

        // The screen stays awake (no screensaver or ambient mode) only while a book is open.
        bridge = ReaderSessionBridge(library) { open ->
            runOnUiThread { keepScreenOn(open) }
        }

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
            }
            webViewClient = object : WebViewClientCompat() {
                override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) =
                    bridge.onReaderReloaded()

                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assets.shouldInterceptRequest(request.url)
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    Log.i(TAG, "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                    return true
                }
            }
            addJavascriptInterface(bridge, "ReadInsteadNative")
            addJavascriptInterface(LibraryBridge(library), "ReadInsteadLibrary")
            addJavascriptInterface(SettingsBridge(ReaderSettings(library)), "ReadInsteadSettings")
            val connectivity = getSystemService(ConnectivityManager::class.java)
            addJavascriptInterface(PhoneLinkBridge(app.accessKey, app.phoneServer, connectivity), "ReadInsteadPhone")
            isFocusable = true
            isFocusableInTouchMode = true
        }
        setContentView(webView)
        library.addListener(onLibraryChange)
        app.readerSession = bridge
        webView.loadUrl(READER_URL)
        webView.requestFocus()

        // Back goes to the reader first (close the book); only exit the app if it didn't handle it.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.readInstead?.back() ?? false") { handled ->
                    Log.i(TAG, "back handled by reader: $handled")
                    if (handled != "true") finish()
                }
            }
        })
    }

    /**
     * A book's file at /books/<id>. A CBZ is never served whole (volumes run to hundreds of
     * MB): instead its page list is at /books/<id>/pages and each page, read from the
     * archive on its own, at /books/<id>/pages/<n> (from 1); /books/<id>/pages/<n>/full-width
     * is the page for Fit-width, kept at least the screen's width.
     */
    private fun bookResponse(library: Library, path: String): WebResourceResponse? {
        val parts = path.split('/')
        val id = parts[0]
        val book = library.book(id) ?: return null
        return when {
            parts.size == 1 && book.format != Format.CBZ ->
                runCatching { WebResourceResponse(book.format.mimeType, null, library.file(id)!!.inputStream()) }.getOrNull()
            parts.size == 2 && parts[1] == "pages" ->
                library.pagesJson(id)?.let { WebResourceResponse("application/json", "utf-8", it.byteInputStream()) }
            parts.size in 3..4 && parts[1] == "pages" && parts.getOrNull(3).let { it == null || it == "full-width" } ->
                parts[2].toIntOrNull()?.let { library.page(id, it, fullWidth = parts.size == 4) }
                    ?.let { WebResourceResponse(it.type, null, it.bytes.inputStream()) }
            else -> null
        }
    }

    private fun keepScreenOn(on: Boolean) {
        val flag = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        if (on) window.addFlags(flag) else window.clearFlags(flag)
    }

    // The Phone Page is served only while the app is in the foreground.
    override fun onStart() {
        super.onStart()
        app.startPhoneServer()
    }

    override fun onStop() {
        app.stopPhoneServer()
        super.onStop()
    }

    override fun onDestroy() {
        app.library.removeListener(onLibraryChange)
        if (app.readerSession === bridge) app.readerSession = null // not a newer Activity's
        webView.destroy()
        super.onDestroy()
    }
}
