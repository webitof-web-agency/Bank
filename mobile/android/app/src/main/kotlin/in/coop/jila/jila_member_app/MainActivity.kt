package `in`.coop.jila.jila_member_app

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// App self-update: downloads a new APK with Android's DownloadManager into the
// public Downloads folder (no storage permission needed on Android 10+; the
// system shows progress in the notification bar), then opens the installer.
// Installing needs "Install unknown apps" for this app: when it isn't granted
// yet, the system settings screen is opened and the install resumes on return.
class MainActivity : FlutterActivity() {
    private val channelName = "thrift_rpr/updater"
    private var channel: MethodChannel? = null
    private var downloadId = -1L
    private var pendingInstall: Uri? = null
    private var receiverRegistered = false

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (id != downloadId) return
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            var ok = false
            dm.query(DownloadManager.Query().setFilterById(id))?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                    ok = status == DownloadManager.STATUS_SUCCESSFUL
                }
            }
            channel?.invokeMethod("downloadFinished", mapOf("ok" to ok))
            if (ok) dm.getUriForDownloadedFile(id)?.let { install(it) }
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).also {
            it.setMethodCallHandler { call, result ->
                when (call.method) {
                    "download" -> {
                        val url = call.argument<String>("url")
                        val fileName = call.argument<String>("fileName") ?: "update.apk"
                        if (url.isNullOrBlank()) {
                            result.error("NO_URL", "No download link", null)
                        } else {
                            try {
                                result.success(startDownload(url, fileName))
                            } catch (e: Exception) {
                                result.error("DOWNLOAD_FAILED", e.message, null)
                            }
                        }
                    }
                    else -> result.notImplemented()
                }
            }
        }
    }

    private fun startDownload(url: String, fileName: String): Long {
        // Only an https link: a plain http APK could be swapped in transit.
        val uri = Uri.parse(url)
        require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()) { "The update link must be https" }
        // The name is built from the server's version text: no path parts.
        val safeName = fileName.replace(Regex("[^A-Za-z0-9._+-]"), "_").trimStart('.').ifBlank { "update.apk" }
            .let { if (it.endsWith(".apk", ignoreCase = true)) it else "$it.apk" }
        if (!receiverRegistered) {
            val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                registerReceiver(downloadReceiver, filter)
            }
            receiverRegistered = true
        }
        val request = DownloadManager.Request(uri)
            .setTitle(safeName)
            .setDescription("Downloading the new version")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeName)
        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        downloadId = dm.enqueue(request)
        return downloadId
    }

    private fun install(uri: Uri) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            // Ask once for "Install unknown apps"; onResume continues the install.
            pendingInstall = uri
            startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
            )
            return
        }
        pendingInstall = null
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
    }

    override fun onResume() {
        super.onResume()
        val uri = pendingInstall ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()) {
            install(uri)
        }
    }

    override fun onDestroy() {
        if (receiverRegistered) {
            unregisterReceiver(downloadReceiver)
            receiverRegistered = false
        }
        super.onDestroy()
    }
}
