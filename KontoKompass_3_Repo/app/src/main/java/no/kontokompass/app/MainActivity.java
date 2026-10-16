package no.kontokompass.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.util.Base64;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int REQUEST_IMPORT = 101;
    private static final int REQUEST_EXPORT = 102;
    private static final int REQUEST_EXPORT_TEXT = 103;
    private static final int MAX_BYTES = 12 * 1024 * 1024;
    private WebView web;
    private String exportText;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xff0c1426);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(true);
        web.getSettings().setAllowFileAccessFromFileURLs(false);
        web.getSettings().setAllowUniversalAccessFromFileURLs(false);
        web.getSettings().setSupportZoom(false);
        web.addJavascriptInterface(new Bridge(), "KontoHost");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"file".equalsIgnoreCase(request.getUrl().getScheme());
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    private void js(String expression) { runOnUiThread(() -> web.evaluateJavascript(expression, null)); }
    private void error(String message) { js("window.showError(" + JSONObject.quote(message) + ")"); }

    public final class Bridge {
        @JavascriptInterface public void chooseFile() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"text/*", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", "application/vnd.ms-excel", "application/json"});
                startActivityForResult(i, REQUEST_IMPORT);
            });
        }
        @JavascriptInterface public void saveText(String filename, String text, String mime) {
            if (text == null || text.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) { error("Eksporten er for stor."); return; }
            exportText = text;
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("text/csv");
                i.putExtra(Intent.EXTRA_TITLE, filename == null ? "KontoKompass-rapport.csv" : filename);
                startActivityForResult(i, REQUEST_EXPORT_TEXT);
            });
        }
        @JavascriptInterface public void saveBackup(String text) {
            if (text == null || text.length() > MAX_BYTES) { error("Sikkerhetskopien er for stor."); return; }
            exportText = text;
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_TITLE, "KontoKompass-backup.json");
                startActivityForResult(i, REQUEST_EXPORT);
            });
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (requestCode == REQUEST_EXPORT || requestCode == REQUEST_EXPORT_TEXT) {
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IllegalArgumentException("Kan ikke skrive filen");
                out.write(exportText.getBytes(StandardCharsets.UTF_8));
                js("window.onBackupSaved()");
            } catch (Exception e) { error("Kunne ikke lagre sikkerhetskopien: " + e.getMessage()); }
            finally { exportText = null; }
            return;
        }
        if (requestCode != REQUEST_IMPORT) return;
        final String name = getName(uri);
        new Thread(() -> {
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) throw new IllegalArgumentException("Kunne ikke åpne fil");
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[16384]; int len;
                while ((len = in.read(chunk)) != -1) {
                    if (buffer.size() + len > MAX_BYTES) throw new IllegalArgumentException("Maksimum filstørrelse er 12 MB");
                    buffer.write(chunk, 0, len);
                }
                byte[] bytes = buffer.toByteArray();
                String lower = name.toLowerCase(java.util.Locale.ROOT);
                if (lower.endsWith(".xlsx")) {
                    JSONObject table = XlsxReader.read(bytes, name);
                    js("window.importTable(" + table.toString() + ")");
                } else if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
                    String raw = new String(bytes, StandardCharsets.UTF_8);
                    if (raw.startsWith("\ufeff")) raw = raw.substring(1);
                    js("window.importText(" + JSONObject.quote(name) + "," + JSONObject.quote(raw) + ")");
                } else if (lower.endsWith(".json")) {
                    js("window.restoreBackup(" + JSONObject.quote(new String(bytes, StandardCharsets.UTF_8)) + ")");
                } else if (lower.endsWith(".pdf")) {
                    error("PDF er foreløpig ikke støttet i Android-versjonen. Eksporter CSV eller Excel fra banken.");
                } else {
                    error("Ukjent filtype. Bruk CSV, TSV eller XLSX.");
                }
            } catch (Exception e) { error("Filimport feilet: " + e.getMessage()); }
        }).start();
    }
    private String getName(Uri uri) {
        try (android.database.Cursor c = getContentResolver().query(uri, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        return "kontoutskrift.csv";
    }
    @Override public void onBackPressed() {
        js("window.handleBack()");
    }
    @Override protected void onDestroy() {
        web.removeJavascriptInterface("KontoHost"); web.destroy(); super.onDestroy();
    }
}
