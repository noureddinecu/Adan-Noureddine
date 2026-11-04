package com.noureddine.videodownloader.ui.player

import android.app.Activity
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.noureddine.videodownloader.R
import com.noureddine.videodownloader.ads.AdsManager
import com.noureddine.videodownloader.data.storage.MediaStorage
import com.noureddine.videodownloader.domain.model.DownloadItem
import com.noureddine.videodownloader.ui.components.FileActions

/** Built-in Media3 player. Ads are fully suppressed while this screen is visible. */
@Composable
fun PlayerScreen(
    item: DownloadItem?,
    storage: MediaStorage,
    adsManager: AdsManager,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var error by remember { mutableStateOf(false) }

    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            addListener(object : Player.Listener {
                override fun onPlayerError(e: PlaybackException) { error = true }
            })
        }
    }

    DisposableEffect(item?.fileUri) {
        val uri = item?.fileUri
        if (uri != null && storage.exists(uri)) {
            player.setMediaItem(MediaItem.fromUri(storage.shareableUri(uri)))
            player.prepare()
            player.playWhenReady = true
        } else if (item != null) error = true
        onDispose { }
    }

    DisposableEffect(Unit) {
        adsManager.setPlayerVisible(true)
        val window = (context as? Activity)?.window
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE) player.pause()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            adsManager.setPlayerVisible(false)
            player.release()
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { ctx -> PlayerView(ctx).apply { this.player = player; setShowNextButton(false); setShowPreviousButton(false) } },
            modifier = Modifier.fillMaxSize(),
        )
        Row(
            Modifier.fillMaxWidth().safeDrawingPadding().padding(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back), tint = Color.White) }
            Text(
                item?.fileName ?: item?.title.orEmpty(), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f),
            )
            item?.fileUri?.let { uri ->
                IconButton(onClick = { FileActions.shareFile(context, storage, uri, item.mimeType) }) {
                    Icon(Icons.Filled.Share, stringResource(R.string.action_share), tint = Color.White)
                }
            }
        }
        if (error) {
            Column(Modifier.align(Alignment.Center).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Filled.ErrorOutline, null, tint = Color.White)
                Text(stringResource(R.string.err_file_missing), color = Color.White)
            }
        }
    }
}
