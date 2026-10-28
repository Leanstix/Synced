package com.synced.app.ui

import android.app.Activity
import android.app.AlertDialog
import android.app.TimePickerDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import com.synced.app.model.Role
import com.synced.app.model.UiActions
import com.synced.app.model.UiState
import java.util.Calendar

/** Native, state-driven interface. No device or session is presented as connected until it is. */
class SyncedUi(private val activity: Activity, private val actions: UiActions) {
    private val s = UiStyle(activity)
    private var state = UiState()
    private var structuralState: UiState? = null
    private var shareSelected = false
    private var invitationDraft = ""
    private var remoteView: RemoteScreenView? = null
    private val scroll = ScrollView(activity).apply {
        isFillViewport = true
        clipToPadding = false
        setBackgroundColor(s.background)
        isVerticalScrollBarEnabled = false
    }
    private val content = s.column().apply { setPadding(s.dp(24), s.dp(20), s.dp(24), s.dp(28)) }
    val root: View = FrameLayout(activity).apply {
        setBackgroundColor(s.background)
        addView(scroll, FrameLayout.LayoutParams(-1, -1))
        val centering = FrameLayout(activity)
        scroll.addView(centering, FrameLayout.LayoutParams(-1, -2))
        centering.addView(content, FrameLayout.LayoutParams(-1, -2, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply {
            val availableWidth = activity.resources.displayMetrics.widthPixels
            width = minOf(availableWidth, s.dp(600))
        })
    }
    init {
        activity.window.statusBarColor = s.background
