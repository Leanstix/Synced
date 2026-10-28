package com.synced.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View
import kotlin.math.max
import kotlin.math.min

/** Fits the remote frame without cropping; gestures map only to its visible content. */
class RemoteScreenView(context: Context, private val gesture: (Float, Float, Float, Float, Long) -> Unit) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val bounds = RectF()
    private var frame: Bitmap? = null
    private var startX = 0f
    private var startY = 0f
    private var started = 0L
    private var tracking = false
    var controlEnabled = false
    init {
        contentDescription = "Remote phone screen. Touch control is unavailable."
        isClickable = true
        isFocusable = true
    }
    fun show(bitmap: Bitmap?) {
        frame = bitmap
