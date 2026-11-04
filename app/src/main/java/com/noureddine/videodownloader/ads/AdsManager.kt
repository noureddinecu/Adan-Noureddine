package com.noureddine.videodownloader.ads

import android.app.Activity
import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import com.noureddine.videodownloader.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Google AdMob integration with Google's UMP consent flow (GDPR/EEA).
 * Ads are only requested after consent allows it, and never while the video player is visible.
 */
@Singleton
class AdsManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val policy = InterstitialPolicy()
    private val sessionStart = SystemClock.elapsedRealtime()
    private var lastShown: Long? = null
    private var eventCount = 0
    private var interstitial: InterstitialAd? = null
    private var loading = false
    private val initialized = AtomicBoolean(false)

    private val _canShowAds = MutableStateFlow(false)
    val canShowAds: StateFlow<Boolean> = _canShowAds.asStateFlow()

    /** Set by the player screen; suppresses every ad format while true. */
    private val _playerVisible = MutableStateFlow(false)
    val playerVisible: StateFlow<Boolean> = _playerVisible.asStateFlow()
    fun setPlayerVisible(visible: Boolean) { _playerVisible.value = visible }

    val enabled: Boolean get() = BuildConfig.ADS_ENABLED

    private lateinit var consentInfo: ConsentInformation

    fun gatherConsentAndInit(activity: Activity) {
        if (!enabled) return
        consentInfo = UserMessagingPlatform.getConsentInformation(activity)
        consentInfo.requestConsentInfoUpdate(
            activity,
            ConsentRequestParameters.Builder().build(),
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { error ->
                    if (error != null) Log.w(TAG, "Consent form: ${error.message}")
                    if (consentInfo.canRequestAds()) initAds()
                }
            },
            { error -> Log.w(TAG, "Consent update failed: ${error.message}") },
        )
        if (consentInfo.canRequestAds()) initAds()
    }

    val privacyOptionsRequired: Boolean
        get() = ::consentInfo.isInitialized &&
            consentInfo.privacyOptionsRequirementStatus ==
            ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED

    fun showPrivacyOptions(activity: Activity) {
        UserMessagingPlatform.showPrivacyOptionsForm(activity) { }
    }

    private fun initAds() {
        if (!initialized.compareAndSet(false, true)) return
        MobileAds.initialize(context) {
            _canShowAds.value = true
            preloadInterstitial()
        }
    }

    private fun preloadInterstitial() {
        if (!_canShowAds.value || loading || interstitial != null) return
        loading = true
        InterstitialAd.load(
            context, BuildConfig.ADMOB_INTERSTITIAL_ID, AdRequest.Builder().build(),
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) { interstitial = ad; loading = false }
                override fun onAdFailedToLoad(error: LoadAdError) { interstitial = null; loading = false }
            },
        )
    }

    /** Call after a natural break (download started). Shows an interstitial only when the policy allows. */
    fun onNaturalBreak(activity: Activity) {
        if (!enabled || !_canShowAds.value) return
        eventCount++
        val now = SystemClock.elapsedRealtime()
        val ad = interstitial
        if (ad == null) { preloadInterstitial(); return }
        if (!policy.shouldShow(now, sessionStart, lastShown, eventCount, _playerVisible.value)) return
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() { interstitial = null; preloadInterstitial() }
            override fun onAdFailedToShowFullScreenContent(e: com.google.android.gms.ads.AdError) {
                interstitial = null; preloadInterstitial()
            }
        }
        lastShown = now
        ad.show(activity)
    }

    private companion object { const val TAG = "AdsManager" }
}
