package io.github.sahithchiluveru.readinstead

import android.annotation.SuppressLint
import android.graphics.Bitmap
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

internal const val TAG = "ReadInstead"
private const val READER_URL = "https://appassets.androidplatform.net/assets/reader/src/index.html"

/** Thin shell: one fullscreen WebView running the web reader bundled in assets/reader. */
class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Served from a real https origin so ES modules, workers and fetch() work.
        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // The screen stays awake (no screensaver or ambient mode) only while a book is open.
        val bridge = ReaderSessionBridge(getSharedPreferences("positions", MODE_PRIVATE)) { open ->
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
            isFocusable = true
            isFocusableInTouchMode = true
        }
        setContentView(webView)
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

    private fun keepScreenOn(on: Boolean) {
        val flag = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        if (on) window.addFlags(flag) else window.clearFlags(flag)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
