package com.noureddine.videodownloader.data.download

import com.noureddine.videodownloader.data.extractor.ErrorMapper
import com.noureddine.videodownloader.data.extractor.YtDlpEngine
import com.noureddine.videodownloader.data.local.DownloadEntity
import com.noureddine.videodownloader.domain.model.AppError
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject
import javax.inject.Singleton

data class TransferProgress(val fraction: Float, val downloaded: Long, val total: Long, val etaSeconds: Long)

interface Downloader {
    /**
     * Downloads into [workDir] and returns the finished file. Partial data stays in [workDir]
     * when cancelled so a later call can resume. [onProgress] may be invoked from any thread.
     */
    suspend fun download(item: DownloadEntity, workDir: File, onProgress: (TransferProgress) -> Unit): File
}

@Singleton
class YtDlpDownloader @Inject constructor(private val engine: YtDlpEngine) : Downloader {

    override suspend fun download(
        item: DownloadEntity,
        workDir: File,
        onProgress: (TransferProgress) -> Unit,
    ): File {
        engine.ensureReady()
        val processId = processId(item.id)
        val request = YoutubeDLRequest(item.webpageUrl.ifBlank { item.sourceUrl }).apply {
            addOption("--no-playlist")
            addOption("--continue")
            addOption("--no-mtime")
            addOption("--socket-timeout", 20)
            addOption("--retries", 5)
            addOption("--concurrent-fragments", 3)
            addOption("-f", item.formatSelector.ifBlank { "bv*+ba/b" })
            if (!item.isAudioOnly) addOption("--merge-output-format", "mp4")
            addOption("-o", File(workDir, "media.%(ext)s").absolutePath)
        }
        try {
            val response = runInterruptible(Dispatchers.IO) {
                YoutubeDL.getInstance().execute(request, processId) { progress, eta, line ->
                    val total = ProgressParser.totalBytes(line)
                    val fraction = (progress / 100f).coerceIn(0f, 1f)
                    onProgress(TransferProgress(fraction, (total * fraction).toLong(), total, eta))
                }
            }
            if (response.exitCode != 0) {
                throw ErrorMapper.fromMessage(response.err) ?: AppError.Unknown(response.err.takeLast(240))
            }
        } catch (e: CancellationException) {
            YoutubeDL.getInstance().destroyProcessById(processId)
            throw e
        } catch (e: YoutubeDL.CanceledException) {
            throw CancellationException("Canceled")
        } catch (t: Throwable) {
            YoutubeDL.getInstance().destroyProcessById(processId)
            throw ErrorMapper.map(t)
        }
        return findOutput(workDir) ?: throw AppError.Unknown("Output file not found")
    }

    private fun findOutput(dir: File): File? = dir.listFiles()
        ?.filter { it.isFile && it.name.startsWith("media.") && !it.name.endsWith(".part") &&
            !it.name.endsWith(".ytdl") && !it.name.contains(".part-Frag") && !it.name.endsWith(".temp") &&
            !Regex("""\.f\d+\.""").containsMatchIn(it.name) }
        ?.maxByOrNull { it.length() }

    companion object {
        fun processId(id: Long) = "download-$id"
    }
}

/** Resumable plain-HTTP downloader using Range requests. */
@Singleton
class HttpDownloader @Inject constructor(private val client: OkHttpClient) : Downloader {

    override suspend fun download(
        item: DownloadEntity,
        workDir: File,
        onProgress: (TransferProgress) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        val url = item.directUrl ?: item.sourceUrl
        val ext = item.extension.ifBlank { "mp4" }
        val part = File(workDir, "media.$ext.part")
        val done = File(workDir, "media.$ext")
        if (done.exists()) return@withContext done

        val existing = if (part.exists()) part.length() else 0L
        val request = Request.Builder().url(url).apply {
            if (existing > 0) header("Range", "bytes=$existing-")
        }.build()

        try {
            client.newCall(request).execute().use { resp ->
                if (resp.code == 416) { part.renameTo(done); return@withContext done }
                if (resp.code == 404 || resp.code == 410) throw AppError.NotFound
                if (resp.code == 401 || resp.code == 403) throw AppError.LoginRequired
                if (!resp.isSuccessful) throw AppError.Unknown("HTTP ${resp.code}")
                val append = resp.code == 206 && existing > 0
                val body = resp.body ?: throw AppError.Network
                val start = if (append) existing else 0L
                val total = body.contentLength().let { if (it > 0) it + start else -1L }
                var downloaded = start
                var lastTick = 0L
                val started = System.currentTimeMillis()
                FileOutputStream(part, append).use { out ->
                    body.byteStream().use { input ->
                        val buf = ByteArray(1 shl 16)
                        while (true) {
                            coroutineContext.ensureActive()
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            downloaded += n
                            val now = System.currentTimeMillis()
                            if (now - lastTick > 300) {
                                lastTick = now
                                val speed = (downloaded - start) * 1000.0 / (now - started).coerceAtLeast(1)
                                val eta = if (total > 0 && speed > 0) ((total - downloaded) / speed).toLong() else 0L
                                val fraction = if (total > 0) downloaded.toFloat() / total else -1f
                                onProgress(TransferProgress(fraction, downloaded, total, eta))
                            }
                        }
                    }
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (t: Throwable) {
            throw ErrorMapper.map(t)
        }
        if (!part.renameTo(done)) throw AppError.Storage
        done
    }
}
