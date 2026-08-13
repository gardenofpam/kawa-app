package com.kawa.app;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TimerPlugin")
public class TimerPlugin extends Plugin {

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
