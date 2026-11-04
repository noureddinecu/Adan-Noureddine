package com.noureddine.videodownloader.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import com.noureddine.videodownloader.R
import com.noureddine.videodownloader.data.storage.MediaStorage

/** Small helpers for system share sheet / clipboard so screens stay declarative. */
object FileActions {
    fun shareFile(context: Context, storage: MediaStorage, fileUri: String, mime: String?) {
        runCatching {
            val uri = storage.shareableUri(fileUri)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mime ?: "video/*"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, context.getString(R.string.action_share)))
        }.onFailure { Toast.makeText(context, R.string.err_file_missing, Toast.LENGTH_SHORT).show() }
    }

    fun shareLink(context: Context, url: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
        }
        context.startActivity(Intent.createChooser(intent, context.getString(R.string.action_share_link)))
    }

    fun copyLink(context: Context, url: String) {
        val cm = context.getSystemService(ClipboardManager::class.java)
        cm.setPrimaryClip(ClipData.newPlainText("link", url))
        Toast.makeText(context, R.string.link_copied, Toast.LENGTH_SHORT).show()
    }

    fun openExternal(context: Context, url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    fun readClipboard(context: Context): String? {
        val cm = context.getSystemService(ClipboardManager::class.java)
        val clip = cm.primaryClip ?: return null
        if (clip.itemCount == 0) return null
        return clip.getItemAt(0).coerceToText(context)?.toString()
    }
}
