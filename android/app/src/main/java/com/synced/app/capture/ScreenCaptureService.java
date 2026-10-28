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
    private final HandlerThread worker = new HandlerThread("Synced capture");
    private Handler handler;
    private SessionEngine engine;
    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;
    private int width, height, density, sessionId = -1;
    private long lastFrame;
    private volatile boolean stopping;
    private boolean screenReceiverRegistered;
    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) { engine.disconnect(sessionId, "Host screen turned off. Sharing and control stopped."); stopSelf(); }
        }
    };
    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        public void onDisplayAdded(int id) {}
        public void onDisplayRemoved(int id) {}
        public void onDisplayChanged(int id) { if (Build.VERSION.SDK_INT < 34) { DisplayMetrics full = metrics(); resize(full.widthPixels, full.heightPixels); } }
    };
    private final MediaProjection.Callback callback = new MediaProjection.Callback() {
        @Override public void onStop() { stopSelf(); }
        @Override public void onCapturedContentResize(int w, int h) {
            engine.setControlAllowed(false, sessionId);
            handler.postDelayed(() -> {
                if (stopping || sessionId != engine.generation()) return;
                DisplayMetrics full = metrics();
                if (w != full.widthPixels || h != full.heightPixels) { engine.report(sessionId, "Full-display sharing is required. Select the entire screen and start sharing again."); stopSelf(); }
                else resize(w, h);
            }, 180);
        }
    };
    @Override public void onCreate() { super.onCreate(); engine = SessionEngine.get(this); worker.start(); handler = new Handler(worker.getLooper()); }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) { engine.disconnect(sessionId, "Sharing stopped locally. Connection revoked."); stopSelf(); return START_NOT_STICKY; }
        if (projection != null) return START_NOT_STICKY;
        if (intent == null || !engine.isHostReady()) { stopSelf(); return START_NOT_STICKY; }
        sessionId = intent.getIntExtra("generation", -1);
        if (sessionId != engine.generation()) { stopSelf(); return START_NOT_STICKY; }
        try {
            notification();
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, new IntentFilter(Intent.ACTION_SCREEN_OFF), Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(screenReceiver, new IntentFilter(Intent.ACTION_SCREEN_OFF));
            screenReceiverRegistered = true;
            int result = intent.getIntExtra("resultCode", Activity.RESULT_CANCELED);
            Intent data = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra("data", Intent.class) : intent.getParcelableExtra("data");
            if (result != Activity.RESULT_OK || data == null) throw new IllegalArgumentException("No capture consent");
            projection = getSystemService(MediaProjectionManager.class).getMediaProjection(result, data);
            if (projection == null) throw new IllegalStateException("No projection");
            projection.registerCallback(callback, handler);
            handler.post(() -> {
                try {
                    if (stopping || sessionId != engine.generation()) return;
                    DisplayMetrics full = metrics(); density = full.densityDpi; int[] size = scaled(full.widthPixels, full.heightPixels); width = size[0]; height = size[1];
                    reader = makeReader(width, height);
                    display = projection.createVirtualDisplay("Synced screen", width, height, density, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, handler);
                    getSystemService(DisplayManager.class).registerDisplayListener(displayListener, handler); engine.captureChanged(true, sessionId);
                } catch (Exception e) { engine.report(sessionId, "Capture could not start. Grant a fresh sharing session."); stopSelf(); }
            });
        } catch (Exception e) { engine.report(sessionId, "Screen sharing permission was unavailable. Try sharing again."); stopSelf(); }
        return START_NOT_STICKY;
    }
    private void notification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("sharing", "Active screen sharing", NotificationManager.IMPORTANCE_LOW));
        int immutable = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class), immutable);
        PendingIntent stop = PendingIntent.getService(this, 2, new Intent(this, ScreenCaptureService.class).setAction("STOP"), immutable);
        Notification notice = new Notification.Builder(this, "sharing").setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle("Synced · your screen is being shared").setContentText("One approved phone can view this screen. Stop to revoke.")
