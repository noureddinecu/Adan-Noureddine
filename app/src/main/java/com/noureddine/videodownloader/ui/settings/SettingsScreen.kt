package com.noureddine.videodownloader.ui.settings

import android.app.Activity
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Brightness6
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.HighQuality
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.PrivacyTip
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.noureddine.videodownloader.BuildConfig
import com.noureddine.videodownloader.R
import com.noureddine.videodownloader.ads.AdsManager
import com.noureddine.videodownloader.domain.model.PreferredQuality
import com.noureddine.videodownloader.domain.model.StorageLocation
import com.noureddine.videodownloader.domain.model.ThemeMode
import com.noureddine.videodownloader.ui.components.SectionHeader

private data class Choice<T>(val value: T, val label: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(adsManager: AdsManager, viewModel: SettingsViewModel = hiltViewModel()) {
    val s by viewModel.settings.collectAsStateWithLifecycle()
    val version by viewModel.engineVersion.collectAsStateWithLifecycle()
    val engineState by viewModel.engineState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var dialog by remember { mutableStateOf<String?>(null) }

    val currentLang = AppCompatDelegate.getApplicationLocales().toLanguageTags().substringBefore('-').ifBlank { "system" }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text(stringResource(R.string.nav_settings)) })
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SectionHeader(stringResource(R.string.settings_appearance))
            Group {
                Item(Icons.Filled.Brightness6, stringResource(R.string.settings_theme), themeLabel(s.themeMode)) { dialog = "theme" }
                Item(Icons.Filled.Language, stringResource(R.string.settings_language), languageLabel(currentLang)) { dialog = "lang" }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    SwitchItem(Icons.Filled.Palette, stringResource(R.string.settings_dynamic), stringResource(R.string.settings_dynamic_desc), s.dynamicColor, viewModel::setDynamic)
                }
            }
            SectionHeader(stringResource(R.string.settings_downloads))
            Group {
                Item(Icons.Filled.Folder, stringResource(R.string.settings_storage), storageLabel(s.storageLocation)) { dialog = "storage" }
                Item(Icons.Filled.HighQuality, stringResource(R.string.settings_quality), qualityLabel(s.preferredQuality)) { dialog = "quality" }
                SwitchItem(Icons.Filled.Wifi, stringResource(R.string.settings_wifi), stringResource(R.string.settings_wifi_desc), s.wifiOnly, viewModel::setWifiOnly)
            }
            SectionHeader(stringResource(R.string.settings_engine))
            Group {
                Item(
                    Icons.Filled.Build, stringResource(R.string.settings_engine_update),
                    when (engineState) {
                        EngineState.Updating -> stringResource(R.string.engine_updating)
                        EngineState.Updated -> stringResource(R.string.engine_updated, version.orEmpty())
                        EngineState.UpToDate -> stringResource(R.string.engine_up_to_date, version.orEmpty())
                        EngineState.Failed -> stringResource(R.string.engine_update_failed)
                        EngineState.Idle -> stringResource(R.string.engine_version, version ?: "…")
                    },
                    trailing = { if (engineState == EngineState.Updating) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) },
                ) { if (engineState != EngineState.Updating) viewModel.updateEngine() }
            }
            SectionHeader(stringResource(R.string.settings_about))
            Group {
                if (adsManager.privacyOptionsRequired) {
                    Item(Icons.Filled.PrivacyTip, stringResource(R.string.settings_privacy), null) {
                        (context as? Activity)?.let(adsManager::showPrivacyOptions)
                    }
                }
                Item(Icons.Filled.Gavel, stringResource(R.string.settings_legal), null) { dialog = "legal" }
                Item(Icons.Filled.Info, stringResource(R.string.app_name), stringResource(R.string.version, BuildConfig.VERSION_NAME)) {}
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    when (dialog) {
        "theme" -> ChoiceDialog(
            stringResource(R.string.settings_theme), ThemeMode.entries.map { Choice(it, themeLabel(it)) }, s.themeMode,
            { viewModel.setTheme(it) }, { dialog = null },
        )
        "storage" -> ChoiceDialog(
            stringResource(R.string.settings_storage), StorageLocation.entries.map { Choice(it, storageLabel(it)) }, s.storageLocation,
            { viewModel.setStorage(it) }, { dialog = null },
        )
        "quality" -> ChoiceDialog(
            stringResource(R.string.settings_quality), PreferredQuality.entries.map { Choice(it, qualityLabel(it)) }, s.preferredQuality,
            { viewModel.setQuality(it) }, { dialog = null },
        )
        "lang" -> ChoiceDialog(
            stringResource(R.string.settings_language), listOf("system", "ar", "fr", "en").map { Choice(it, languageLabel(it)) }, currentLang,
            { tag ->
                AppCompatDelegate.setApplicationLocales(
                    if (tag == "system") LocaleListCompat.getEmptyLocaleList() else LocaleListCompat.forLanguageTags(tag)
                )
            },
            { dialog = null },
        )
        "legal" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text(stringResource(R.string.settings_legal)) },
            text = { Text(stringResource(R.string.legal_full)) },
            confirmButton = { TextButton(onClick = { dialog = null }) { Text(stringResource(R.string.action_ok)) } },
        )
    }
}

@Composable
private fun Group(content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) { Column { content() } }
}

@Composable
private fun Item(
    icon: ImageVector,
    title: String,
    subtitle: String?,
    trailing: @Composable () -> Unit = {},
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        trailing()
    }
}

@Composable
private fun SwitchItem(icon: ImageVector, title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Item(icon, title, subtitle, trailing = { Switch(checked = checked, onCheckedChange = onChange) }) { onChange(!checked) }
}

@Composable
private fun <T> ChoiceDialog(title: String, choices: List<Choice<T>>, selected: T, onSelect: (T) -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                choices.forEach { c ->
                    Row(
                        Modifier.fillMaxWidth()
                            .selectable(selected = c.value == selected, role = Role.RadioButton) { onSelect(c.value); onDismiss() }
                            .padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = c.value == selected, onClick = null)
                        Spacer(Modifier.width(12.dp))
                        Text(c.label)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}

@Composable
private fun themeLabel(m: ThemeMode) = stringResource(
    when (m) { ThemeMode.SYSTEM -> R.string.theme_system; ThemeMode.LIGHT -> R.string.theme_light; ThemeMode.DARK -> R.string.theme_dark }
)

@Composable
private fun storageLabel(l: StorageLocation) = stringResource(
    when (l) { StorageLocation.DOWNLOADS -> R.string.storage_downloads; StorageLocation.APP_FOLDER -> R.string.storage_app }
)

@Composable
private fun qualityLabel(q: PreferredQuality) = when (q) {
    PreferredQuality.BEST -> stringResource(R.string.quality_best)
    PreferredQuality.FHD -> "1080p"
    PreferredQuality.HD -> "720p"
    PreferredQuality.SD -> "480p"
    PreferredQuality.AUDIO -> stringResource(R.string.quality_audio)
}

@Composable
private fun languageLabel(tag: String) = when (tag) {
    "ar" -> "العربية"
    "fr" -> "Français"
    "en" -> "English"
    else -> stringResource(R.string.language_system)
}
