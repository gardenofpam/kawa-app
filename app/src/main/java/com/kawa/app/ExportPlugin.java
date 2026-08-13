package com.kawa.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "ExportPlugin")
public class ExportPlugin extends Plugin {

    @PluginMethod
    public void shareCsv(PluginCall call) {
        String csv = call.getString("csv");
        String filename = sanitizeFilename(call.getString("filename", "kawa-export.csv"));

        if (csv == null) {
            call.reject("CSV content is required.");
            return;
        }

        try {
            File exportDir = new File(getContext().getCacheDir(), "exports");
            if (!exportDir.exists() && !exportDir.mkdirs()) {
                call.reject("Could not create export folder.");
                return;
            }

            File exportFile = new File(exportDir, filename);
            try (OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(exportFile), StandardCharsets.UTF_8)) {
                writer.write(csv);
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                exportFile
            );

            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            sendIntent.setType("text/csv");
            sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
            sendIntent.putExtra(Intent.EXTRA_SUBJECT, filename);
            sendIntent.putExtra(Intent.EXTRA_TITLE, filename);
            sendIntent.setClipData(ClipData.newUri(getContext().getContentResolver(), filename, uri));
            sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(sendIntent, "Export CSV");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Activity activity = getActivity();
            if (activity != null) {
                activity.startActivity(chooser);
            } else {
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            }

            JSObject result = new JSObject();
            result.put("filename", filename);
            call.resolve(result);
        } catch (ActivityNotFoundException e) {
            call.reject("No app is available to save or share this CSV.", e);
        } catch (Exception e) {
            call.reject("Could not export CSV.", e);
        }
    }

    private String sanitizeFilename(String filename) {
        String clean = filename == null ? "kawa-export.csv" : filename.replaceAll("[\\\\/:*?\"<>|]", "-");
        if (!clean.toLowerCase().endsWith(".csv")) {
            clean += ".csv";
        }
        return clean;
    }
}
