package com.noureddine.videodownloader.ui.home

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Policy
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.noureddine.videodownloader.R
import com.noureddine.videodownloader.core.util.Formatters
import com.noureddine.videodownloader.domain.model.MediaInfo
import com.noureddine.videodownloader.domain.model.Platform
import com.noureddine.videodownloader.domain.model.QualityOption
import com.noureddine.videodownloader.ui.components.DownloadProgressCard
import com.noureddine.videodownloader.ui.components.FileActions
import com.noureddine.videodownloader.ui.components.PlatformBadge
import com.noureddine.videodownloader.ui.components.SectionHeader
import com.noureddine.videodownloader.ui.components.Thumbnail
import com.noureddine.videodownloader.ui.components.errorText
import com.noureddine.videodownloader.ui.theme.BrandGradient

@Composable
fun HomeScreen(
    onDownloadQueued: () -> Unit,
    onMessage: (String) -> Unit,
    bottomContent: @Composable () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val active by viewModel.activeDownloads.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val focus = LocalFocusManager.current
    val queuedMsg = stringResource(R.string.download_started)
    val errorPrefix = stringResource(R.string.download_failed_to_start)

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { viewModel.download() } // proceed regardless; storage falls back to the app folder

    LaunchedEffect(Unit) {
        viewModel.events.collect { e ->
            when (e) {
                is HomeEvent.DownloadQueued -> { onMessage(queuedMsg); onDownloadQueued() }
                is HomeEvent.Failed -> onMessage(errorPrefix)
            }
        }
    }

    fun startDownload() {
        val needed = buildList {
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }.filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
        if (needed.isEmpty()) viewModel.download() else permissionLauncher.launch(needed.toTypedArray())
    }

    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item { Hero() }
            item {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    LinkInputCard(
                        url = state.url,
                        analyzing = state.analyzing,
                        onUrlChange = viewModel::onUrlChange,
                        onPaste = { FileActions.readClipboard(context)?.let { viewModel.onUrlChange(it.trim()) } },
                        onClear = viewModel::clear,
                        onAnalyze = { focus.clearFocus(); viewModel.analyze() },
                    )
                }
            }
            item {
                AnimatedVisibility(state.analyzing, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                    AnalyzingCard(Modifier.padding(horizontal = 16.dp))
                }
            }
            item {
                AnimatedVisibility(state.error != null, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                    state.error?.let { ErrorCard(errorText(it), viewModel::dismissError, Modifier.padding(horizontal = 16.dp)) }
                }
            }
            item {
                AnimatedVisibility(state.media != null, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                    state.media?.let { media ->
                        MediaCard(
                            media = media,
                            selectedId = state.selectedQualityId,
                            canDownload = state.canDownload,
                            enqueuing = state.enqueuing,
                            onSelect = viewModel::selectQuality,
                            onDownload = ::startDownload,
                            onCopy = { FileActions.copyLink(context, media.webpageUrl) },
                            onShare = { FileActions.shareLink(context, media.webpageUrl) },
                            onOpenOfficial = { FileActions.openExternal(context, media.webpageUrl) },
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )
                    }
                }
            }
            if (active.isNotEmpty()) {
                item { SectionHeader(stringResource(R.string.active_downloads), Modifier.padding(horizontal = 16.dp)) }
                items(active, key = { it.id }) { item ->
                    DownloadProgressCard(
                        item = item,
                        onPause = { viewModel.pause(item.id) },
                        onResume = { viewModel.resume(item.id) },
                        onCancel = { viewModel.cancel(item.id) },
                        modifier = Modifier.padding(horizontal = 16.dp).animateItem(),
                    )
                }
            } else if (state.media == null && !state.analyzing) {
                item { HowItWorks(Modifier.padding(horizontal = 16.dp)) }
            }
            item { Spacer(Modifier.height(8.dp)) }
        }
        bottomContent()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Hero() {
    Box(
        Modifier
            .fillMaxWidth()
            .background(BrandGradient, RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp))
            .statusBarsPadding()
            .padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 26.dp)
    ) {
        Column {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineMedium, color = Color.White)
            Spacer(Modifier.height(4.dp))
            Text(stringResource(R.string.home_subtitle), style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
            Spacer(Modifier.height(14.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(Platform.FACEBOOK, Platform.TIKTOK, Platform.INSTAGRAM, Platform.X, Platform.VIMEO).forEach {
                    Surface(shape = RoundedCornerShape(50), color = Color.White.copy(alpha = 0.18f)) {
                        Text(
                            it.displayName, color = Color.White, style = MaterialTheme.typography.labelMedium,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LinkInputCard(
    url: String,
    analyzing: Boolean,
    onUrlChange: (String) -> Unit,
    onPaste: () -> Unit,
    onClear: () -> Unit,
    onAnalyze: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            OutlinedTextField(
                value = url,
                onValueChange = onUrlChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(stringResource(R.string.paste_link_hint)) },
                leadingIcon = { Icon(Icons.Filled.Link, null) },
                trailingIcon = {
                    if (url.isNotEmpty()) IconButton(onClick = onClear) { Icon(Icons.Filled.Clear, stringResource(R.string.action_clear)) }
                },
                singleLine = true,
                shape = MaterialTheme.shapes.medium,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { onAnalyze() }),
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FilledTonalButton(onClick = onPaste, modifier = Modifier.weight(1f).height(50.dp)) {
                    Icon(Icons.Filled.ContentPaste, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.action_paste))
                }
                Button(onClick = onAnalyze, enabled = !analyzing, modifier = Modifier.weight(1.4f).height(50.dp)) {
                    if (analyzing) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    else Icon(Icons.Filled.Search, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.action_analyze))
                }
            }
        }
    }
}

@Composable
private fun AnalyzingCard(modifier: Modifier = Modifier) {
    Card(modifier.fillMaxWidth()) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(26.dp), strokeWidth = 3.dp)
            Spacer(Modifier.width(14.dp))
            Column {
                Text(stringResource(R.string.analyzing), style = MaterialTheme.typography.titleSmall)
                Text(stringResource(R.string.analyzing_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ErrorCard(message: String, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Row(Modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.ErrorOutline, null, tint = MaterialTheme.colorScheme.onErrorContainer)
            Spacer(Modifier.width(12.dp))
            Text(message, Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_ok)) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MediaCard(
    media: MediaInfo,
    selectedId: String?,
    canDownload: Boolean,
    enqueuing: Boolean,
    onSelect: (String) -> Unit,
    onDownload: () -> Unit,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onOpenOfficial: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    ) {
        Box {
            Thumbnail(
                media.thumbnailUrl, audio = false,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f), corner = 0.dp,
            )
            if (media.durationSeconds > 0) {
                Surface(
                    color = Color.Black.copy(alpha = 0.7f), shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.align(Alignment.BottomEnd).padding(10.dp),
                ) {
                    Text(
                        Formatters.duration(media.durationSeconds.toLong()), color = Color.White,
                        style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }
        }
        Column(Modifier.padding(16.dp)) {
            PlatformBadge(media.platform)
            Spacer(Modifier.height(8.dp))
            Text(media.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            media.uploader?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(14.dp))

            if (!media.downloadAllowed) {
                PolicyNotice(onOpenOfficial)
            } else {
                Text(stringResource(R.string.choose_quality), style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    media.qualities.forEach { q ->
                        FilterChip(
                            selected = q.id == selectedId,
                            onClick = { onSelect(q.id) },
                            label = { Text(qualityLabel(q)) },
                        )
                    }
                }
                Spacer(Modifier.height(14.dp))
                Button(
                    onClick = onDownload, enabled = canDownload,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                ) {
                    if (enqueuing) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    else Icon(Icons.Filled.Download, null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.action_download), fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                TextButton(onClick = onCopy) {
                    Icon(Icons.Filled.ContentCopy, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.action_copy_link))
                }
                TextButton(onClick = onShare) {
                    Icon(Icons.Filled.Share, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.action_share_link))
                }
            }
        }
    }
}

@Composable
private fun qualityLabel(q: QualityOption): String {
    val name = when {
        q.isAudioOnly -> stringResource(R.string.quality_audio)
        q.label == "Best" -> stringResource(R.string.quality_best)
        q.label == "Original" -> stringResource(R.string.quality_original)
        else -> q.label
    }
    return q.estimatedSize?.let { "$name • ${Formatters.bytes(it)}" } ?: name
}

@Composable
private fun PolicyNotice(onOpenOfficial: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.medium) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Policy, null, tint = MaterialTheme.colorScheme.onSecondaryContainer)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.policy_title), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSecondaryContainer)
            }
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.policy_youtube), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSecondaryContainer)
            Spacer(Modifier.height(8.dp))
            FilledTonalButton(onClick = onOpenOfficial) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, null, Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.action_open_official))
            }
        }
    }
}

@Composable
private fun HowItWorks(modifier: Modifier = Modifier) {
    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(stringResource(R.string.how_title), style = MaterialTheme.typography.titleSmall)
            listOf(R.string.how_step1, R.string.how_step2, R.string.how_step3).forEachIndexed { i, res ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp)) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("${i + 1}", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelMedium)
                        }
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(stringResource(res), style = MaterialTheme.typography.bodyMedium)
                }
            }
            Text(stringResource(R.string.legal_short), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
