package com.noureddine.videodownloader.ui.navigation

import android.app.Activity
import androidx.annotation.StringRes
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.VideoLibrary
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.noureddine.videodownloader.R
import com.noureddine.videodownloader.ads.AdsManager
import com.noureddine.videodownloader.ads.BannerAd
import com.noureddine.videodownloader.core.SharedLinkBus
import com.noureddine.videodownloader.data.storage.MediaStorage
import com.noureddine.videodownloader.ui.history.HistoryScreen
import com.noureddine.videodownloader.ui.home.HomeScreen
import com.noureddine.videodownloader.ui.library.LibraryScreen
import com.noureddine.videodownloader.ui.player.PlayerScreen
import com.noureddine.videodownloader.ui.player.PlayerViewModel
import com.noureddine.videodownloader.ui.settings.SettingsScreen
import kotlinx.coroutines.launch

enum class TopLevel(val route: String, @StringRes val label: Int, val selected: ImageVector, val unselected: ImageVector) {
    HOME("home", R.string.nav_home, Icons.Filled.Download, Icons.Outlined.Download),
    LIBRARY("library", R.string.nav_library, Icons.Filled.VideoLibrary, Icons.Outlined.VideoLibrary),
    HISTORY("history", R.string.nav_history, Icons.Filled.History, Icons.Outlined.History),
    SETTINGS("settings", R.string.nav_settings, Icons.Filled.Settings, Icons.Outlined.Settings),
}

@Composable
fun AppNavHost(
    adsManager: AdsManager,
    storage: MediaStorage,
    linkBus: SharedLinkBus,
    onNaturalBreak: () -> Unit,
) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val showBar = TopLevel.entries.any { it.route == route }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val showMessage: (String) -> Unit = { msg -> scope.launch { snackbar.currentSnackbarData?.dismiss(); snackbar.showSnackbar(msg) } }
    val banner: @Composable () -> Unit = { BannerAd(adsManager) }

    // Status-bar icons: light over the gradient hero / player / dark theme, dark otherwise.
    val view = LocalView.current
    val darkBackground = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val lightIcons = darkBackground || route == TopLevel.HOME.route || route?.startsWith("player") == true
    SideEffect {
        (view.context as? Activity)?.window?.let { w ->
            WindowCompat.getInsetsController(w, view).isAppearanceLightStatusBars = !lightIcons
        }
    }

    fun goTo(dest: TopLevel) = nav.navigate(dest.route) {
        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            AnimatedVisibility(showBar, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                NavigationBar {
                    TopLevel.entries.forEach { dest ->
                        val selected = route == dest.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = { goTo(dest) },
                            icon = { Icon(if (selected) dest.selected else dest.unselected, null) },
                            label = { Text(stringResource(dest.label)) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = TopLevel.HOME.route,
            modifier = Modifier.padding(padding),
            enterTransition = { fadeIn(tween(220)) },
            exitTransition = { fadeOut(tween(160)) },
        ) {
            composable(TopLevel.HOME.route) {
                HomeScreen(onDownloadQueued = onNaturalBreak, onMessage = showMessage, bottomContent = banner)
            }
            composable(TopLevel.LIBRARY.route) {
                LibraryScreen(
                    storage = storage,
                    onPlay = { id -> nav.navigate("player/$id") },
                    onMessage = showMessage,
                    bottomContent = banner,
                )
            }
            composable(TopLevel.HISTORY.route) {
                HistoryScreen(onReDownload = { url -> linkBus.publish(url); goTo(TopLevel.HOME) })
            }
            composable(TopLevel.SETTINGS.route) { SettingsScreen(adsManager) }
            composable(
                "player/{id}",
                arguments = listOf(navArgument("id") { type = NavType.LongType }),
                enterTransition = { slideInVertically(tween(260)) { it / 6 } + fadeIn(tween(260)) },
                exitTransition = { fadeOut(tween(180)) },
            ) {
                val vm: PlayerViewModel = hiltViewModel()
                val item by vm.item.collectAsStateWithLifecycle()
                PlayerScreen(item = item, storage = storage, adsManager = adsManager, onBack = { nav.popBackStack() })
            }
        }
    }
}
