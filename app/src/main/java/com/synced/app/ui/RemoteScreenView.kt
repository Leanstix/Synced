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
        contentDescription = if (controlEnabled) "Remote phone screen. Tap or swipe to control the other phone." else "Remote phone screen. View only."
        invalidate()
    }
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val maxHeight = (440 * resources.displayMetrics.density).toInt()
        setMeasuredDimension(w, min(maxHeight, (w * 1.5f).toInt()))
    }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val radius = 16 * resources.displayMetrics.density
        canvas.save()
        canvas.clipPath(Path().apply { addRoundRect(RectF(0f, 0f, width.toFloat(), height.toFloat()), radius, radius, Path.Direction.CW) })
        canvas.drawColor(Color.rgb(5, 8, 6))
        val image = frame
        if (image != null && !image.isRecycled) {
            val scale = min(width.toFloat() / image.width, height.toFloat() / image.height)
            val w = image.width * scale; val h = image.height * scale
            bounds.set((width - w) / 2, (height - h) / 2, (width + w) / 2, (height + h) / 2)
            canvas.drawBitmap(image, null, bounds, paint)
        } else {
            bounds.setEmpty()
            paint.color = Color.rgb(165, 177, 161)
            paint.textSize = 14 * resources.displayMetrics.scaledDensity
            paint.textAlign = Paint.Align.CENTER
            canvas.drawText("Waiting for the other phone's screen", width / 2f, height / 2f, paint)
        }
        canvas.restore()
    }
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!controlEnabled || frame == null || bounds.isEmpty) return false
        when (event.actionMasked) {
