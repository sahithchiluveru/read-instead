package io.github.sahithchiluveru.readinstead

import android.webkit.JavascriptInterface
import io.github.sahithchiluveru.readinstead.library.Library
import io.github.sahithchiluveru.readinstead.library.toJson

/** The books on the TV, for the Shelf, exposed to the web reader as `ReadInsteadLibrary`. */
class LibraryBridge(private val library: Library) {
    /** Every book's record as JSON, the most recently read first. */
    @JavascriptInterface
    fun books(): String = library.books().toJson()
}
