package com.noureddine.videodownloader.ui.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.noureddine.videodownloader.R
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.domain.model.DownloadStatus
import com.noureddine.videodownloader.ui.components.ConfirmDialog
import com.noureddine.videodownloader.ui.components.EmptyState
import com.noureddine.videodownloader.ui.components.FileActions
import com.noureddine.videodownloader.ui.components.PlatformBadge
import com.noureddine.videodownloader.ui.components.Thumbnail
import com.noureddine.videodownloader.ui.components.errorCodeText
import java.text.DateFormat
import java.util.Date

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    onReDownload: (String) -> Unit,
    viewModel: HistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var confirmClear by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(stringResource(R.string.nav_history)) },
            actions = {
                IconButton(onClick = { confirmClear = true }) {
                    Icon(Icons.Filled.DeleteSweep, stringResource(R.string.clear_history))
                }
            },
        )
        OutlinedTextField(
            value = state.query, onValueChange = viewModel::setQuery,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            placeholder = { Text(stringResource(R.string.search_history)) },
            leadingIcon = { Icon(Icons.Filled.Search, null) },
            singleLine = true, shape = MaterialTheme.shapes.medium,
        )
        Spacer(Modifier.height(8.dp))
        Box(Modifier.weight(1f)) {
            if (state.loaded && state.items.isEmpty()) {
                EmptyState(
                    Icons.Filled.History, stringResource(R.string.history_empty_title),
                    stringResource(R.string.history_empty_msg), Modifier.align(Alignment.Center),
                )
            } else {
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.items, key = { it.id }) { item ->
                        HistoryRow(
                            item = item,
                            onRetry = { viewModel.retry(item.id) },
                            onReDownload = { onReDownload(item.sourceUrl) },
                            onCopy = { FileActions.copyLink(context, item.sourceUrl) },
                            onShare = { FileActions.shareLink(context, item.sourceUrl) },
                            onRemove = { viewModel.removeRecord(item.id) },
                            modifier = Modifier.animateItem(),
                        )
                    }
                }
            }
        }
    }
    if (confirmClear) {
        ConfirmDialog(
            title = stringResource(R.string.clear_history),
            message = stringResource(R.string.clear_history_msg),
            confirm = stringResource(R.string.action_clear),
            onConfirm = viewModel::clearInactive,
            onDismiss = { confirmClear = false },
        )
    }
}

@Composable
private fun HistoryRow(
    item: DownloadItem,
    onRetry: () -> Unit,
    onReDownload: () -> Unit,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var menu by remember { mutableStateOf(false) }
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Thumbnail(item.thumbnailUrl, item.isAudioOnly, Modifier.size(width = 80.dp, height = 52.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(item.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PlatformBadge(item.platform)
                    Text(
                        statusText(item), style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        color = if (item.status == DownloadStatus.FAILED) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(item.createdAt)),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (item.status.isResumable) {
                IconButton(onClick = onRetry) { Icon(Icons.Filled.Refresh, stringResource(R.string.action_retry)) }
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.more)) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.action_download_again)) },
                        leadingIcon = { Icon(Icons.Filled.Download, null) }, onClick = { menu = false; onReDownload() })
                    DropdownMenuItem(text = { Text(stringResource(R.string.action_copy_link)) },
                        leadingIcon = { Icon(Icons.Filled.ContentCopy, null) }, onClick = { menu = false; onCopy() })
                    DropdownMenuItem(text = { Text(stringResource(R.string.action_share_link)) },
                        leadingIcon = { Icon(Icons.Filled.Share, null) }, onClick = { menu = false; onShare() })
                    DropdownMenuItem(text = { Text(stringResource(R.string.action_remove_record)) },
                        leadingIcon = { Icon(Icons.Filled.RemoveCircleOutline, null) }, onClick = { menu = false; onRemove() })
                }
            }
        }
    }
}

@Composable
private fun statusText(item: DownloadItem): String = when (item.status) {
    DownloadStatus.QUEUED -> stringResource(R.string.status_queued)
    DownloadStatus.DOWNLOADING -> stringResource(R.string.status_downloading) + " ${(item.progress.coerceAtLeast(0f) * 100).toInt()}%"
    DownloadStatus.PAUSED -> stringResource(R.string.status_paused)
    DownloadStatus.COMPLETED -> stringResource(R.string.status_completed) + " • ${item.qualityLabel}"
    DownloadStatus.FAILED -> errorCodeText(item.errorMessage)
    DownloadStatus.CANCELED -> stringResource(R.string.status_canceled)
}
