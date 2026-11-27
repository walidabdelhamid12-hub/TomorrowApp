package com.tomorrowlab.pdfextractor

import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition

class PositionedTextStripper(
    private val maxGlyphs: Int = Int.MAX_VALUE,
    private val maxCallbacks: Int = Int.MAX_VALUE,
    private val maxTextUnits: Int = Int.MAX_VALUE
) : PDFTextStripper() {
    private var callbackTextUnits = 0L
    private var glyphTextUnits = 0L
    val characters = mutableListOf<Map<String, Any>>()
    // Separate diagnostic stream: one record for every writeString callback.
    val processedTextCallbacks = mutableListOf<Map<String, Any>>()

    init {
        setSortByPosition(true)
    }

    override fun writeString(
        text: String,
        textPositions: MutableList<TextPosition>
    ) {
        require(characters.size.toLong() + textPositions.size <= maxGlyphs) { "PDF glyph limit exceeded; no partial extraction returned" }
        require(processedTextCallbacks.size < maxCallbacks) { "PDF callback limit exceeded; no partial extraction returned" }
        val nextCallbackUnits = callbackTextUnits + text.length
        val nextGlyphUnits = glyphTextUnits + textPositions.sumOf { (it.unicode?.length ?: 0).toLong() }
        require(nextCallbackUnits <= maxTextUnits && nextGlyphUnits <= maxTextUnits) { "PDF text limit exceeded; no partial extraction returned" }
        callbackTextUnits = nextCallbackUnits
        glyphTextUnits = nextGlyphUnits
        processedTextCallbacks.add(
            mapOf(
                "sequence" to (processedTextCallbacks.size + 1),
                "page" to currentPageNo,
                "text" to text,
                // Global zero-based range into the unchanged exported characters list.
                // Empty callbacks use the current insertion index and a zero count.
                "glyphStartIndex" to characters.size,
                "glyphCount" to textPositions.size,
            )
        )

        for (position in textPositions) {
            characters.add(
                mapOf(
                    "page" to currentPageNo,
                    "text" to position.unicode,
                    "x" to position.xDirAdj,
                    "y" to position.yDirAdj,
                    "width" to position.widthDirAdj,
                    "height" to position.heightDir
                )
            )
        }
    }
}
