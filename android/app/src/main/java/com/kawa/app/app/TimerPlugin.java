package com.kawa.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TimerPlugin")
public class TimerPlugin extends Plugin {

    public static final String WAKE_UP_CHANNEL_ID = "kawa_wake_up_alarm_v2";

    @PluginMethod
    public void ensureWakeUpAlarmChannel(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }

        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager == null) {
            call.reject("Notification manager is unavailable.");
            return;
        }

        if (manager.getNotificationChannel(WAKE_UP_CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                WAKE_UP_CHANNEL_ID,
                "Kawa Wake-Up Alarm",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Daily Kawa wake-up alarm");
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 750});

            Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmSound == null) {
                alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            if (alarmSound != null) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build();
                channel.setSound(alarmSound, audioAttributes);
            }

            manager.createNotificationChannel(channel);
        }

        call.resolve();
    }

    @PluginMethod
    public void startTimer(PluginCall call) {
        String label = call.getString("label", "Timer");
        int secs = call.getInt("secs", 0);

        Intent intent = new Intent(getContext(), TimerService.class);
        intent.setAction(TimerService.ACTION_START);
        intent.putExtra(TimerService.EXTRA_LABEL, label);
        intent.putExtra(TimerService.EXTRA_SECS, secs);
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    @PluginMethod
    public void resumeTimer(PluginCall call) {
        Intent intent = new Intent(getContext(), TimerService.class);
        intent.setAction(TimerService.ACTION_RESUME);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void pauseTimer(PluginCall call) {
        Intent intent = new Intent(getContext(), TimerService.class);
        intent.setAction(TimerService.ACTION_PAUSE);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stopTimer(PluginCall call) {
        Intent intent = new Intent(getContext(), TimerService.class);
        intent.setAction(TimerService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }
}
