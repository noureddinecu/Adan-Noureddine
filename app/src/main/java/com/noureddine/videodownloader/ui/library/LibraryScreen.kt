package com.noureddine.videodownloader.ui.library

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DriveFileRenameOutline
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.noureddine.videodownloader.R
import com.noureddine.videodownloader.core.util.DateBucket
import com.noureddine.videodownloader.core.util.Formatters
import com.noureddine.videodownloader.data.storage.MediaStorage
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.ui.components.ConfirmDialog
import com.noureddine.videodownloader.ui.components.EmptyState
import com.noureddine.videodownloader.ui.components.FileActions
import com.noureddine.videodownloader.ui.components.PlatformBadge
import com.noureddine.videodownloader.ui.components.RenameDialog
import com.noureddine.videodownloader.ui.components.SectionHeader
import com.noureddine.videodownloader.ui.components.Thumbnail
import java.text.DateFormat
import java.util.Date

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    storage: MediaStorage,
    onPlay: (Long) -> Unit,
    onMessage: (String) -> Unit,
    bottomContent: @Composable () -> Unit,
    viewModel: LibraryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var renameTarget by remember { mutableStateOf<DownloadItem?>(null) }
    var deleteTarget by remember { mutableStateOf<DownloadItem?>(null) }
    var sortMenu by rememberSaveable { mutableStateOf(false) }

    val msgRenamed = stringResource(R.string.msg_renamed)
    val msgRenameFailed = stringResource(R.string.msg_rename_failed)
    val msgDeleted = stringResource(R.string.msg_deleted)
    val msgDeleteFailed = stringResource(R.string.msg_delete_failed)
    LaunchedEffect(Unit) {
        viewModel.events.collect {
            onMessage(
                when (it) {
                    LibraryEvent.Renamed -> msgRenamed
                    LibraryEvent.RenameFailed -> msgRenameFailed
                    LibraryEvent.Deleted -> msgDeleted
                    LibraryEvent.DeleteFailed -> msgDeleteFailed
                }
            )
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(stringResource(R.string.nav_library)) },
            actions = {
                Box {
                    IconButton(onClick = { sortMenu = true }) { Icon(Icons.AutoMirrored.Filled.Sort, stringResource(R.string.sort)) }
                    DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                        LibrarySort.entries.forEach { s ->
                            DropdownMenuItem(
                                text = { Text(sortLabel(s), color = if (s == state.sort) MaterialTheme.colorScheme.primary else Color.Unspecified) },
                                onClick = { viewModel.setSort(s); sortMenu = false },
                            )
                        }
                    }
                }
            },
        )
        if (state.platforms.size > 1) {
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    FilterChip(selected = state.filter == null, onClick = { viewModel.setFilter(null) },
                        label = { Text(stringResource(R.string.filter_all)) })
                }
                items(state.platforms) { p ->
                    FilterChip(selected = state.filter == p, onClick = { viewModel.setFilter(p) }, label = { Text(p.displayName) })
                }
            }
        }
        Box(Modifier.weight(1f)) {
            if (state.loaded && state.totalCount == 0) {
                EmptyState(
                    Icons.Filled.VideoLibrary, stringResource(R.string.library_empty_title),
                    stringResource(R.string.library_empty_msg), Modifier.align(Alignment.Center),
                )
            } else {
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    state.sections.forEach { (bucket, items) ->
                        if (state.sort == LibrarySort.NEWEST || state.sort == LibrarySort.OLDEST) {
                            item(key = "h-$bucket") { SectionHeader(bucketLabel(bucket)) }
                        }
                        items(items, key = { it.id }) { item ->
                            LibraryItem(
                                item = item,
                                onPlay = { onPlay(item.id) },
                                onShare = { item.fileUri?.let { FileActions.shareFile(context, storage, it, item.mimeType) } },
                                onRename = { renameTarget = item },
                                onDelete = { deleteTarget = item },
                                onCopyLink = { FileActions.copyLink(context, item.sourceUrl) },
                                onOpenSource = { FileActions.openExternal(context, item.sourceUrl) },
                                modifier = Modifier.animateItem(),
                            )
                        }
                    }
                }
            }
        }
        bottomContent()
    }

    renameTarget?.let { t ->
        RenameDialog(
            initial = (t.fileName ?: t.title).substringBeforeLast('.'),
            onConfirm = { viewModel.rename(t.id, it); renameTarget = null },
            onDismiss = { renameTarget = null },
        )
    }
    deleteTarget?.let { t ->
        ConfirmDialog(
            title = stringResource(R.string.delete_title),
            message = stringResource(R.string.delete_msg, t.fileName ?: t.title),
            confirm = stringResource(R.string.action_delete),
            onConfirm = { viewModel.delete(t.id) },
            onDismiss = { deleteTarget = null },
        )
    }
}

@Composable
private fun LibraryItem(
    item: DownloadItem,
    onPlay: () -> Unit,
    onShare: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
    onCopyLink: () -> Unit,
    onOpenSource: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var menu by remember { mutableStateOf(false) }
    Card(
        modifier.fillMaxWidth().clickable(onClick = onPlay),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box {
                Thumbnail(item.thumbnailUrl, item.isAudioOnly, Modifier.size(width = 112.dp, height = 68.dp))
                Icon(
                    Icons.Filled.PlayCircle, null, tint = Color.White.copy(alpha = 0.9f),
                    modifier = Modifier.align(Alignment.Center).size(30.dp),
                )
                if (item.durationSeconds > 0) {
                    Text(
                        Formatters.duration(item.durationSeconds.toLong()),
                        color = Color.White, style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.align(Alignment.BottomEnd).padding(4.dp),
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(item.fileName ?: item.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PlatformBadge(item.platform)
                    Text(
                        "${item.qualityLabel} • ${Formatters.bytes(item.fileSize)}",
                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(item.completedAt ?: item.createdAt)),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.more)) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    MenuItem(R.string.action_play, Icons.Filled.PlayCircle) { menu = false; onPlay() }
                    MenuItem(R.string.action_share, Icons.Filled.Share) { menu = false; onShare() }
                    MenuItem(R.string.action_rename, Icons.Filled.DriveFileRenameOutline) { menu = false; onRename() }
                    MenuItem(R.string.action_copy_link, Icons.Filled.ContentCopy) { menu = false; onCopyLink() }
                    MenuItem(R.string.action_open_source, Icons.AutoMirrored.Filled.OpenInNew) { menu = false; onOpenSource() }
                    MenuItem(R.string.action_delete, Icons.Filled.Delete) { menu = false; onDelete() }
                }
            }
        }
    }
}

@Composable
private fun MenuItem(label: Int, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    DropdownMenuItem(text = { Text(stringResource(label)) }, leadingIcon = { Icon(icon, null) }, onClick = onClick)
}

@Composable
fun bucketLabel(b: DateBucket): String = stringResource(
    when (b) {
        DateBucket.TODAY -> R.string.date_today
        DateBucket.YESTERDAY -> R.string.date_yesterday
        DateBucket.THIS_WEEK -> R.string.date_week
        DateBucket.THIS_MONTH -> R.string.date_month
        DateBucket.OLDER -> R.string.date_older
    }
)

@Composable
private fun sortLabel(s: LibrarySort): String = stringResource(
    when (s) {
        LibrarySort.NEWEST -> R.string.sort_newest
        LibrarySort.OLDEST -> R.string.sort_oldest
        LibrarySort.NAME -> R.string.sort_name
        LibrarySort.SIZE -> R.string.sort_size
    }
)
