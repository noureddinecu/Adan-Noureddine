package com.noureddine.videodownloader.data.download

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.workDataOf
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

interface DownloadScheduler {
    fun schedule(id: Long, wifiOnly: Boolean)
    fun cancel(id: Long)
}

@Singleton
class WorkManagerDownloadScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
) : DownloadScheduler {

    override fun schedule(id: Long, wifiOnly: Boolean) {
        val request = OneTimeWorkRequestBuilder<DownloadWorker>()
            .setInputData(workDataOf(DownloadWorker.KEY_ID to id))
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
                    .build()
            )
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .addTag(TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(name(id), ExistingWorkPolicy.REPLACE, request)
    }

    override fun cancel(id: Long) {
        WorkManager.getInstance(context).cancelUniqueWork(name(id))
    }

    companion object {
        const val TAG = "downloads"
        fun name(id: Long) = "download-$id"
    }
}
