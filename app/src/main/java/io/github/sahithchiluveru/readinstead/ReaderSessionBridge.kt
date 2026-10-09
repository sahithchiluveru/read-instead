package io.github.sahithchiluveru.readinstead

import android.util.Log
import android.webkit.JavascriptInterface
import io.github.sahithchiluveru.readinstead.library.Library
import io.github.sahithchiluveru.readinstead.phone.ReaderSession
import io.github.sahithchiluveru.readinstead.phone.Spread
import org.json.JSONException
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Native side of the Reader session bridge, exposed to the web reader as `ReadInsteadNative`.
 * The reader reports its state after every turn; the Position and progress are saved in
 * the Library and the Position handed back when the book is reopened, and the Spread's
 * text is kept for the Phone Page's Now Reading. Called on the WebView's JavaBridge thread.
 */
class ReaderSessionBridge(
    private val library: Library,
    private val onBookOpenChanged: (open: Boolean) -> Unit,
) : ReaderSession {
    private var openBookId: String? = null

    @Volatile
    private var spread: Spread? = null

    override fun currentSpread(): Spread? = spread

    // The reader waits on every bridge call, so saves (disk writes) run off its thread, in order.
    private val saves = Executors.newSingleThreadExecutor()

    @JavascriptInterface
    fun loadPosition(bookId: String): String? = library.book(bookId)?.position

    @JavascriptInterface
    fun onReaderState(json: String) {
        val state = try {
            JSONObject(json)
        } catch (e: JSONException) {
            Log.w(TAG, "ignoring malformed reader state", e)
            return
        }
        val bookId = state.optString("bookId").takeIf { state.optBoolean("open") && it.isNotEmpty() }
        setOpenBook(bookId)
        spread = bookId?.let {
            Spread(it, state.optString("chapter"), state.optString("pageLabel"),
                state.optString("left"), state.optString("right"))
        }
        val position = state.optString("position")
        if (bookId != null && position.isNotEmpty()) {
            val progress = state.optDouble("progress", 0.0)
            saves.execute { library.savePosition(bookId, position, progress) }
        }
        // Closing the book: the Shelf reads the Library next, so let the last save land first.
        if (bookId == null) saves.submit {}.get()
    }

    /** The reader page is (re)loading, so whatever book it had open is gone. */
    fun onReaderReloaded() {
        spread = null
        setOpenBook(null)
    }

    @Synchronized
    private fun setOpenBook(bookId: String?) {
        if (bookId == openBookId) return
        val wasOpen = openBookId != null
        openBookId = bookId
        bookId?.let { saves.execute { library.opened(it) } } // puts it first on the Shelf
        if (wasOpen != (bookId != null)) onBookOpenChanged(bookId != null)
    }
}
