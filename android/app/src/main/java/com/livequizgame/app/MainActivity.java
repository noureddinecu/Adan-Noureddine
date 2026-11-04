package com.livequizgame.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * LIVE QUIZ GAME — Android app.
 * Hosts the dashboard (control panel) and the full-screen game screen of a LIVE QUIZ GAME server
 * (cloud, local network, or Termux on this phone). The game logic and the TikTok connection run
 * on that server; this app is the phone-first, installable front end.
 */
public class MainActivity extends Activity {
    private static final String HOME = "file:///android_asset/home.html";
    private static final int FILE_REQUEST = 41;

    private WebView web;
    private SharedPreferences prefs;
    private ValueCallback<Uri[]> fileCallback;
    private boolean gameMode = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); // the host phone must not sleep during a LIVE
        prefs = getSharedPreferences("lqg", MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(11, 7, 32));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // game sounds play without an extra tap
        s.setAllowFileAccess(true); // only for the bundled home screen in android_asset
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " LiveQuizGameApp/" + BuildConfigCompat.versionName(this));

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);

        web.addJavascriptInterface(new Bridge(), "LQGAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else showHome(null);
    }

    // ---------------------------------------------------------------- navigation

    private String server() {
        return prefs.getString("server", "");
    }

    private void showHome(String error) {
        setGameMode(false);
        String url = HOME;
        if (error != null) url += "#err=" + Uri.encode(error);
        web.loadUrl(url);
    }

    private void openMode(String mode) {
        String base = server();
        if (base.isEmpty()) { showHome(null); return; }
        boolean game = "screen".equals(mode);
        setGameMode(game);
        web.loadUrl(base + (game ? "/screen" : "/"));
    }

    @SuppressWarnings("deprecation")
    private void setGameMode(boolean on) {
        gameMode = on;
        View decor = getWindow().getDecorView();
        if (on) {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && gameMode) setGameMode(true);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        String url = web.getUrl();
        if (url == null || url.startsWith("file:")) { super.onBackPressed(); return; }
        if (gameMode) { showHome(null); return; }
        if (web.canGoBack()) {
            web.goBack();
            String back = web.getUrl();
            if (back != null && back.startsWith("file:")) setGameMode(false);
        } else {
            showHome(null);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush(); // keep the dashboard login
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    // ---------------------------------------------------------------- web clients

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            String url = u.toString();
            String base = server();
            if (url.startsWith("file:///android_asset/")) return false;
            if (!base.isEmpty() && (url.equals(base) || url.startsWith(base + "/"))) return false;
            // Anything else (question sources, help links) opens in the phone's browser.
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && !request.getUrl().toString().startsWith("file:")) {
                showHome(getString(R.string.app_name) + ": " + error.getDescription());
            }
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_REQUEST);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    // ---------------------------------------------------------------- JavaScript bridge

    /** Exposed as window.LQGAndroid to the home screen and to the dashboard. */
    private class Bridge {
        @JavascriptInterface
        public String getServer() { return server(); }

        @JavascriptInterface
        public void setServer(String url) {
            String u = url == null ? "" : url.trim();
            while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
            if (!u.isEmpty() && !u.startsWith("http://") && !u.startsWith("https://")) u = "http://" + u;
            prefs.edit().putString("server", u).apply();
        }

        @JavascriptInterface
        public void open(final String mode) { runOnUiThread(() -> openMode(mode)); }

        @JavascriptInterface
        public void home() { runOnUiThread(() -> showHome(null)); }

        @JavascriptInterface
        public String version() { return BuildConfigCompat.versionName(MainActivity.this); }

        /** Checks GET {url}/api/health in the background and calls window[callback](ok, message). */
        @JavascriptInterface
        public void checkServer(final String url, final String callback) {
            new Thread(() -> {
                boolean ok = false;
                String msg;
                HttpURLConnection c = null;
                try {
                    String base = url.trim();
                    while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
                    if (!base.startsWith("http://") && !base.startsWith("https://")) base = "http://" + base;
                    c = (HttpURLConnection) new URL(base + "/api/health").openConnection();
                    c.setConnectTimeout(6000);
                    c.setReadTimeout(6000);
                    int code = c.getResponseCode();
                    ok = code == 200;
                    msg = ok ? "OK" : ("HTTP " + code);
                } catch (Exception e) {
                    msg = e.getClass().getSimpleName() + ": " + e.getMessage();
                } finally {
                    if (c != null) c.disconnect();
                }
                final String js = "window." + callback.replaceAll("[^A-Za-z0-9_]", "") + "(" + ok + "," + JSONObject.quote(msg) + ")";
                runOnUiThread(() -> web.evaluateJavascript(js, null));
            }).start();
        }

        /** Saves an exported file (base64) to Downloads. Returns the location or an empty string. */
        @JavascriptInterface
        public String saveFile(String name, String mime, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String safe = name.replaceAll("[^\\w.\\-]", "_");
                String where;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "";
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(data); }
                    where = "Download/" + safe;
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File f = new File(dir, safe);
                    try (FileOutputStream out = new FileOutputStream(f)) { out.write(data); }
                    where = f.getAbsolutePath();
                }
                final String toast = where;
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "✓ " + toast, Toast.LENGTH_LONG).show());
                return where;
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "✗ " + e.getMessage(), Toast.LENGTH_LONG).show());
                return "";
            }
        }
    }
}
