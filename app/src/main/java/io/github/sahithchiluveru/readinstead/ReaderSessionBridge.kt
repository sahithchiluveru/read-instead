package io.github.sahithchiluveru.readinstead

import android.content.SharedPreferences
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONException
import org.json.JSONObject

/**
 * Native side of the Reader session bridge, exposed to the web reader as `ReadInsteadNative`.
 * The reader reports its state after every turn; the Position is saved per book and handed
 * back when the book is reopened. Called on the WebView's JavaBridge thread.
 */
class ReaderSessionBridge(
    private val positions: SharedPreferences,
    private val onBookOpenChanged: (open: Boolean) -> Unit,
) {
    private var bookOpen = false

    @JavascriptInterface
    fun loadPosition(bookId: String): String? = positions.getString(bookId, null)

    @JavascriptInterface
    fun onReaderState(json: String) {
        val state = try {
            JSONObject(json)
        } catch (e: JSONException) {
            Log.w(TAG, "ignoring malformed reader state", e)
            return
        }
        val open = state.optBoolean("open")
        val bookId = state.optString("bookId")
        val position = state.optString("position")
        if (open && bookId.isNotEmpty() && position.isNotEmpty()) {
            positions.edit().putString(bookId, position).apply()
        }
        setBookOpen(open)
    }

    /** The reader page is (re)loading, so whatever book it had open is gone. */
    fun onReaderReloaded() = setBookOpen(false)

    @Synchronized
    private fun setBookOpen(open: Boolean) {
        if (open == bookOpen) return
        bookOpen = open
        onBookOpenChanged(open)
    }
}
