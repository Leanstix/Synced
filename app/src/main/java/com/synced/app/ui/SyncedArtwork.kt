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
        c.drawRoundRect(RectF(x, y, x + w, y + h), 14f, 14f, p); p.shader = null
        p.style = Paint.Style.STROKE; p.strokeWidth = 1.5f
        p.color = if (primary) Color.rgb(139, 161, 119) else Color.rgb(93, 105, 94)
        c.drawRoundRect(RectF(x, y, x + w, y + h), 14f, 14f, p)
        p.style = Paint.Style.FILL; p.color = Color.rgb(14, 20, 16)
        c.drawRoundRect(RectF(x + 5, y + 6, x + w - 5, y + h - 6), 10f, 10f, p)
        p.color = Color.rgb(80, 94, 76)
        c.drawRoundRect(RectF(x + w / 2 - 11, y + 10, x + w / 2 + 11, y + 14), 3f, 3f, p)
        p.color = if (primary) lime else Color.rgb(91, 113, 84)
        c.drawRoundRect(RectF(x + 15, y + 33, x + w - 15, y + 39), 3f, 3f, p)
        p.color = Color.rgb(47, 60, 43)
        c.drawRoundRect(RectF(x + 15, y + 46, x + w - 27, y + 50), 2f, 2f, p)
        for (i in 0..2) {
            p.color = if (primary && i == 0) Color.rgb(80, 100, 55) else Color.rgb(35, 46, 32)
            c.drawRoundRect(RectF(x + 14, y + 64 + i * 18, x + w - 14, y + 77 + i * 18), 4f, 4f, p)
        }
        p.color = Color.rgb(88, 104, 80)
        c.drawRoundRect(RectF(x + w / 2 - 13, y + h - 13, x + w / 2 + 13, y + h - 10), 2f, 2f, p)
        c.restore()
    }
}

class SyncedMark(context: Context) : View(context) {
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
    override fun onDraw(c: Canvas) {
        val s = width / 40f
        c.save(); c.scale(s, s)
        p.color = Color.rgb(212, 255, 116); p.style = Paint.Style.FILL
        c.drawRoundRect(RectF(0f, 0f, 40f, 40f), 13f, 13f, p)
        p.color = Color.rgb(16, 24, 13); p.style = Paint.Style.STROKE
        p.strokeWidth = 4f; p.strokeCap = Paint.Cap.ROUND; p.strokeJoin = Paint.Join.ROUND
        c.drawPath(Path().apply {
            moveTo(26f, 11f); lineTo(18f, 11f); cubicTo(8f, 11f, 9f, 21f, 18f, 21f)
            lineTo(22f, 21f); moveTo(14f, 29f); lineTo(22f, 29f)
            cubicTo(32f, 29f, 31f, 19f, 22f, 19f); lineTo(18f, 19f)
        }, p)
        c.restore()
    }
}
