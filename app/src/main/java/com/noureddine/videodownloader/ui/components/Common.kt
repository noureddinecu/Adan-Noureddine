package com.noureddine.videodownloader.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import com.noureddine.videodownloader.R
import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.Platform
import com.noureddine.videodownloader.ui.theme.brandColor

@Composable
fun PlatformBadge(platform: Platform, modifier: Modifier = Modifier) {
    val color = platform.brandColor()
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        color = color.copy(alpha = 0.14f),
        contentColor = if (platform == Platform.TIKTOK || platform == Platform.X)
            MaterialTheme.colorScheme.onSurface else color,
    ) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(color))
            Spacer(Modifier.size(6.dp))
            Text(
                text = if (platform == Platform.DIRECT) stringResource(R.string.platform_direct)
                else if (platform == Platform.OTHER) stringResource(R.string.platform_other)
                else platform.displayName,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
fun Thumbnail(url: String?, audio: Boolean, modifier: Modifier = Modifier, corner: Dp = 14.dp) {
    val shape = RoundedCornerShape(corner)
    val placeholder: @Composable () -> Unit = {
        Box(
            Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (audio) Icons.Filled.MusicNote else Icons.Filled.Movie, null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    Box(modifier.clip(shape)) {
        if (url.isNullOrBlank()) placeholder()
        else SubcomposeAsyncImage(
            model = url, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            loading = { placeholder() }, error = { placeholder() },
        )
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, message: String, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(84.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(38.dp))
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(
            message, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    Text(
        text.uppercase(), modifier = modifier.padding(horizontal = 4.dp, vertical = 8.dp),
        style = MaterialTheme.typography.labelMedium, color = color, fontWeight = FontWeight.Bold,
    )
}

/** Localized message for a typed error. */
@Composable
fun errorText(error: AppError): String = when (error) {
    AppError.InvalidUrl -> stringResource(R.string.err_invalid_url)
    AppError.UnsupportedUrl -> stringResource(R.string.err_unsupported)
    AppError.PolicyBlocked -> stringResource(R.string.err_policy)
    AppError.LoginRequired -> stringResource(R.string.err_login)
    AppError.NotFound -> stringResource(R.string.err_not_found)
    AppError.DrmProtected -> stringResource(R.string.err_drm)
    AppError.Network -> stringResource(R.string.err_network)
    AppError.NoFormats -> stringResource(R.string.err_no_formats)
    AppError.Storage -> stringResource(R.string.err_storage)
    AppError.EngineNotReady -> stringResource(R.string.err_engine)
    is AppError.Unknown -> stringResource(R.string.err_unknown, error.detail.orEmpty())
}

/** Maps an error code persisted by the worker to a localized string. */
@Composable
fun errorCodeText(code: String?): String {
    if (code.isNullOrBlank()) return stringResource(R.string.err_unknown, "")
    if (code.startsWith("UNKNOWN:")) return stringResource(R.string.err_unknown, code.removePrefix("UNKNOWN:"))
    val error = when (code) {
        "InvalidUrl" -> AppError.InvalidUrl
        "UnsupportedUrl" -> AppError.UnsupportedUrl
        "PolicyBlocked" -> AppError.PolicyBlocked
        "LoginRequired" -> AppError.LoginRequired
        "NotFound" -> AppError.NotFound
        "DrmProtected" -> AppError.DrmProtected
        "Network" -> AppError.Network
        "NoFormats" -> AppError.NoFormats
        "Storage" -> AppError.Storage
        "EngineNotReady" -> AppError.EngineNotReady
        else -> AppError.Unknown(code)
    }
    return errorText(error)
}
