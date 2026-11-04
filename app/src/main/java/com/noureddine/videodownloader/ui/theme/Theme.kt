package com.noureddine.videodownloader.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noureddine.videodownloader.domain.model.ThemeMode

private val LightColors = lightColorScheme(
    primary = Violet,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE6E0FF),
    onPrimaryContainer = Color(0xFF1E0C6B),
    secondary = Coral,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFE0EA),
    onSecondaryContainer = Color(0xFF5A0026),
    tertiary = Cyan,
    background = Paper,
    onBackground = Color(0xFF15141C),
    surface = PaperSurface,
    onSurface = Color(0xFF15141C),
    surfaceVariant = Color(0xFFEDEBF4),
    onSurfaceVariant = Color(0xFF5D5A6B),
    surfaceContainer = Color(0xFFF1EFF8),
    surfaceContainerHigh = Color(0xFFEAE7F3),
    outline = Color(0xFFCAC6D6),
    outlineVariant = Color(0xFFE2DFEB),
    error = Color(0xFFD32F4F),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF9D86FF),
    onPrimary = Color(0xFF1A0A5C),
    primaryContainer = VioletDark,
    onPrimaryContainer = Color(0xFFE6E0FF),
    secondary = Color(0xFFFF7AA8),
    onSecondary = Color(0xFF4A0020),
    secondaryContainer = Color(0xFF6E1239),
    onSecondaryContainer = Color(0xFFFFD9E4),
    tertiary = Cyan,
    background = Ink,
    onBackground = Color(0xFFECEAF4),
    surface = InkSurface,
    onSurface = Color(0xFFECEAF4),
    surfaceVariant = InkSurfaceHigh,
    onSurfaceVariant = Color(0xFFADA9BD),
    surfaceContainer = Color(0xFF1A1A24),
    surfaceContainerHigh = InkSurfaceHigh,
    outline = Color(0xFF4A4758),
    outlineVariant = Color(0xFF2E2C3A),
    error = Color(0xFFFF6B81),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

private val base = Typography()
private val AppTypography = base.copy(
    headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.Bold),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.SemiBold),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    labelLarge = base.labelLarge.copy(fontWeight = FontWeight.SemiBold),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
)

@Composable
fun VideoDownloaderTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val dark = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val colors = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val ctx = LocalContext.current
            if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        }
        dark -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = colors, typography = AppTypography, shapes = AppShapes, content = content)
}
