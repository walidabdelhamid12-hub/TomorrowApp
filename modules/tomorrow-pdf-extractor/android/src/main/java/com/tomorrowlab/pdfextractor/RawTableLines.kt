package com.tomorrowlab.pdfextractor

import android.graphics.Path
import android.graphics.PointF
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.RegionIterator
import android.graphics.Path.FillType
import com.tom_roush.pdfbox.contentstream.PDFGraphicsStreamEngine
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImage
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Exact floating-point intersections only; null evidence means unsupported, never unbounded. */
internal data class FloatClipRect(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val finite: Boolean get() = left.isFinite() && top.isFinite() && right.isFinite() && bottom.isFinite()
    val empty: Boolean get() = left >= right || top >= bottom
    fun intersect(other: FloatClipRect) = FloatClipRect(max(left, other.left), max(top, other.top),
        min(right, other.right), min(bottom, other.bottom))
    fun paintedPortion(x0: Float, y0: Float, x1: Float, y1: Float): List<Float>? {
        if (!finite || empty || !listOf(x0, y0, x1, y1).all { it.isFinite() }) return null
        // Near-axis strokes are not snapped onto an axis. Boundary-coincident lines are uncertain.
        if (y0 == y1 && x0 != x1 && y0 > top && y0 < bottom) {
            val lo = max(min(x0, x1), left); val hi = min(max(x0, x1), right)
            return if (hi - lo >= 1f) listOf(lo, y0, hi, y0) else null
        }
        if (x0 == x1 && y0 != y1 && x0 > left && x0 < right) {
            val lo = max(min(y0, y1), top); val hi = min(max(y0, y1), bottom)
            return if (hi - lo >= 1f) listOf(x0, lo, x0, hi) else null
        }
        return null
    }
}
internal fun intersectRectangularClips(paths: List<FloatClipRect?>): FloatClipRect? {
    if (paths.isEmpty() || paths.size > 4096 || paths.any { it == null || !it.finite }) return null
    return paths.filterNotNull().reduce { bounds, next -> bounds.intersect(next) }
}

/** Bounded vector evidence only. No text, financial fields or inferred cell values. */
internal class RawTableLines(private val sourcePage: PDPage) : PDFGraphicsStreamEngine(sourcePage) {
    val lines = mutableListOf<List<Float>>()
    // Diagnostic quarantine: post-clip geometry is never forwarded as verified table lines.
    val postClipCandidates = mutableListOf<List<Float>>()
    var postClipCandidatesRejected = 0
        private set
    var clipStateRegistered = 0
        private set
    var clipStateUnsupported = 0
        private set
    var recoveredClipLines = 0
        private set
    private var clipRecoverySafe = true
    // D3-A counters retained; rasterized visibility is diagnostic, never recovery authority.
    var recoveryAttempted = 0
        private set
    var recoveryNonAxisOrFractional = 0
        private set
    var recoveryInvalidCoordinates = 0
        private set
    var recoveryNonAxis = 0
        private set
    var recoveryFractionalVisibleCandidate = 0
        private set
    var recoveryFractional = 0
        private set
    var recoveryEmptyClip = 0
        private set
    var recoveryNoVisibleInterval = 0
        private set
    var recoveryNoAcceptedLine = 0
        private set
    var clippingSeen = false
        private set
    private val path = mutableListOf<Pair<PointF, PointF>>()
    private var hasCurves = false
    private var subpathCount = 0
    private var unsupportedPath = false
    private var pendingClip: Path? = null
    private var current = PointF()
    private var start = PointF()
    private var operations = 0
    var clipCount = 0
        private set
    var strokeCount = 0
        private set
    var fillCount = 0
        private set
    var emittedBeforeClip = 0
        private set
    var suppressedAfterClip = 0
        private set
    var clearedOnClip = 0
        private set
    // Clip-operator path evidence only: not the effective graphics-state clip.
    var clipPathSegmentsObserved = 0
        private set
    var clipPathAxisAlignedObserved = 0
        private set
    var clipPathNonAxisAlignedObserved = 0
        private set
    var clipPathEmptyOperators = 0
        private set
    // Diagnostic only: distinguish suppressed axis-aligned candidates from other paths.
    var suppressedAxisAlignedAfterClip = 0
        private set
    var suppressedOtherAfterClip = 0
        private set
    fun diagnosticSummary(): String =
        "clip=$clipCount stroke=$strokeCount fill=$fillCount emittedBeforeClip=$emittedBeforeClip suppressedAfterClip=$suppressedAfterClip suppressedAxisAlignedAfterClip=$suppressedAxisAlignedAfterClip suppressedOtherAfterClip=$suppressedOtherAfterClip clearedOnClip=$clearedOnClip finalLines=${lines.size} quarantinedPostClip=${postClipCandidates.size} rejectedPostClip=$postClipCandidatesRejected clipPathSegments=$clipPathSegmentsObserved clipPathAxisAligned=$clipPathAxisAlignedObserved clipPathOther=$clipPathNonAxisAlignedObserved clipPathEmpty=$clipPathEmptyOperators clipStateRegistered=$clipStateRegistered clipStateUnsupported=$clipStateUnsupported recoveredClipLines=$recoveredClipLines clipRecoverySafe=$clipRecoverySafe recoveryAttempted=$recoveryAttempted recoveryNonAxisOrFractional=$recoveryNonAxisOrFractional recoveryInvalidCoordinates=$recoveryInvalidCoordinates recoveryNonAxis=$recoveryNonAxis recoveryFractional=$recoveryFractional recoveryFractionalVisibleCandidate=$recoveryFractionalVisibleCandidate recoveryEmptyClip=$recoveryEmptyClip recoveryNoVisibleInterval=$recoveryNoVisibleInterval recoveryNoAcceptedLine=$recoveryNoAcceptedLine"
    private fun point(x: Float, y: Float) = PointF(x, y)
    private fun segment(a: PointF, b: PointF) {
        require(++operations <= 50_000 && path.size < 4096) { "Raw table path limit exceeded" }
        path.add(point(a.x, a.y) to point(b.x, b.y))
    }
    private fun emit(a: PointF, b: PointF, filled: Boolean = false) {
        // Candidate lines after a PDF clip are evidence only. The crop box is NOT the
        // graphics-state clipping path; never promote these to lines without validation.
        if (clippingSeen) {
            val visibleClip = currentFloatClip()
            clipRecoverySafe = visibleClip != null
            // Dashed or fully transparent paint cannot authorize a continuous boundary.
            val paintSupported = if (filled) getGraphicsState().nonStrokeAlphaConstant > 0.0
                else getGraphicsState().alphaConstant > 0.0 && getGraphicsState().lineDashPattern.dashArray.isEmpty()
            if (paintSupported && visibleClip != null && recoverVisibleClipSegments(a, b, visibleClip)) return
            suppressedAfterClip++
            val axisAligned = abs(a.x - b.x) <= 0.5f || abs(a.y - b.y) <= 0.5f
            val nonDegenerate = abs(a.x - b.x) >= 0.01f || abs(a.y - b.y) >= 0.01f
            if (axisAligned && nonDegenerate) suppressedAxisAlignedAfterClip++
            else suppressedOtherAfterClip++
            val candidate = cropAxisAligned(a, b)
            if (candidate != null && postClipCandidates.size < 5000) {
                postClipCandidates.add(candidate)
            } else {
                postClipCandidatesRejected++
            }
            return
        }
        val bounded = cropAxisAligned(a, b) ?: return
        require(lines.size < 5000) { "Raw table line limit exceeded" }
        emittedBeforeClip++
        lines.add(bounded)
    }

    /** PDFBox retains float Paths, including nested clips and q/Q-restored states.
     *  Accept only proven non-inverse rectangles; Region rasterization is not evidence.
     */
    private fun currentFloatClip(): FloatClipRect? = try {
        val paths = getGraphicsState().getCurrentClippingPaths()
        if (paths.isEmpty() || paths.size > 4096) null else intersectRectangularClips(paths.map { candidate ->
            val bounds = RectF()
            if (candidate.isInverseFillType || !candidate.isRect(bounds)) null
            else FloatClipRect(bounds.left, bounds.top, bounds.right, bounds.bottom)
        })
    } catch (_: Exception) { null }

    private fun recoverVisibleClipSegments(a: PointF, b: PointF, clip: FloatClipRect): Boolean {
        recoveryAttempted++
        if (!a.x.isFinite() || !a.y.isFinite() || !b.x.isFinite() || !b.y.isFinite()) { recoveryInvalidCoordinates++; recoveryNonAxisOrFractional++; return false }
        val horizontal = a.y == b.y
        val vertical = a.x == b.x
        if (horizontal == vertical) { recoveryNonAxis++; recoveryNonAxisOrFractional++; return false }
        val fixed = if (horizontal) a.y else a.x
        if (abs(fixed - kotlin.math.round(fixed)) > 0.01f) {
            recoveryFractional++
            recoveryNonAxisOrFractional++
            // D3-A raster diagnostic retained; only float Path evidence can authorize recovery.
            val region = try { getGraphicsState().getCurrentClippingPath() }
                         catch (_: Exception) { null }
            if (region != null && !region.isEmpty) {
                val iterator = RegionIterator(region)
                val rect = Rect()
                var inspected = 0
                while (iterator.next(rect)) {
                    if (++inspected > 4096) break
                    val safelyInside = if (horizontal)
                        fixed >= rect.top + 2f && fixed <= rect.bottom - 2f
                    else
                        fixed >= rect.left + 2f && fixed <= rect.right - 2f
                    val lo = if (horizontal) min(a.x, b.x) else min(a.y, b.y)
                    val hi = if (horizontal) max(a.x, b.x) else max(a.y, b.y)
                    val left = if (horizontal) rect.left.toFloat() else rect.top.toFloat()
                    val right = if (horizontal) rect.right.toFloat() else rect.bottom.toFloat()
                    if (safelyInside && min(hi, right) - max(lo, left) >= 1f) {
                        recoveryFractionalVisibleCandidate++
                        break
                    }
                }
            }
        }
        if (clip.empty) { recoveryEmptyClip++; return false }
        val portion = clip.paintedPortion(a.x, a.y, b.x, b.y)
        if (portion == null) { recoveryNoVisibleInterval++; return false }
        val line = cropAxisAligned(point(portion[0], portion[1]), point(portion[2], portion[3]))
        if (line == null || lines.size >= 5000) { recoveryNoAcceptedLine++; return false }
        lines.add(line)
        recoveredClipLines++
        return true
    }

    /** Page-crop bounded only; does not imply visibility under PDF clipping paths. */
    private fun cropAxisAligned(a: PointF, b: PointF): List<Float>? {
        if (!a.x.isFinite() || !a.y.isFinite() || !b.x.isFinite() || !b.y.isFinite()) return null
        if (abs(a.x - b.x) > 0.5f && abs(a.y - b.y) > 0.5f) return null
        if (abs(a.x - b.x) < 0.01f && abs(a.y - b.y) < 0.01f) return null
        val crop = sourcePage.cropBox
        val x0 = crop.lowerLeftX
        val x1 = crop.upperRightX
        val y0 = crop.lowerLeftY
        val y1 = crop.upperRightY
        if (!x0.isFinite() || !x1.isFinite() || !y0.isFinite() || !y1.isFinite()) return null
        if (x1 <= x0 || y1 <= y0) return null
        val vertical = abs(a.x - b.x) <= 0.5f
        val horizontal = abs(a.y - b.y) <= 0.5f
        return when {
            vertical -> {
                val x = (a.x + b.x) / 2f
                if (x < x0 || x > x1) return null
                val low = max(min(a.y, b.y), y0)
                val high = min(max(a.y, b.y), y1)
                if (high - low < 0.01f) return null
                listOf(x - x0, y1 - low, x - x0, y1 - high)
            }
            horizontal -> {
                val y = (a.y + b.y) / 2f
                if (y < y0 || y > y1) return null
                val low = max(min(a.x, b.x), x0)
                val high = min(max(a.x, b.x), x1)
                if (high - low < 0.01f) return null
                listOf(low - x0, y1 - y, high - x0, y1 - y)
            }
            else -> null
        }
    }
    override fun appendRectangle(p0: PointF, p1: PointF, p2: PointF, p3: PointF) {
        subpathCount++
        segment(p0, p1); segment(p1, p2); segment(p2, p3); segment(p3, p0)
        current = point(p0.x, p0.y); start = point(p0.x, p0.y)
    }
    override fun moveTo(x: Float, y: Float) {
        subpathCount++
        current = point(x, y); start = point(x, y)
    }
    override fun lineTo(x: Float, y: Float) { val next = point(x, y); segment(current, next); current = next }
    override fun curveTo(x1: Float, y1: Float, x2: Float, y2: Float, x3: Float, y3: Float) {
        hasCurves = true
        current = point(x3, y3)
    }
    override fun getCurrentPoint(): PointF = current
    override fun closePath() { segment(current, start); current = point(start.x, start.y) }
    private fun clearPath() {
        // W/W* takes effect when the path ends, after any painting of that path.
        pendingClip?.let { getGraphicsState().intersectClippingPath(it) }
        pendingClip = null
        path.clear()
        hasCurves = false
        subpathCount = 0
        unsupportedPath = false
    }
    override fun endPath() { clearPath() }
    // Clipping paths are visibility evidence only, never emitted borders.
    override fun clip(windingRule: FillType) {
        clipCount++
        // A clip operator consumes the current path only when the PDF path ends.
        // Observe its segments here without clearing them or promoting them to borders.
        if (path.isEmpty()) clipPathEmptyOperators++
        for ((a, b) in path) {
            clipPathSegmentsObserved++
            if (a.x.isFinite() && a.y.isFinite() && b.x.isFinite() && b.y.isFinite() &&
                (abs(a.x - b.x) <= 0.5f || abs(a.y - b.y) <= 0.5f)) {
                clipPathAxisAlignedObserved++
            } else {
                clipPathNonAxisAlignedObserved++
            }
        }
        // Register the PDF clipping path in PDFBox graphics state. Do not promote
        // painted segments yet: precise visibility, q/Q and complex paths still
        // require the independent Android integration gate.
        val clipPath = Path()
        val safe = !hasCurves && !unsupportedPath && subpathCount == 1 && path.size in 3..4 &&
            path.all { (a, b) -> a.x.isFinite() && a.y.isFinite() && b.x.isFinite() && b.y.isFinite() &&
                ((a.x == b.x && a.y != b.y) || (a.y == b.y && a.x != b.x)) } &&
            path.zipWithNext().all { (first, second) ->
                first.second.x == second.first.x && first.second.y == second.first.y }
        if (safe) {
            // A PDF clipping path implicitly closes each open subpath. Rebuild
            // connected straight-line contours; never use this path as a border.
            var previousEnd: PointF? = null
            for ((a, b) in path) {
                val prev = previousEnd
                if (prev == null || abs(prev.x - a.x) > 0.01f || abs(prev.y - a.y) > 0.01f) {
                    if (prev != null) clipPath.close()
                    clipPath.moveTo(a.x, a.y)
                }
                clipPath.lineTo(b.x, b.y)
                previousEnd = b
            }
            clipPath.close()
            clipPath.fillType = windingRule
        }
        val bounds = RectF()
        if (pendingClip == null && safe && !clipPath.isInverseFillType && clipPath.isRect(bounds)) {
            pendingClip = clipPath
            clipStateRegistered++
        } else {
            // Empty-path poison belongs to THIS PDFBox state. Clones inherit it;
            // q/Q restores the former proven paths without a global sticky flag.
            pendingClip = Path()
            clipStateUnsupported++
        }
        clippingSeen = true
    }
    override fun strokePath() {
        strokeCount++
        if (!hasCurves && !unsupportedPath) path.forEach { emit(it.first, it.second) }
        clearPath()
    }
    /** Only an actual thin, axis-aligned, closed rectangular fill can be a border.
     *  Bounding boxes of arbitrary polygons must not manufacture table lines.
     */
    private fun emitThinRectangleFill() {
        if (hasCurves || unsupportedPath || subpathCount > 1 || path.size != 4) return
        val vertices = path.map { it.first }
        if (vertices.any { !it.x.isFinite() || !it.y.isFinite() }) return
        for (i in 0 until 4) {
            val a = path[i].first
            val b = path[i].second
            val next = path[(i + 1) % 4].first
            if (abs(b.x - next.x) > 0.01f || abs(b.y - next.y) > 0.01f) return
            if (abs(a.x - b.x) > 0.5f && abs(a.y - b.y) > 0.5f) return
        }
        val x0 = vertices.minOf { it.x }; val x1 = vertices.maxOf { it.x }
        val y0 = vertices.minOf { it.y }; val y1 = vertices.maxOf { it.y }
        val width = x1 - x0; val height = y1 - y0
        if (width <= 0f || height <= 0f) return
        if (width <= 1.5f && height > 1.5f) {
            emit(point((x0 + x1) / 2f, y0), point((x0 + x1) / 2f, y1), filled = true)
        } else if (height <= 1.5f && width > 1.5f) {
            emit(point(x0, (y0 + y1) / 2f), point(x1, (y0 + y1) / 2f), filled = true)
        }
    }
    override fun fillPath(windingRule: FillType) {
        fillCount++
        emitThinRectangleFill()
        clearPath()
    }
    override fun fillAndStrokePath(windingRule: FillType) {
        fillCount++
        strokeCount++
        emitThinRectangleFill()
        if (!hasCurves && !unsupportedPath) path.forEach { emit(it.first, it.second) }
        clearPath()
    }
    override fun drawImage(image: PDImage) { /* Raster content remains on the existing OCR path. */ }
    override fun shadingFill(shadingName: COSName) { }
}
