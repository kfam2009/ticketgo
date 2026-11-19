package com.ticketgoplus.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * TicketGo para TV: se empareja con un número (o con el código de la entrada) y reproduce
 * el evento usando la misma API que el reproductor web (/ver/<t>/iniciar y /latido).
 */
public class MainActivity extends Activity {
    private static final String BASE = "https://ticketgoplus.com";
    private static final int AMARILLO = Color.rgb(255, 214, 0);

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService red = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;

    private ExoPlayer player;
    private PlayerView vista;
    private LinearLayout panel;
    private TextView titulo, numero, info, estadoTxt;
    private ImageView qr;
    private Button botonCodigo;

    private String t, s, estado = "", fuentesActuales = "", parId;
    private boolean mirando = false;
    private long ultimoAtras = 0;
    private final Runnable latido = new Runnable() { public void run() { pedir("latido"); } };
    private final Runnable consulta = new Runnable() { public void run() { consultarPar(); } };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences("tv", MODE_PRIVATE);
        armarPantalla();
        player = new ExoPlayer.Builder(this).build();
        vista.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException e) {
                // Un corte de la señal: reintenta con lo que diga el servidor
                fuentesActuales = "";
                ui.postDelayed(new Runnable() { public void run() { pedir("iniciar"); } }, 3000);
            }
        });
        t = prefs.getString("t", null);
        s = prefs.getString("s", null);
        if (s == null) { s = "tv-" + UUID.randomUUID().toString().replace("-", "").substring(0, 24); guardar(); }
        if (t != null) mirar(); else emparejar();
    }

    // ------------------------------------------------------------------ pantalla
    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    private TextView texto(float sp, int color, boolean negrita) {
        TextView tv = new TextView(this);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        tv.setTextColor(color);
        tv.setGravity(Gravity.CENTER);
        if (negrita) tv.setTypeface(Typeface.DEFAULT_BOLD);
        return tv;
    }

    private void armarPantalla() {
        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.BLACK);
        vista = new PlayerView(this);
        vista.setUseController(true);
        vista.setControllerShowTimeoutMs(3000);
        vista.setKeepScreenOn(true);
        raiz.addView(vista, new FrameLayout.LayoutParams(-1, -1));

        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.rgb(11, 12, 16));
        panel.setPadding(dp(40), dp(30), dp(40), dp(30));

        TextView marca = texto(30, Color.WHITE, true);
        marca.setText("TicketGo");
        panel.addView(marca);
        titulo = texto(20, Color.rgb(180, 185, 196), false);
        titulo.setPadding(0, dp(6), 0, dp(14));
        panel.addView(titulo);

        LinearLayout fila = new LinearLayout(this);
        fila.setOrientation(LinearLayout.HORIZONTAL);
        fila.setGravity(Gravity.CENTER);
        LinearLayout izq = new LinearLayout(this);
        izq.setOrientation(LinearLayout.VERTICAL);
        izq.setGravity(Gravity.CENTER);
        numero = texto(72, AMARILLO, true);
        numero.setLetterSpacing(0.15f);
        izq.addView(numero);
        info = texto(18, Color.WHITE, false);
        info.setPadding(0, dp(8), 0, 0);
        izq.addView(info);
        fila.addView(izq);
        qr = new ImageView(this);
        LinearLayout.LayoutParams lq = new LinearLayout.LayoutParams(dp(180), dp(180));
        lq.leftMargin = dp(40);
        fila.addView(qr, lq);
        panel.addView(fila);

        botonCodigo = new Button(this);
        botonCodigo.setText("Escribir el código de mi entrada");
        botonCodigo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        LinearLayout.LayoutParams lb = new LinearLayout.LayoutParams(-2, -2);
        lb.topMargin = dp(24);
        panel.addView(botonCodigo, lb);
        botonCodigo.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { pedirCodigo(); } });

        estadoTxt = texto(14, Color.rgb(140, 145, 156), false);
        estadoTxt.setPadding(0, dp(18), 0, 0);
        panel.addView(estadoTxt);
        raiz.addView(panel, new FrameLayout.LayoutParams(-1, -1));
        setContentView(raiz);
    }

    private void mostrarPanel(String tit, String num, String msg, Bitmap codigoQr, boolean conBoton) {
        panel.setVisibility(View.VISIBLE);
        titulo.setText(tit == null ? "" : tit);
        numero.setText(num == null ? "" : num);
        numero.setVisibility(num == null || num.isEmpty() ? View.GONE : View.VISIBLE);
        info.setText(msg == null ? "" : msg);
        qr.setImageBitmap(codigoQr);
        qr.setVisibility(codigoQr == null ? View.GONE : View.VISIBLE);
        botonCodigo.setVisibility(conBoton ? View.VISIBLE : View.GONE);
        if (conBoton) botonCodigo.requestFocus();
        estadoTxt.setText("");
    }

    private Bitmap hacerQr(String texto) {
        try {
            BitMatrix m = new QRCodeWriter().encode(texto, BarcodeFormat.QR_CODE, 360, 360);
            Bitmap bmp = Bitmap.createBitmap(m.getWidth(), m.getHeight(), Bitmap.Config.RGB_565);
            for (int x = 0; x < m.getWidth(); x++)
                for (int y = 0; y < m.getHeight(); y++) bmp.setPixel(x, y, m.get(x, y) ? Color.BLACK : Color.WHITE);
            return bmp;
        } catch (Exception e) { return null; }
    }

    // ------------------------------------------------------------------ emparejar
    private void emparejar() {
        mirando = false;
        ui.removeCallbacks(latido);
        ui.removeCallbacks(consulta);
        player.stop();
        player.clearMediaItems();
        fuentesActuales = "";
        mostrarPanel("Ver en este televisor", "", "Conectando…", null, true);
        red.execute(new Runnable() { public void run() {
            final JSONObject r = http("POST", BASE + "/tv/api/nuevo", "{}");
            ui.post(new Runnable() { public void run() {
                if (r == null || !r.has("numero")) {
                    mostrarPanel("Ver en este televisor", "", "No hay conexión con TicketGo. Reintentando…", null, true);
                    ui.postDelayed(new Runnable() { public void run() { emparejar(); } }, 5000);
                    return;
                }
                String num = r.optString("numero");
                parId = r.optString("id");
                s = r.optString("s", s);
                guardar();
                mostrarPanel("Ver en este televisor", num,
                        "En tu celular entrá a  ticketgoplus.com/tv\n(o escaneá el código)\ny escribí este número.",
                        hacerQr(BASE + "/tv?c=" + num), true);
                ui.postDelayed(consulta, 2000);
            }});
        }});
    }

    private void consultarPar() {
        if (parId == null || mirando) return;
        final String id = parId;
        red.execute(new Runnable() { public void run() {
            final JSONObject r = http("GET", BASE + "/tv/api/estado?id=" + Uri.encode(id), null);
            ui.post(new Runnable() { public void run() {
                if (mirando || !id.equals(parId)) return;
                if (r != null && r.optBoolean("listo")) {
                    t = r.optString("t");
                    guardar();
                    mirar();
                } else if (r != null && r.optBoolean("vencido")) {
                    emparejar(); // el número venció: pide otro
                } else {
                    ui.postDelayed(consulta, 2000);
                }
            }});
        }});
    }

    private void pedirCodigo() {
        final EditText campo = new EditText(this);
        campo.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        campo.setHint("ABCD-1234");
        new AlertDialog.Builder(this)
                .setTitle("Código de tu entrada")
                .setMessage("Está en el mail de tu entrada: ticketgoplus.com/v/ABCD-1234")
                .setView(campo)
                .setPositiveButton("Ver", (d, w) -> usarCodigo(campo.getText().toString()))
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void usarCodigo(final String codigo) {
        estadoTxt.setText("Revisando el código…");
        red.execute(new Runnable() { public void run() {
            JSONObject b = new JSONObject();
            try { b.put("codigo", codigo); b.put("s", s); } catch (Exception ignored) {}
            final JSONObject r = http("POST", BASE + "/tv/api/codigo", b.toString());
            ui.post(new Runnable() { public void run() {
                if (r != null && r.has("t")) {
                    t = r.optString("t");
                    s = r.optString("s", s);
                    guardar();
                    parId = null;
                    mirar();
                } else {
                    estadoTxt.setText(r != null ? r.optString("error", "No se pudo") : "Sin conexión");
                }
            }});
        }});
    }

    // ------------------------------------------------------------------ mirar
    private void mirar() {
        mirando = true;
        ui.removeCallbacks(consulta);
        mostrarPanel("", "", "Cargando…", null, false);
        pedir("iniciar");
    }

    private void pedir(final String que) {
        if (!mirando || t == null) return;
        ui.removeCallbacks(latido);
        red.execute(new Runnable() { public void run() {
            JSONObject b = new JSONObject();
            try { b.put("s", s); b.put("estado", estado); } catch (Exception ignored) {}
            final JSONObject r = http("POST", BASE + "/ver/" + Uri.encode(t) + "/" + que, b.toString());
            ui.post(new Runnable() { public void run() { aplicar(r); } });
        }});
    }

    private void aplicar(JSONObject d) {
        if (!mirando) return;
        if (d == null) { // sin conexión: sigue reintentando
            estadoTxt.setText("Sin conexión, reintentando…");
            ui.postDelayed(latido, 8000);
            return;
        }
        if (d.optBoolean("expulsado") || d.optBoolean("ocupado")) {
            player.stop();
            mostrarPanel("", "", "Tu entrada se está viendo en otra pantalla.\nPara verla acá, vinculá este televisor de nuevo.", null, false);
            olvidar();
            ui.postDelayed(new Runnable() { public void run() { emparejar(); } }, 6000);
            return;
        }
        if (d.has("error")) {
            player.stop();
            mostrarPanel("", "", d.optString("error") + "\n" + d.optString("detalle", ""), null, false);
            olvidar();
            ui.postDelayed(new Runnable() { public void run() { emparejar(); } }, 6000);
            return;
        }
        String nuevo = d.optString("estado");
        String tit = d.optString("titulo", "");
        estado = nuevo;
        boolean hayVideo = "vivo".equals(nuevo) || "repeticion".equals(nuevo) || "grabado".equals(nuevo);
        if (hayVideo) {
            JSONArray fs = d.optJSONArray("fuentes");
            if (fs != null && fs.length() > 0) reproducir(fs);
            if (!fuentesActuales.isEmpty()) panel.setVisibility(View.GONE);
        } else {
            player.stop();
            fuentesActuales = "";
            String msg;
            if ("espera".equals(nuevo)) msg = "Todavía no empezó la transmisión.\nArranca sola cuando llegue la señal.";
            else if ("procesando".equals(nuevo)) msg = "Terminó la transmisión.\nEstamos preparando la repetición…";
            else if ("terminado".equals(nuevo)) msg = "Este evento terminó y la repetición ya no está disponible.";
            else msg = "No disponible por ahora.";
            mostrarPanel(tit, "", msg, null, false);
        }
        ui.postDelayed(latido, 20000);
    }

    private void reproducir(JSONArray fs) {
        List<MediaItem> items = new ArrayList<>();
        StringBuilder clave = new StringBuilder();
        List<String> vistos = new ArrayList<>();
        for (int i = 0; i < fs.length(); i++) {
            JSONObject f = fs.optJSONObject(i);
            if (f == null) continue;
            String id = f.optString("id"), url = f.optString("url");
            if (vistos.contains(id)) continue; // capítulos del mismo video: una sola vez
            vistos.add(id);
            clave.append(id).append(',');
            items.add(new MediaItem.Builder().setUri(url).setMimeType(MimeTypes.APPLICATION_M3U8).build());
        }
        if (items.isEmpty() || clave.toString().equals(fuentesActuales)) return;
        fuentesActuales = clave.toString();
        player.setMediaItems(items);
        player.prepare();
        player.setPlayWhenReady(true);
        panel.setVisibility(View.GONE);
    }

    private void olvidar() {
        t = null;
        mirando = false;
        ui.removeCallbacks(latido);
        guardar();
    }

    private void guardar() {
        prefs.edit().putString("t", t).putString("s", s).apply();
    }

    // ------------------------------------------------------------------ control remoto
    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK && mirando) {
            long ahora = System.currentTimeMillis();
            if (ahora - ultimoAtras < 3000) {
                salirDeTv();
                emparejar();
            } else {
                ultimoAtras = ahora;
                Toast.makeText(this, "Apretá Atrás otra vez para desvincular este televisor", Toast.LENGTH_SHORT).show();
            }
            return true;
        }
        if (mirando && panel.getVisibility() == View.GONE && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER
                || code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT)) {
            vista.showController();
            return super.onKeyDown(code, e);
        }
        return super.onKeyDown(code, e);
    }

    private void salirDeTv() {
        final String viejoT = t;
        if (viejoT != null) red.execute(new Runnable() { public void run() {
            JSONObject b = new JSONObject();
            try { b.put("s", s); } catch (Exception ignored) {}
            http("POST", BASE + "/ver/" + Uri.encode(viejoT) + "/salir", b.toString());
        }});
        olvidar();
    }

    @Override protected void onStop() {
        super.onStop();
        player.setPlayWhenReady(false);
        ui.removeCallbacks(latido);
        ui.removeCallbacks(consulta);
    }

    @Override protected void onStart() {
        super.onStart();
        if (mirando) { fuentesActuales = ""; pedir("iniciar"); }
        else if (parId != null) ui.postDelayed(consulta, 500);
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        player.release();
        red.shutdownNow();
    }

    // ------------------------------------------------------------------ red
    private JSONObject http(String metodo, String direccion, String cuerpo) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(direccion).openConnection();
            c.setRequestMethod(metodo);
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("User-Agent", "TicketGoTV/1");
            if (cuerpo != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                OutputStream o = c.getOutputStream();
                o.write(cuerpo.getBytes(StandardCharsets.UTF_8));
                o.close();
            }
            int codigo = c.getResponseCode();
            InputStream in = codigo >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in == null) return null;
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] tmp = new byte[4096];
            int n;
            while ((n = in.read(tmp)) > 0) buf.write(tmp, 0, n);
            in.close();
            JSONObject j = new JSONObject(buf.toString("UTF-8"));
            if (codigo == 404 && !j.has("vencido") && !j.has("error")) return null;
            return j;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
