package com.tomorrowlab.pdfextractor

import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import android.os.SystemClock
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

class TomorrowPdfExtractorModule : Module() {
    companion object {
        private val readerLock = Any()
    }

    private fun hash(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
        }
        return digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
    }

    override fun definition() = ModuleDefinition {
        Name("TomorrowPdfExtractor")

        AsyncFunction("extractReaderLayout") { fileUri: String -> synchronized(readerLock) {
            val started = SystemClock.elapsedRealtime()
            val context = requireNotNull(appContext.reactContext) { "Android context unavailable" }
            val uri = Uri.parse(fileUri)
            require(uri.scheme == "file" && uri.authority.isNullOrEmpty() && uri.query == null && uri.fragment == null) { "Reader requires a cached local PDF" }
            val file = File(requireNotNull(uri.path)).canonicalFile
            require(file.path.startsWith(context.cacheDir.canonicalPath + File.separator)) { "PDF must be inside app cache" }
            require(file.isFile && file.canRead() && file.length() in 1..1L * 1024 * 1024) { "PDF must be readable and at most 1 MiB" }
            val byteCount = file.length()
            val identity = hash(file)
            require(file.inputStream().use { input -> val header = ByteArray(5); input.read(header) == 5 && String(header, Charsets.US_ASCII) == "%PDF-" }) { "Selected file is not a PDF" }
            PDFBoxResourceLoader.init(context)
            val memory = MemoryUsageSetting.setupTempFileOnly(64L * 1024 * 1024).setTempDir(context.cacheDir)
            PDDocument.load(file, memory).use { document ->
                require(!document.isEncrypted) { "Encrypted PDFs are not supported by the reader" }
                require(document.numberOfPages in 1..20) { "Reader accepts 1–20 PDF pages" }
                val pages = (0 until document.numberOfPages).map { index ->
                    val page = document.getPage(index)
                    val crop = page.cropBox
                    require(crop.width.isFinite() && crop.height.isFinite() && crop.width > 0 && crop.height > 0 && crop.width <= 30000 && crop.height <= 30000) { "Invalid or unsupported PDF page dimensions" }
                    val rotation = ((page.rotation % 360) + 360) % 360
                    require(rotation in listOf(0, 90, 180, 270)) { "Unsupported PDF page rotation" }
                    var vectorWarning: String? = null
                    val vector: Result<List<List<Float>>> = if (rotation == 0) runCatching {
                        RawTableLines(page).apply { processPage(page) }.also {
                            if (it.clippingSeen) vectorWarning = "PDF clipping encountered; vector faces require visual review [${it.diagnosticSummary()}]"
                        }.lines.toList()
                    } else Result.failure(IllegalArgumentException("Rotated raw table geometry is not supported"))
                    mapOf("pageNumber" to index + 1, "width" to if (rotation == 90 || rotation == 270) crop.height else crop.width,
                        "height" to if (rotation == 90 || rotation == 270) crop.width else crop.height,
                        "rotation" to rotation, "cropBox" to listOf(crop.lowerLeftX, crop.lowerLeftY, crop.upperRightX, crop.upperRightY),
                        "coordinateSystem" to "pdf-direction-adjusted-points",
                        "rawTableLines" to vector.getOrNull(),
                        "rawTableGeometryWarning" to (vector.exceptionOrNull()?.let { "Raw vector geometry unavailable: ${it.message}" } ?: vectorWarning))
                }
                val stripper = PositionedTextStripper(100_000, 20_000, 500_000)
                stripper.getText(document)
                check(file.length() == byteCount && hash(file) == identity) { "PDF changed during extraction; result discarded" }
                mapOf("pageCount" to document.numberOfPages, "pages" to pages,
                    "sourceSha256" to identity, "sourceByteCount" to byteCount,
                    "characters" to stripper.characters, "processedTextCallbacks" to stripper.processedTextCallbacks,
                    "durationMs" to SystemClock.elapsedRealtime() - started,
                    "needsReview" to true, "scored" to false)
            }
        } }.runOnQueue(Queues.DEFAULT)

    }
}
