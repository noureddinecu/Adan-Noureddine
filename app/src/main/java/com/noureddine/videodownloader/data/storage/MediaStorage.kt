package com.noureddine.videodownloader.data.storage

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import com.noureddine.videodownloader.core.util.FileNameSanitizer
import com.noureddine.videodownloader.domain.model.AppError
import com.noureddine.videodownloader.domain.model.StorageLocation
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

data class SavedFile(val uri: String, val displayName: String, val mimeType: String, val size: Long)

/**
 * Saves finished downloads either into the public Downloads collection
 * (Download/VideoDownloader, via MediaStore on Android 10+) or into the app's own folder
 * (Android/data/<pkg>/files/Movies/VideoDownloader).
 * Stored URIs are either `content://` (MediaStore) or `file://` (app folder / legacy).
 */
@Singleton
class MediaStorage @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val folderName = "VideoDownloader"

    suspend fun save(source: File, baseName: String, location: StorageLocation): SavedFile =
        withContext(Dispatchers.IO) {
            val ext = source.extension.ifBlank { "mp4" }.lowercase()
            val mime = mimeFor(ext)
            val name = "${FileNameSanitizer.sanitize(baseName)}.$ext"
            try {
                when {
                    location == StorageLocation.DOWNLOADS && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
                        saveToMediaStore(source, name, mime)
                    location == StorageLocation.DOWNLOADS && hasLegacyWritePermission() ->
                        saveToFile(source, legacyDownloadsDir(), name, mime)
                    else -> saveToFile(source, appFolder(), name, mime)
                }
            } catch (t: Throwable) {
                if (t is AppError) throw t
                throw AppError.Storage
            }
        }

    fun appFolder(): File =
        File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: context.filesDir, folderName)
            .apply { mkdirs() }

    @Suppress("DEPRECATION")
    private fun legacyDownloadsDir() =
        File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), folderName)
            .apply { mkdirs() }

    fun hasLegacyWritePermission(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED

    private fun saveToMediaStore(source: File, name: String, mime: String): SavedFile {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$folderName")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = resolver.insert(collection, values) ?: throw AppError.Storage
        try {
            resolver.openOutputStream(uri)?.use { out -> source.inputStream().use { it.copyTo(out, 1 shl 16) } }
                ?: throw AppError.Storage
            resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        } catch (t: Throwable) {
            resolver.delete(uri, null, null)
            throw t
        }
        // MediaStore may have de-duplicated the name ("clip (1).mp4"); read it back.
        val finalName = queryDisplayName(uri) ?: name
        return SavedFile(uri.toString(), finalName, mime, source.length())
    }

    private fun saveToFile(source: File, dir: File, name: String, mime: String): SavedFile {
        val target = uniqueFile(dir, name)
        if (!source.renameTo(target)) {
            source.copyTo(target, overwrite = false)
        }
        return SavedFile(Uri.fromFile(target).toString(), target.name, mime, target.length())
    }

    private fun uniqueFile(dir: File, name: String): File {
        var f = File(dir, name)
        val base = name.substringBeforeLast('.')
        val ext = name.substringAfterLast('.', "")
        var i = 1
        while (f.exists()) { f = File(dir, "$base ($i).$ext"); i++ }
        return f
    }

    private fun queryDisplayName(uri: Uri): String? =
        context.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)
            ?.use { c -> if (c.moveToFirst()) c.getString(0) else null }

    /** URI suitable for sharing / playback by other apps. */
    fun shareableUri(stored: String): Uri {
        val uri = stored.toUri()
        return if (uri.scheme == "file") {
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", File(uri.path!!))
        } else uri
    }

    fun exists(stored: String?): Boolean {
        if (stored.isNullOrBlank()) return false
        val uri = stored.toUri()
        return if (uri.scheme == "file") File(uri.path!!).exists()
        else runCatching {
            context.contentResolver.openFileDescriptor(uri, "r")?.use { true } ?: false
        }.getOrDefault(false)
    }

    suspend fun delete(stored: String): Boolean = withContext(Dispatchers.IO) {
        val uri = stored.toUri()
        runCatching {
            if (uri.scheme == "file") File(uri.path!!).let { !it.exists() || it.delete() }
            else context.contentResolver.delete(uri, null, null) > 0 || !exists(stored)
        }.getOrDefault(false)
    }

    /** @return the new (uri, displayName) or null on failure. */
    suspend fun rename(stored: String, newBaseName: String): Pair<String, String>? = withContext(Dispatchers.IO) {
        val uri = stored.toUri()
        val safe = FileNameSanitizer.sanitize(newBaseName)
        runCatching {
            if (uri.scheme == "file") {
                val f = File(uri.path!!)
                val target = uniqueFile(f.parentFile!!, "$safe.${f.extension}")
                if (f.renameTo(target)) Uri.fromFile(target).toString() to target.name else null
            } else {
                val oldName = queryDisplayName(uri) ?: return@runCatching null
                val newName = "$safe.${oldName.substringAfterLast('.', "mp4")}"
                val values = ContentValues().apply { put(MediaStore.MediaColumns.DISPLAY_NAME, newName) }
                if (context.contentResolver.update(uri, values, null, null) > 0) {
                    stored to (queryDisplayName(uri) ?: newName)
                } else null
            }
        }.getOrNull()
    }

    companion object {
        fun mimeFor(ext: String): String =
            MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
                ?: when (ext) {
                    "m4a" -> "audio/mp4"
                    "mp3" -> "audio/mpeg"
                    "webm" -> "video/webm"
                    "mkv" -> "video/x-matroska"
                    else -> "video/mp4"
                }
    }
}
