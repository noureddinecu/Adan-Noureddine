package tv.cleanyour.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import tv.cleanyour.core.flows.AccessResult
import tv.cleanyour.core.model.BlobRef
import tv.cleanyour.core.model.Endpoint
import tv.cleanyour.core.model.RawShell
import tv.cleanyour.core.model.Sha256
import tv.cleanyour.core.model.ShellLine
import tv.cleanyour.core.model.TvId
import tv.cleanyour.core.session.InstallOutcome
import tv.cleanyour.core.session.TvSession
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.util.Locale

// «نور» (Zahhaf TV): the Noor apps on the TV — the adhan at every prayer over whatever is playing, the adhkar in a
// corner, the prayer-times card, the Kahf/Baqarah/adhkar/ruqyah cards — put on through this app's own TV session,
// the city taken from the phone's location, and the TV's own page (live writing and drawing, adhan and adhkar
// settings) opened inside the app.

private val NOOR_APKS = listOf("noor-kahf", "noor-baqara", "noor-sabah", "noor-masa", "noor-ruqya", "prayer-times")
private val GOLD = Color(0xFFE8A84C)

private enum class StepState { WAIT, RUN, OK, SKIP, FAIL }
private class NoorStep(val label: String) { var state by mutableStateOf(StepState.WAIT); var note by mutableStateOf("") }

@Composable
fun NoorScreen(graph: AppGraph, tvId: TvId, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val tvs by graph.tvs.tvs.collectAsStateWithLifecycle()
    val tv = tvs.firstOrNull { it.id == tvId }
    val host = tv?.endpoints?.firstOrNull { it is Endpoint.PlainTcp }?.host ?: tv?.endpoints?.firstOrNull()?.host
    var page by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var online by remember { mutableStateOf<Boolean?>(null) }
    var message by remember { mutableStateOf("") }
    val steps = remember {
        mutableStateListOf(NoorStep("تطبيقات نور: الأذان والأذكار والبطاقات"), NoorStep("الإذن بالظهور فوق أي تطبيق"),
            NoorStep("المدينة ومواقيت الصلاة من موقع الهاتف"), NoorStep("تشغيل الأذان والأذكار"))
    }
    var located by remember { mutableStateOf<NoorCity?>(null) }
    val askLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) scope.launch { located = withContext(Dispatchers.IO) { locate(context) } }
    }

    LaunchedEffect(host) {
        online = host != null && withContext(Dispatchers.IO) { ping(host) }
        if (context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            located = withContext(Dispatchers.IO) { locate(context) }
        }
    }

    if (page && host != null) {
        BackHandler { page = false }
        TvPage(host) { page = false }
        return
    }
    BackHandler { onBack() }

    fun install() {
        if (busy) return
        busy = true
        message = ""
        steps.forEach { it.state = StepState.WAIT; it.note = "" }
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { putNoorOn(context, graph, tvId, host, located, steps) }
            }
            busy = false
            online = host != null && withContext(Dispatchers.IO) { ping(host) }
            message = result.fold({ "تمّ ✓ نور يعمل على التلفاز" },
                { "تعذّر الإكمال: " + (it.message ?: it.javaClass.simpleName) + "\nاضغط «تركيب نور» مرة أخرى ليكمل." })
        }
    }

    Column(
        Modifier.fillMaxSize().background(Color(0xFF0D0F14)).statusBarsPadding().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("→") }
            Spacer(Modifier.size(12.dp))
            Text("نور", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        }
        Text("الأذان بصوت الشيخ أنس التازي في كل صلاة، ولو كان شيء يعمل على التلفاز. والأذكار تظهر صغيرة في زاوية الشاشة. " +
            "ومن هنا تكتب أو ترسم على التلفاز مباشرة.", color = Color(0xFFB8BCC8), fontSize = 15.sp, lineHeight = 23.sp)

        Card {
            Text("حالة التلفاز", color = Color(0xFFB8BCC8), fontSize = 13.sp)
            Text(when (online) { null -> "جارٍ التحقق…"; true -> "نور يعمل على هذا التلفاز ✓"; false -> "نور غير مثبَّت بعد، أو التلفاز مطفأ" },
                color = if (online == true) Color(0xFF7CD9A6) else Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Text("المدينة: " + (located?.let { it.place.ifEmpty { it.lat + ", " + it.lon } } ?: "لم تُحدَّد بعد"), color = Color(0xFFB8BCC8), fontSize = 14.sp)
            if (located == null) {
                OutlinedButton(onClick = { askLocation.launch(Manifest.permission.ACCESS_COARSE_LOCATION) }) { Text("استخدم موقع الهاتف") }
            }
        }

        Button(onClick = { install() }, enabled = !busy && host != null, modifier = Modifier.fillMaxWidth().height(54.dp),
            colors = ButtonDefaults.buttonColors(containerColor = GOLD, contentColor = Color.Black)) {
            Text(if (online == true) "تحديث نور على التلفاز" else "تركيب نور على التلفاز", fontSize = 17.sp, fontWeight = FontWeight.Bold)
        }

        if (steps.any { it.state != StepState.WAIT }) Card {
            steps.forEach { s ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
                    when (s.state) {
                        StepState.RUN -> CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = GOLD)
                        else -> Text(when (s.state) { StepState.OK -> "✓"; StepState.SKIP -> "–"; StepState.FAIL -> "✕"; else -> "○" },
                            color = when (s.state) { StepState.OK -> Color(0xFF7CD9A6); StepState.FAIL -> Color(0xFFFF8A8A); else -> Color(0xFF8A8FA0) },
                            fontSize = 18.sp, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.size(12.dp))
                    Column {
                        Text(s.label, color = Color.White, fontSize = 15.sp)
                        if (s.note.isNotEmpty()) Text(s.note, color = Color(0xFF8A8FA0), fontSize = 12.sp)
                    }
                }
            }
        }
        if (message.isNotEmpty()) Text(message, color = if (message.startsWith("تمّ")) Color(0xFF7CD9A6) else Color(0xFFFFB0B0), fontSize = 14.sp)

        OutlinedButton(onClick = { page = true }, enabled = online == true && host != null, modifier = Modifier.fillMaxWidth().height(54.dp)) {
            Text("الكتابة والرسم وإعدادات الأذان والأذكار", fontSize = 16.sp)
        }
        Text("مبني على Clean Your TV app (رخصة MIT). نور: مواقيت الصلاة من Aladhan، وخط أميري (رخصة OFL).",
            color = Color(0xFF6B7080), fontSize = 12.sp)
    }
}

@Composable
private fun Card(content: @Composable () -> Unit) = Column(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color(0xFF181B22)).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
) { content() }

// The TV's own page, served by the Noor app on port 8080: live writing and drawing, adhan and adhkar settings.
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun TvPage(host: String, onClose: () -> Unit) {
    AndroidView(modifier = Modifier.fillMaxSize(), factory = { ctx ->
        WebView(ctx).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            setBackgroundColor(android.graphics.Color.parseColor("#0D0F1E"))
            webViewClient = WebViewClient()
            addJavascriptInterface(object {
                @JavascriptInterface fun home() { post { onClose() } }
                @JavascriptInterface fun setLang(l: String) {}
                @JavascriptInterface fun tap() {}
            }, "Zahhaf")
            loadUrl("http://$host:8080/?app=1&lang=ar&name=" + URLEncoder.encode("نور", "UTF-8"))
        }
    })
}

private class NoorCity(val lat: String, val lon: String, val place: String, val method: Int)

@OptIn(RawShell::class)
private suspend fun putNoorOn(context: Context, graph: AppGraph, tvId: TvId, host: String?, city: NoorCity?, steps: List<NoorStep>) {
    val session: TvSession = when (val r = graph.access.session(tvId)) {
        is AccessResult.Ok -> r.session
        else -> error("لا يمكن الوصول إلى التلفاز الآن. تأكّد أنه يعمل وعلى الشبكة نفسها.")
    }
    suspend fun sh(line: String) = session.exec(ShellLine(line))

    steps[0].state = StepState.RUN
    for (name in NOOR_APKS) {
        steps[0].note = name
        val file = File(context.cacheDir, "$name.apk")
        context.assets.open("noor/$name.apk").use { input -> file.outputStream().use { input.copyTo(it) } }
        val sha = MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) }
        val outcome = session.installStream(BlobRef(Sha256(sha), file.length(), file.path), file.length())
        if (outcome is InstallOutcome.Failed) { steps[0].state = StepState.FAIL; steps[0].note = "$name: ${outcome.detail}"; error(outcome.detail) }
    }
    steps[0].state = StepState.OK; steps[0].note = ""

    steps[1].state = StepState.RUN
    sh("appops set app.noortv.kahf SYSTEM_ALERT_WINDOW allow")
    sh("appops set app.noortv.kahf GET_USAGE_STATS allow")
    steps[1].state = StepState.OK

    steps[3].state = StepState.RUN
    delay(4000)
    sh("am broadcast -n app.noortv.kahf/app.noortv.Reminder")
    steps[3].state = StepState.OK

    steps[2].state = StepState.RUN
    if (city == null || host == null) {
        steps[2].state = StepState.SKIP; steps[2].note = "اضغط «استخدم موقع الهاتف» ثم أعد التحديث"
    } else {
        val q = "lat=${city.lat}&lon=${city.lon}&method=${city.method}&place=" + URLEncoder.encode(city.place, "UTF-8")
        var ok = false
        for (i in 0 until 15) {
            ok = post("http://$host:8080/city?$q") == "ok"
            if (ok) break
            delay(1000)
        }
        steps[2].state = if (ok) StepState.OK else StepState.FAIL
        steps[2].note = city.place
    }
}

private fun ping(host: String): Boolean = runCatching {
    val c = URL("http://$host:8080/ping").openConnection() as HttpURLConnection
    c.connectTimeout = 1500; c.readTimeout = 1500
    c.inputStream.use { it.readBytes().decodeToString().startsWith("zahhaf") }
}.getOrDefault(false)

private fun post(url: String): String = runCatching {
    val c = URL(url).openConnection() as HttpURLConnection
    c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 1500; c.readTimeout = 4000
    c.outputStream.close()
    c.inputStream.use { it.readBytes().decodeToString().trim() }
}.getOrDefault("")

@SuppressLint("MissingPermission")
private fun locate(context: Context): NoorCity? {
    val lm = context.getSystemService(LocationManager::class.java) ?: return null
    var loc: Location? = null
    for (p in listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER)) {
        val l = runCatching { lm.getLastKnownLocation(p) }.getOrNull()
        if (l != null && (loc == null || l.time > loc.time)) loc = l
    }
    val l = loc ?: return null
    var place = ""
    var cc = ""
    runCatching {
        @Suppress("DEPRECATION")
        Geocoder(context, Locale("ar")).getFromLocation(l.latitude, l.longitude, 1)?.firstOrNull()?.let {
            place = it.locality ?: it.subAdminArea ?: it.adminArea ?: ""
            cc = it.countryCode ?: ""
        }
    }
    return NoorCity(String.format(Locale.US, "%.4f", l.latitude), String.format(Locale.US, "%.4f", l.longitude), place, method(cc))
}

// Aladhan's calculation method used in that country.
private fun method(cc: String): Int = when (cc.uppercase(Locale.ROOT)) {
    "SA" -> 4; "KW" -> 9; "QA" -> 10; "AE" -> 16; "BH", "OM" -> 8
    "EG", "SD", "LY", "SY", "LB", "JO", "IQ", "PS" -> 5
    "MA" -> 21; "DZ" -> 19; "TN" -> 18; "TR" -> 13; "FR" -> 12; "US", "CA" -> 2
    "SG" -> 11; "MY" -> 17; "ID" -> 20; "RU" -> 14; "PT" -> 22; "IR" -> 7
    "PK", "IN", "BD", "AF" -> 1
    else -> 3
}
