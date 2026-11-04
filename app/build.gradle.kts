import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun prop(name: String): String = (project.findProperty(name) as String?) ?: System.getenv(name) ?: ""

android {
    namespace = "com.noureddine.videodownloader"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.noureddine.videodownloader"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }

        manifestPlaceholders["admobAppId"] = prop("ADMOB_APP_ID")
        buildConfigField("String", "ADMOB_BANNER_ID", "\"${prop("ADMOB_BANNER_ID")}\"")
        buildConfigField("String", "ADMOB_INTERSTITIAL_ID", "\"${prop("ADMOB_INTERSTITIAL_ID")}\"")
        buildConfigField("boolean", "ADS_ENABLED", prop("ADS_ENABLED").ifBlank { "true" })
        // Google Play policy & YouTube ToS forbid third-party downloading of YouTube content.
        // Keep this false for any Play Store build.
        buildConfigField("boolean", "ALLOW_YOUTUBE_DOWNLOAD", "false")
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    // The yt-dlp engine ships native Python/FFmpeg binaries per ABI.
    // Per-ABI APKs keep sideload builds small; the Play AAB splits automatically.
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64", "x86")
            isUniversalApk = false
        }
    }

    packaging {
        // Required by youtubedl-android: native executables must be extracted on install.
        jniLibs.useLegacyPackaging = true
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/DEPENDENCIES")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions { unitTests.isReturnDefaultValues = true }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.splashscreen)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)

    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    implementation(libs.work.runtime)
    implementation(libs.datastore.preferences)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.ui)
    implementation(libs.coil.compose)
    implementation(libs.okhttp)
    implementation(libs.coroutines.android)

    implementation(libs.play.services.ads)
    implementation(libs.ump)

    implementation(libs.youtubedl.library)
    implementation(libs.youtubedl.ffmpeg)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.turbine)
}
