package com.noureddine.videodownloader.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.noureddine.videodownloader.domain.model.Platform

val Violet = Color(0xFF6C4DFF)
val VioletDark = Color(0xFF4B2FE0)
val VioletLight = Color(0xFFC9BEFF)
val Coral = Color(0xFFFF4D8D)
val Cyan = Color(0xFF00C2FF)
val Mint = Color(0xFF1DD1A1)

val Ink = Color(0xFF0D0D14)
val InkSurface = Color(0xFF16161F)
val InkSurfaceHigh = Color(0xFF20202C)
val Paper = Color(0xFFF7F6FB)
val PaperSurface = Color(0xFFFFFFFF)

val BrandGradient = Brush.linearGradient(listOf(Violet, Color(0xFF9B4DFF), Coral))

fun Platform.brandColor(): Color = when (this) {
    Platform.FACEBOOK -> Color(0xFF1877F2)
    Platform.TIKTOK -> Color(0xFF111111)
    Platform.INSTAGRAM -> Color(0xFFE1306C)
    Platform.YOUTUBE -> Color(0xFFFF0033)
    Platform.X -> Color(0xFF14171A)
    Platform.VIMEO -> Color(0xFF1AB7EA)
    Platform.DIRECT -> Mint
    Platform.OTHER -> Violet
}
