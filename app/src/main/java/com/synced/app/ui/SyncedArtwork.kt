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
        c.drawLine(9f, 104f, 342f, 104f, p)
        c.drawLine(175f, 3f, 175f, 201f, p)
        phone(c, 83f, 43f, 77f, 132f, -12f, false)
        phone(c, 184f, 23f, 86f, 148f, 10f, true)
        // A connection bridge deliberately reads as an illustration, never a live status.
        p.style = Paint.Style.FILL; p.color = lime
        c.drawRoundRect(RectF(151f, 83f, 197f, 125f), 15f, 15f, p)
        p.color = Color.rgb(23, 29, 22); p.style = Paint.Style.STROKE
        p.strokeWidth = 2.5f; p.strokeCap = Paint.Cap.ROUND; p.strokeJoin = Paint.Join.ROUND
        val path = Path().apply {
            moveTo(164f, 99f); lineTo(184f, 99f); lineTo(180f, 95f)
            moveTo(184f, 109f); lineTo(164f, 109f); lineTo(168f, 113f)
        }
        c.drawPath(path, p)
        p.style = Paint.Style.FILL; p.color = lime
        c.drawCircle(53f, 66f, 3f, p); c.drawCircle(302f, 145f, 3f, p)
        p.color = Color.rgb(108, 123, 102)
        c.drawCircle(283f, 35f, 2f, p); c.drawCircle(66f, 181f, 2f, p)
        c.restore()
    }
    private fun phone(c: Canvas, x: Float, y: Float, w: Float, h: Float, angle: Float, primary: Boolean) {
        c.save(); c.rotate(angle, x + w / 2, y + h / 2)
        p.style = Paint.Style.FILL; p.color = Color.rgb(8, 11, 9)
        c.drawRoundRect(RectF(x + 5, y + 8, x + w + 5, y + h + 8), 15f, 15f, p)
        p.shader = LinearGradient(x, y, x + w, y + h,
            if (primary) Color.rgb(71, 82, 64) else Color.rgb(43, 49, 45),
            Color.rgb(22, 28, 24), Shader.TileMode.CLAMP)
