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
        activity.window.navigationBarColor = s.background
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            activity.window.setDecorFitsSystemWindows(false)
            activity.window.insetsController?.setSystemBarsAppearance(0,
                android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                    android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS)
            root.setOnApplyWindowInsetsListener { view, insets ->
                val safe = insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.ime())
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
                insets
            }
            root.requestApplyInsets()
        } else {
            @Suppress("DEPRECATION")
            activity.window.decorView.systemUiVisibility = activity.window.decorView.systemUiVisibility and
                (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR).inv()
        }
        render(state)
    }

    fun render(next: UiState) {
        state = next
        val structure = next.copy(remoteFrame = null)
        if (structure != structuralState) {
            structuralState = structure
            if (next.role == Role.HOST) shareSelected = true
            if (next.role == Role.CONTROLLER) shareSelected = false
            rebuild()
        }
        remoteView?.controlEnabled = next.controlAllowed
        remoteView?.show(next.remoteFrame)
    }

    private fun rebuild() {
        val previousScroll = scroll.scrollY
        content.removeAllViews(); remoteView = null
        header()
        addGap(28)
        roleTabs()
        addGap(28)
        if (state.role == Role.CONTROLLER && state.connected) controllerScreen()
        else if (state.role == Role.HOST) hostScreen()
        else welcomeScreen()
        state.error?.takeIf { it.isNotBlank() }?.let { error ->
            addGap(16)
            content.addView(s.card().apply {
                addView(s.text("Let's try that again", 16f, s.danger, true))
                addView(s.space(8)); addView(s.text(error, 13f, s.muted))
            }, full())
        }
        addGap(24)
        footer()
        scroll.post { scroll.scrollTo(0, previousScroll) }
    }

    private fun header() {
        val row = s.row()
        row.addView(SyncedMark(activity), LinearLayout.LayoutParams(s.dp(36), s.dp(36)))
        row.addView(s.text("Synced", 25f, s.ink, true).apply { letterSpacing = -.04f }, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = s.dp(10) })
        row.addView(s.button("Guide") { showGuide() }.apply {
            textSize = 12f; minHeight = s.dp(44); minimumHeight = s.dp(44)
            background = s.shape(s.surface, 22, s.border)
            contentDescription = "Connection guide and supported features"
        }, LinearLayout.LayoutParams(s.dp(78), s.dp(44)))
        content.addView(row, full())
    }

    private fun roleTabs() {
        val row = s.row().apply { background = s.shape(s.surface, 16); setPadding(s.dp(5), s.dp(5), s.dp(5), s.dp(5)) }
        listOf("Connect" to false, "Share" to true).forEach { (label, share) ->
            val selected = shareSelected == share
            row.addView(s.button(label) {
                if (state.role != Role.IDLE && shareSelected != share) {
                    AlertDialog.Builder(activity).setTitle("End this session?")
                        .setMessage("Switching phones ends the current connection and screen sharing.")
                        .setNegativeButton("Keep session", null)
                        .setPositiveButton("End and switch") { _, _ -> shareSelected = share; actions.disconnect() }.show()
                } else { shareSelected = share; rebuild() }
            }.apply {
                background = s.shape(if (selected) s.elevated else Color.TRANSPARENT, 12)
                setTextColor(if (selected) s.lime else s.muted)
                isSelected = selected
                contentDescription = "$label tab${if (selected) ", selected" else ""}"
                minHeight = s.dp(46); minimumHeight = s.dp(46)
            }, LinearLayout.LayoutParams(0, -2, 1f))
        }
        content.addView(row, full())
    }

    private fun welcomeScreen() {
        content.addView(s.label("YOUR PHONES. CONNECTED."))
        addGap(13)
        content.addView(s.text(if (shareSelected) "A little closer.\nFrom anywhere\non your Wi-Fi." else "Your other phone.\nRight here.", 34f, s.ink, true).apply {
            letterSpacing = -.045f; setLineSpacing(0f, 1.03f)
        })
        addGap(14)
        content.addView(s.text(if (shareSelected) "Share this phone's screen. You choose who connects and what they can do." else "See and control your other Android phone, with permission at every step.", 15f, s.muted))
        addGap(8)
        content.addView(SyncedArtwork(activity, shareSelected), LinearLayout.LayoutParams(-1, s.dp(202)))
        addGap(2)
        if (state.role == Role.CONTROLLER) {
            content.addView(statusCard("Connecting to your phone", state.status))
            addGap(16)
            content.addView(s.button("Cancel connection", destructive = true) { actions.disconnect() }, full())
        } else if (shareSelected) {
            content.addView(s.card().apply {
                addView(s.label("01  ·  INVITE YOUR OTHER PHONE")); addView(s.space(14))
                addView(s.text("Make the connection.", 22f, s.ink, true)); addView(s.space(9))
                addView(s.text("Create a private invitation, then paste it into Synced on your other Android phone.", 14f, s.muted)); addView(s.space(20))
                addView(s.button("Create invitation", primary = true) { actions.startHosting() }, full())
                addView(s.space(12)); addView(s.text("You'll approve the phone before it can connect.", 11f, s.muted))
            }, full())
        } else {
            content.addView(s.card().apply {
                addView(s.label("01  ·  CONNECT TO YOUR OTHER PHONE")); addView(s.space(14))
                addView(s.text("Have an invitation?", 22f, s.ink, true)); addView(s.space(9))
                addView(s.text("Open Share in Synced on your other phone, then paste its invitation here.", 14f, s.muted)); addView(s.space(18))
                val field = input("Paste your invitation", invitationDraft).apply {
                    contentDescription = "Invitation from the phone you want to connect to"
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or InputType.TYPE_TEXT_FLAG_MULTI_LINE
                    maxLines = 3
                    addTextChangedListener(object : TextWatcher {
                        override fun beforeTextChanged(value: CharSequence?, start: Int, count: Int, after: Int) = Unit
                        override fun onTextChanged(value: CharSequence?, start: Int, before: Int, count: Int) { invitationDraft = value?.toString().orEmpty() }
                        override fun afterTextChanged(value: Editable?) = Unit
                    })
                }
                addView(field, full()); addView(s.space(12))
                addView(s.button("Connect to phone", primary = true) {
                    if (invitationDraft.isBlank()) { field.error = "Paste the invitation from your other phone"; field.requestFocus() }
                    else {
                        (activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(field.windowToken, 0)
                        actions.connect(invitationDraft.trim())
