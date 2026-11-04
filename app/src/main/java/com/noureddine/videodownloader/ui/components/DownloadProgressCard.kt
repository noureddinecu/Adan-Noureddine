package com.noureddine.videodownloader.ui.components

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.noureddine.videodownloader.R
import com.noureddine.videodownloader.core.util.Formatters
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.model.DownloadStatus

@Composable
fun DownloadProgressCard(
    item: DownloadItem,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val animated by animateFloatAsState(item.progress.coerceIn(0f, 1f), label = "progress")
    Card(
        modifier = modifier.fillMaxWidth().animateContentSize(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Thumbnail(item.thumbnailUrl, item.isAudioOnly, Modifier.size(width = 72.dp, height = 48.dp), corner = 10.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(item.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(2.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PlatformBadge(item.platform)
                        Text(item.qualityLabel, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                when (item.status) {
                    DownloadStatus.DOWNLOADING, DownloadStatus.QUEUED ->
                        FilledTonalIconButton(onClick = onPause) { Icon(Icons.Filled.Pause, stringResource(R.string.action_pause)) }
                    DownloadStatus.PAUSED ->
                        FilledTonalIconButton(onClick = onResume) { Icon(Icons.Filled.PlayArrow, stringResource(R.string.action_resume)) }
                    DownloadStatus.FAILED ->
                        FilledTonalIconButton(onClick = onResume) { Icon(Icons.Filled.Refresh, stringResource(R.string.action_retry)) }
                    else -> {}
                }
                IconButton(onClick = onCancel) { Icon(Icons.Filled.Close, stringResource(R.string.action_cancel)) }
            }
            Spacer(Modifier.height(10.dp))
            if (item.status == DownloadStatus.QUEUED || item.progress < 0f) {
                LinearProgressIndicator(Modifier.fillMaxWidth().height(6.dp).clip(MaterialTheme.shapes.small))
            } else {
                LinearProgressIndicator(
                    progress = { animated },
                    modifier = Modifier.fillMaxWidth().height(6.dp).clip(MaterialTheme.shapes.small),
                    color = if (item.status == DownloadStatus.PAUSED) MaterialTheme.colorScheme.outline
                    else MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(statusLabel(item), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(sizeLabel(item), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun statusLabel(item: DownloadItem): String = when (item.status) {
    DownloadStatus.QUEUED -> stringResource(R.string.status_queued)
    DownloadStatus.DOWNLOADING -> buildString {
        if (item.progress >= 0) append("${(item.progress * 100).toInt()}%") else append(stringResource(R.string.status_downloading))
        if (item.etaSeconds > 0) append(" • ").append(stringResource(R.string.eta, Formatters.duration(item.etaSeconds)))
    }
    DownloadStatus.PAUSED -> stringResource(R.string.status_paused) + " • ${(item.progress.coerceAtLeast(0f) * 100).toInt()}%"
    DownloadStatus.FAILED -> errorCodeText(item.errorMessage)
    DownloadStatus.COMPLETED -> stringResource(R.string.status_completed)
    DownloadStatus.CANCELED -> stringResource(R.string.status_canceled)
}

private fun sizeLabel(item: DownloadItem): String = when {
    item.totalBytes > 0 && item.downloadedBytes > 0 ->
        "${Formatters.bytes(item.downloadedBytes)} / ${Formatters.bytes(item.totalBytes)}"
    item.totalBytes > 0 -> Formatters.bytes(item.totalBytes)
    else -> ""
}
