package com.synced.app.capture;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import com.synced.app.MainActivity;
import com.synced.app.core.SessionEngine;
import java.io.ByteArrayOutputStream;

/** Explicit, foreground, full-display capture. Permission tokens are never reused. */
public final class ScreenCaptureService extends Service {
