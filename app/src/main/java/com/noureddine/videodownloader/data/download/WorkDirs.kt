package com.noureddine.videodownloader.data.download

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/** Per-download scratch directories that survive process death (needed for resume). */
@Singleton
class WorkDirs @Inject constructor(@ApplicationContext private val context: Context) {
    fun forId(id: Long): File = File(context.noBackupFilesDir, "partial/$id").apply { mkdirs() }
    fun delete(id: Long) { File(context.noBackupFilesDir, "partial/$id").deleteRecursively() }
}
