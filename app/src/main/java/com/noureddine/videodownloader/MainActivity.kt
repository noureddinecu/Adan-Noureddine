package com.noureddine.videodownloader

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.noureddine.videodownloader.ads.AdsManager
import com.noureddine.videodownloader.core.SharedLinkBus
import com.noureddine.videodownloader.core.util.UrlUtils
import com.noureddine.videodownloader.data.storage.MediaStorage
import com.noureddine.videodownloader.domain.model.AppSettings
import com.noureddine.videodownloader.domain.repository.SettingsRepository
import com.noureddine.videodownloader.ui.navigation.AppNavHost
import com.noureddine.videodownloader.ui.theme.VideoDownloaderTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    @Inject lateinit var adsManager: AdsManager
    @Inject lateinit var storage: MediaStorage
    @Inject lateinit var settingsRepository: SettingsRepository
    @Inject lateinit var linkBus: SharedLinkBus

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handleIntent(intent)
        adsManager.gatherConsentAndInit(this)

        setContent {
            val settings by settingsRepository.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
            VideoDownloaderTheme(themeMode = settings.themeMode, dynamicColor = settings.dynamicColor) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    AppNavHost(
                        adsManager = adsManager,
                        storage = storage,
                        linkBus = linkBus,
                        onNaturalBreak = { adsManager.onNaturalBreak(this@MainActivity) },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** Accepts links shared from other apps (Share → Video Downloader) or opened via VIEW. */
    private fun handleIntent(intent: Intent?) {
        val text = when (intent?.action) {
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)
            Intent.ACTION_VIEW -> intent.dataString
            else -> null
        }
        UrlUtils.extractFirstUrl(text)?.let(linkBus::publish)
    }
}
