package com.noureddine.videodownloader.data.settings

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.noureddine.videodownloader.domain.model.AppSettings
import com.noureddine.videodownloader.domain.model.PreferredQuality
import com.noureddine.videodownloader.domain.model.StorageLocation
import com.noureddine.videodownloader.domain.model.ThemeMode
import com.noureddine.videodownloader.domain.repository.SettingsRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

@Singleton
class SettingsRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
) : SettingsRepository {

    private object Keys {
        val theme = stringPreferencesKey("theme")
        val dynamic = booleanPreferencesKey("dynamic_color")
        val storage = stringPreferencesKey("storage")
        val quality = stringPreferencesKey("quality")
        val wifi = booleanPreferencesKey("wifi_only")
    }

    private inline fun <reified T : Enum<T>> parse(v: String?, default: T): T =
        v?.let { runCatching { enumValueOf<T>(it) }.getOrNull() } ?: default

    override val settings: Flow<AppSettings> = context.dataStore.data.map { p ->
        AppSettings(
            themeMode = parse(p[Keys.theme], ThemeMode.SYSTEM),
            dynamicColor = p[Keys.dynamic] ?: false,
            storageLocation = parse(p[Keys.storage], StorageLocation.DOWNLOADS),
            preferredQuality = parse(p[Keys.quality], PreferredQuality.BEST),
            wifiOnly = p[Keys.wifi] ?: false,
        )
    }

    override suspend fun setThemeMode(mode: ThemeMode) { context.dataStore.edit { it[Keys.theme] = mode.name } }
    override suspend fun setDynamicColor(enabled: Boolean) { context.dataStore.edit { it[Keys.dynamic] = enabled } }
    override suspend fun setStorageLocation(location: StorageLocation) { context.dataStore.edit { it[Keys.storage] = location.name } }
    override suspend fun setPreferredQuality(quality: PreferredQuality) { context.dataStore.edit { it[Keys.quality] = quality.name } }
    override suspend fun setWifiOnly(enabled: Boolean) { context.dataStore.edit { it[Keys.wifi] = enabled } }
}
