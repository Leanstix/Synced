package com.synced.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import com.synced.app.capture.ScreenCaptureService
import com.synced.app.model.Role
import com.synced.app.model.UiActions
import com.synced.app.ui.SyncedUi
import org.json.JSONObject
