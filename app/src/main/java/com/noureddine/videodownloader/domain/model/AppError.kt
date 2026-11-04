package com.noureddine.videodownloader.domain.model

/** Typed, user-presentable failures. UI maps each to a localized string. */
sealed class AppError(message: String? = null) : Exception(message) {
    data object InvalidUrl : AppError()
    data object UnsupportedUrl : AppError()
    data object PolicyBlocked : AppError()
    data object LoginRequired : AppError()
    data object NotFound : AppError()
    data object DrmProtected : AppError()
    data object Network : AppError()
    data object NoFormats : AppError()
    data object Storage : AppError()
    data object EngineNotReady : AppError()
    class Unknown(val detail: String?) : AppError(detail)
}
