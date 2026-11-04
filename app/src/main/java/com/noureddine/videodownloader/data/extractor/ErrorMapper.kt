package com.noureddine.videodownloader.data.extractor

import com.noureddine.videodownloader.domain.model.AppError
import java.io.IOException
import java.net.UnknownHostException

/** Translates engine stderr / exceptions into typed [AppError]s. */
object ErrorMapper {
    fun map(t: Throwable): AppError {
        if (t is AppError) return t
        if (t is UnknownHostException) return AppError.Network
        val msg = buildString {
            append(t.message.orEmpty())
            t.cause?.message?.let { append(' ').append(it) }
        }
        return fromMessage(msg) ?: if (t is IOException) AppError.Network else AppError.Unknown(shorten(msg))
    }

    fun fromMessage(raw: String?): AppError? {
        val m = raw?.lowercase() ?: return null
        return when {
            "unsupported url" in m || "no suitable extractor" in m -> AppError.UnsupportedUrl
            "drm" in m -> AppError.DrmProtected
            "login" in m || "log in" in m || "sign in" in m || "private" in m ||
                "cookies" in m || "authentication" in m || "rate-limit" in m -> AppError.LoginRequired
            "404" in m || "not found" in m || "unavailable" in m || "removed" in m ||
                "does not exist" in m -> AppError.NotFound
            "unable to download webpage" in m || "timed out" in m || "network is unreachable" in m ||
                "connection" in m || "getaddrinfo" in m || "name resolution" in m -> AppError.Network
            "no video formats" in m || "requested format is not available" in m -> AppError.NoFormats
            else -> null
        }
    }

    private fun shorten(msg: String): String =
        msg.lineSequence().map { it.trim() }.lastOrNull { it.startsWith("ERROR") }
            ?.removePrefix("ERROR:")?.trim()?.take(240)
            ?: msg.take(240)
}
