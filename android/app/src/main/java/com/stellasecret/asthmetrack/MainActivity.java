package com.stellasecret.asthmetrack;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.view.KeyEvent;
import android.view.MotionEvent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    // Durée d'inactivité (aucune interaction) avant fermeture automatique de l'appli.
    // Les rappels restent actifs : ils sont gérés par le système (AlarmManager).
    private static final long IDLE_TIMEOUT_MS = 5 * 60 * 1000L;

    private final Handler idleHandler = new Handler(Looper.getMainLooper());
    private final Runnable closeApp = () -> {
        finishAndRemoveTask();
        // Tue aussi le processus pour libérer la WebView
        idleHandler.postDelayed(() -> Process.killProcess(Process.myPid()), 300);
    };

    private void resetIdleTimer() {
        idleHandler.removeCallbacks(closeApp);
        idleHandler.postDelayed(closeApp, IDLE_TIMEOUT_MS);
    }

    @Override
    public void onResume() {
        super.onResume();
        resetIdleTimer();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        resetIdleTimer();
        return super.dispatchTouchEvent(ev);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent ev) {
        resetIdleTimer();
        return super.dispatchKeyEvent(ev);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SocialLoginPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // Méthode requise par l'interface ModifiedMainActivityForSocialLoginPlugin
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Intentionnellement vide — sert juste de marqueur de conformité
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) return;
            SocialLoginPlugin plugin = (SocialLoginPlugin) pluginHandle.getInstance();
            if (plugin == null) return;
            plugin.handleGoogleLoginIntent(requestCode, data);
        }
    }
}
