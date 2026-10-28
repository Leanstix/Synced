package com.synced.app.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.view.View

/** Original vector artwork. It remains crisp at every display density. */
class SyncedArtwork(context: Context, private val sharing: Boolean = false) : View(context) {
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val lime = Color.rgb(212, 255, 116)
    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
    override fun onDraw(c: Canvas) {
        super.onDraw(c)
        val s = width / 350f
        c.save(); c.scale(s, s)
        p.style = Paint.Style.STROKE; p.strokeWidth = 1f
        p.color = Color.rgb(47, 54, 49)
        c.drawOval(RectF(28f, 23f, 324f, 183f), p)
        c.drawOval(RectF(59f, -12f, 293f, 218f), p)
        p.color = Color.rgb(36, 42, 37)
