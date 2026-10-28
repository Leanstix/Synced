package com.synced.app;

import android.app.Application;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.ReactNativeApplicationEntryPoint;
import com.facebook.react.defaults.DefaultReactHost;
import com.synced.app.core.SyncedPackage;
import java.util.Collections;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {
    private ReactHost host;
    @Override public synchronized ReactHost getReactHost() {
        if (host == null) {
            List<ReactPackage> packages = new PackageList(this).getPackages();
            packages.add(new SyncedPackage());
            host = DefaultReactHost.getDefaultReactHost(
                this, packages, "index", "index.android.bundle", null, null,
                BuildConfig.DEBUG, Collections.emptyList(),
                error -> { throw new RuntimeException(error); }, null);
        }
        return host;
    }
    @Override public void onCreate() {
        super.onCreate();
        ReactNativeApplicationEntryPoint.loadReactNative(this);
    }
}
