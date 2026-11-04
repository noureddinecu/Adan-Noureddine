# --- yt-dlp engine (youtubedl-android): Jackson maps JSON onto these classes reflectively ---
-keep class com.yausername.** { *; }
-keep class com.fasterxml.jackson.** { *; }
-dontwarn com.fasterxml.jackson.databind.**
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
-dontwarn org.apache.commons.compress.**
-dontwarn java.beans.**
-dontwarn org.w3c.dom.bootstrap.**

# --- Room entities / enums persisted by name ---
-keep class com.noureddine.videodownloader.data.local.** { *; }
-keepclassmembers enum * { *; }

# --- OkHttp ---
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
