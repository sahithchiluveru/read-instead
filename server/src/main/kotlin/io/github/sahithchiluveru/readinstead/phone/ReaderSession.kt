package io.github.sahithchiluveru.readinstead.phone

/** The Spread showing on the TV, as the reader last reported it: the text Now Reading copies. */
data class Spread(
    val bookId: String,
    val chapter: String,
    val pageLabel: String,
    /** Either side is empty when that page is blank (beside a cover) or only one page shows. */
    val left: String,
    val right: String,
)

/** The Reader session, as the Phone API sees it. */
fun interface ReaderSession {
    /** The Spread on the TV, or null when no book is open. */
    fun currentSpread(): Spread?
}
