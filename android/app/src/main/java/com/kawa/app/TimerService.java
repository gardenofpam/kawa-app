package com.kawa.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;

public class TimerService extends Service {
    public static final String CHANNEL_ID = "kawa_timer_channel";
    public static final String COMPLETE_CHANNEL_ID = "kawa_timer_complete_channel_v2";
    public static final String ACTION_START = "ACTION_START";
    public static final String ACTION_PAUSE = "ACTION_PAUSE";
    public static final String ACTION_RESUME = "ACTION_RESUME";
    public static final String ACTION_STOP = "ACTION_STOP";
    public static final String EXTRA_LABEL = "EXTRA_LABEL";
    public static final String EXTRA_SECS = "EXTRA_SECS";
    public static final int NOTIF_ID = 1001;
    public static final int COMPLETE_NOTIF_ID = 1002;

    private Handler handler;
    private Runnable ticker;
    private int remainingSecs = 0;
    private int totalSecs = 0;
    private String label = "Timer";
    private boolean running = false;

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        createChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            label = intent.getStringExtra(EXTRA_LABEL);
            if (label == null || label.trim().isEmpty()) label = "Timer";
            remainingSecs = Math.max(0, intent.getIntExtra(EXTRA_SECS, 0));
            totalSecs = remainingSecs;
            clearCompletionNotification();
            stopTicking();

            if (remainingSecs <= 0) {
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            }

            running = true;
            startForeground(NOTIF_ID, buildNotification());
            startTicking();
            return START_STICKY;
        }

        if (ACTION_PAUSE.equals(action)) {
            running = false;
            stopTicking();
            updateNotification();
            return START_STICKY;
        }

        if (ACTION_RESUME.equals(action)) {
            if (remainingSecs <= 0) return START_NOT_STICKY;
            running = true;
            startForeground(NOTIF_ID, buildNotification());
            startTicking();
            updateNotification();
            return START_STICKY;
        }

        if (ACTION_STOP.equals(action)) {
            running = false;
            stopTicking();
            stopForeground(true);
            stopSelf();
        }

        return START_NOT_STICKY;
    }

    private void startTicking() {
        stopTicking();
        ticker = new Runnable() {
            @Override
            public void run() {
                if (!running) return;
                if (remainingSecs <= 0) {
                    onTimerComplete();
                    return;
                }

                remainingSecs--;
                updateNotification();

                if (remainingSecs <= 0) {
                    onTimerComplete();
                    return;
                }

                handler.postDelayed(this, 1000);
            }
        };
        handler.postDelayed(ticker, 1000);
    }

    private void stopTicking() {
        if (ticker != null) {
            handler.removeCallbacks(ticker);
            ticker = null;
        }
    }

    private void onTimerComplete() {
        running = false;
        stopTicking();

        Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (alarmSound == null) {
            alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, COMPLETE_CHANNEL_ID)
            .setContentTitle(label + " complete")
            .setContentText("Great work! Timer finished.")
            .setSmallIcon(R.drawable.ic_stat_kawa)
            .setOngoing(false)
            .setAutoCancel(true)
            .setContentIntent(makeOpenIntent())
            .setVibrate(new long[]{0, 500, 200, 500})
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(makeOpenIntent(), true);
        
        if (alarmSound != null) {
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();
            builder.setSound(alarmSound, audioAttributes);
        }

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(COMPLETE_NOTIF_ID, builder.build());

        stopForeground(true);
        stopSelf();
    }

    private String fmt(int secs) {
        int mins = secs / 60;
        int rem = secs % 60;
        return String.format("%02d:%02d", mins, rem);
    }

    private int getProgress() {
        if (totalSecs <= 0) return 0;
        return (int)(((totalSecs - remainingSecs) / (float) totalSecs) * 100);
    }

    private PendingIntent makeServiceIntent(String action, int requestCode) {
        Intent intent = new Intent(this, TimerService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private PendingIntent makeOpenIntent() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private Notification buildNotification() {
        return buildBuilder().build();
    }

    private void updateNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIF_ID, buildBuilder().build());
    }

    private NotificationCompat.Builder buildBuilder() {
        String status = running ? "Running" : "Paused";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Kawa - " + label)
            .setContentText(fmt(remainingSecs) + " remaining - " + status)
            .setSmallIcon(R.drawable.ic_stat_kawa)
            .setOngoing(running)
            .setOnlyAlertOnce(true)
            .setContentIntent(makeOpenIntent())
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setProgress(100, getProgress(), false);

        if (running) {
            builder.addAction(
                android.R.drawable.ic_media_pause,
                "Pause",
                makeServiceIntent(ACTION_PAUSE, 1)
            );
        } else {
            builder.addAction(
                android.R.drawable.ic_media_play,
                "Resume",
                makeServiceIntent(ACTION_RESUME, 2)
            );
        }

        builder.addAction(
            android.R.drawable.ic_delete,
            "Stop",
            makeServiceIntent(ACTION_STOP, 3)
        );

        return builder;
    }

    private void clearCompletionNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(COMPLETE_NOTIF_ID);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel timerChannel = new NotificationChannel(
                CHANNEL_ID,
                "Kawa Timer",
                NotificationManager.IMPORTANCE_LOW
            );
            timerChannel.setDescription("Live timer countdown");
            timerChannel.setShowBadge(false);
            timerChannel.enableVibration(false);

            NotificationChannel completeChannel = new NotificationChannel(
                COMPLETE_CHANNEL_ID,
                "Kawa Timer Complete",
                NotificationManager.IMPORTANCE_HIGH
            );
            completeChannel.setDescription("Finished timer alerts");
            completeChannel.setShowBadge(true);
            completeChannel.enableVibration(true);
            
            // Set alarm sound for timer completion
            Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmSound == null) {
                alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            if (alarmSound != null) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build();
                completeChannel.setSound(alarmSound, audioAttributes);
            }

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(timerChannel);
                nm.createNotificationChannel(completeChannel);
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopTicking();
        super.onDestroy();
    }
}
