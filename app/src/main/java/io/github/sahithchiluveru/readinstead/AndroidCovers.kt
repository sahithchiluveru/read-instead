package io.github.sahithchiluveru.readinstead

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import io.github.sahithchiluveru.readinstead.library.Cover
import io.github.sahithchiluveru.readinstead.library.Covers
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException

/** Renders PDF covers with the platform's PdfRenderer and sizes every cover for the Shelf. */
class AndroidCovers : Covers {
    override fun pdfFirstPage(file: File): Cover? {
        // The renderer owns the descriptor from here on, and closes it.
        val renderer = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).let { fd ->
            try {
                PdfRenderer(fd)
            } catch (e: Exception) {
                fd.close()
                throw e
            }
        }
        try {
            if (renderer.pageCount == 0) throw IOException("the PDF has no pages")
            val page = renderer.openPage(0)
            try {
                val bitmap = Bitmap.createBitmap(WIDTH, heightFor(page.width, page.height), Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                return jpeg(bitmap).also { bitmap.recycle() }
            } finally {
                page.close()
            }
        } finally {
            renderer.close()
        }
    }

    override fun shrink(cover: Cover): Cover? {
        val bytes = cover.bytes
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0) return null
        if (bounds.outWidth <= WIDTH && bounds.outHeight <= WIDTH * 3) return cover
        val sample = generateSequence(1) { it * 2 }.first { bounds.outWidth / (it * 2) < WIDTH }
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size,
            BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        val height = heightFor(decoded.width, decoded.height)
        // Drawn over white, since JPEG has no transparency.
        val scaled = Bitmap.createBitmap(WIDTH, height, Bitmap.Config.ARGB_8888)
        val resized = Bitmap.createScaledBitmap(decoded, WIDTH, height, true)
        Canvas(scaled).apply {
            drawColor(Color.WHITE)
            drawBitmap(resized, 0f, 0f, null)
        }
        decoded.recycle()
        resized.recycle()
        return jpeg(scaled).also { scaled.recycle() }
    }

    /** The height at the Shelf's width, capped for absurdly tall images. */
    private fun heightFor(width: Int, height: Int) =
        (height.toLong() * WIDTH / width.coerceAtLeast(1)).toInt().coerceIn(1, WIDTH * 3)

    private fun jpeg(bitmap: Bitmap): Cover {
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
        return Cover(out.toByteArray(), "image/jpeg")
    }

    private companion object {
        /** Twice the Shelf's cover width, for the TV's 2× density. */
        const val WIDTH = 360
    }
}
