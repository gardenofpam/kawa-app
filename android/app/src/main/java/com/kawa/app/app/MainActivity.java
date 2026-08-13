package com.kawa.app;

import android.os.Bundle;
import android.webkit.WebView;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TimerPlugin.class);
        registerPlugin(ExportPlugin.class);
        super.onCreate(savedInstanceState);

        if (bridge != null) {
            WebView webView = bridge.getWebView();
            if (webView != null) {
                webView.setLongClickable(false);
                webView.setHapticFeedbackEnabled(false);
                webView.setOnLongClickListener(new View.OnLongClickListener() {
                    @Override
                    public boolean onLongClick(View v) {
                        return true;
                    }
                });
            }
        }
    }
}
