package com.stellasecret.asthmetrack;

import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Process;

/**
 * Déclenché par AlarmManager après une période d'inactivité (appli en arrière-plan).
 * Fonctionne même si le téléphone est en veille, contrairement à un Handler.
 * Les rappels (notifications) ne sont pas affectés : ils sont gérés par AlarmManager.
 */
public class IdleCloseReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (am != null) {
            for (ActivityManager.AppTask task : am.getAppTasks()) {
                task.finishAndRemoveTask();
            }
        }
        Process.killProcess(Process.myPid());
    }
}
