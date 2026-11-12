package com.stellasecret.asthmetrack;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
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

    private PendingIntent idlePendingIntent() {
        Intent i = new Intent(this, IdleCloseReceiver.class);
        return PendingIntent.getBroadcast(
            this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void cancelBackgroundAlarm() {
        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(idlePendingIntent());
    }

    private void scheduleBackgroundAlarm() {
        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        // Inexact + allowWhileIdle : aucune permission spéciale requise, fonctionne en Doze
        am.setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + IDLE_TIMEOUT_MS,
            idlePendingIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        cancelBackgroundAlarm();
        resetIdleTimer();
    }

    @Override
    public void onStop() {
        super.onStop();
        // L'appli quitte l'écran (autre appli, écran éteint...) : le système la fermera plus tard
        idleHandler.removeCallbacks(closeApp);
        scheduleBackgroundAlarm();
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
