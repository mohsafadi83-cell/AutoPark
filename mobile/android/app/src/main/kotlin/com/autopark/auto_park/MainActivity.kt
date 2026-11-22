package com.autopark.auto_park

import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.net.NetworkInterface
import java.security.MessageDigest
import java.util.Collections

class MainActivity : FlutterFragmentActivity() {
    companion object {
        private const val CHANNEL = "autopark/device_identity"
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method == "getHardwareIdentity") {
                    result.success(readHardwareIdentity())
                } else {
                    result.notImplemented()
                }
            }
    }

    private fun readHardwareIdentity(): Map<String, String> {
        val realMac = readNetworkInterfaceMac()
        val androidId = try {
            Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        } catch (_: Exception) {
            ""
        }.trim().uppercase()

        val effectiveMac = if (realMac.isNotEmpty()) {
            realMac
        } else if (androidId.isNotEmpty()) {
            deriveMacFromSeed("ANDROID:$androidId:${Build.BOARD}:${Build.BRAND}")
        } else {
            ""
        }

        val deviceId = if (androidId.isNotEmpty()) {
            "AND-$androidId"
        } else {
            effectiveMac.replace(":", "")
        }

        val model = listOf(Build.MANUFACTURER, Build.MODEL)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .trim()

        return mapOf(
            "macAddress" to effectiveMac,
            "deviceId" to deviceId,
            "deviceModel" to model,
            "source" to if (realMac.isNotEmpty()) "wifi_mac" else "android_hw_id",
        )
    }

    private fun readNetworkInterfaceMac(): String {
        try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            // Prefer wlan0 first, then any non-loopback interface with a real hardware address
            val ordered = interfaces.sortedBy { if (it.name.equals("wlan0", ignoreCase = true)) 0 else 1 }
            for (nif in ordered) {
                if (nif.isLoopback) continue
                val bytes = nif.hardwareAddress ?: continue
                if (bytes.size != 6) continue
                val mac = bytes.joinToString(":") { b -> "%02X".format(b) }
                if (mac != "02:00:00:00:00:00" && mac != "00:00:00:00:00:00") {
                    return mac
                }
            }
        } catch (_: Exception) {
            // Android 11+ restricts raw Wi-Fi MAC access; fall back to ANDROID_ID hardware fingerprint
        }
        return ""
    }

    private fun deriveMacFromSeed(seed: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(seed.toByteArray(Charsets.UTF_8))
        return (0 until 6).joinToString(":") { i -> "%02X".format(digest[i]) }
    }
}
