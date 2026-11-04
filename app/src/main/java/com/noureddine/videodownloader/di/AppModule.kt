package com.noureddine.videodownloader.di

import android.content.Context
import androidx.room.Room
import com.noureddine.videodownloader.BuildConfig
import com.noureddine.videodownloader.data.download.DownloadScheduler
import com.noureddine.videodownloader.data.download.WorkManagerDownloadScheduler
import com.noureddine.videodownloader.data.extractor.YtDlpEngine
import com.noureddine.videodownloader.data.local.AppDatabase
import com.noureddine.videodownloader.data.local.DownloadDao
import com.noureddine.videodownloader.data.repository.DownloadRepositoryImpl
import com.noureddine.videodownloader.data.repository.MediaRepositoryImpl
import com.noureddine.videodownloader.data.settings.SettingsRepositoryImpl
import com.noureddine.videodownloader.domain.platform.PlatformPolicy
import com.noureddine.videodownloader.domain.repository.DownloadRepository
import com.noureddine.videodownloader.domain.repository.EngineRepository
import com.noureddine.videodownloader.domain.repository.MediaRepository
import com.noureddine.videodownloader.domain.repository.SettingsRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides @Singleton
    fun database(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "video_downloader.db").build()

    @Provides
    fun downloadDao(db: AppDatabase): DownloadDao = db.downloadDao()

    @Provides @Singleton
    fun okHttp(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .addInterceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .header("User-Agent", "VideoDownloader/${BuildConfig.VERSION_NAME} (Android)")
                    .build()
            )
        }
        .build()

    @Provides @Singleton
    fun platformPolicy(): PlatformPolicy = PlatformPolicy(allowYouTube = BuildConfig.ALLOW_YOUTUBE_DOWNLOAD)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class BindingsModule {
    @Binds abstract fun media(impl: MediaRepositoryImpl): MediaRepository
    @Binds abstract fun downloads(impl: DownloadRepositoryImpl): DownloadRepository
    @Binds abstract fun settings(impl: SettingsRepositoryImpl): SettingsRepository
    @Binds abstract fun engine(impl: YtDlpEngine): EngineRepository
    @Binds abstract fun scheduler(impl: WorkManagerDownloadScheduler): DownloadScheduler
}
