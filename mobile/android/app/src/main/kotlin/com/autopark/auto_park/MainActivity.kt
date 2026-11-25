package com.autopark.auto_park

import android.media.MediaDrm
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.net.NetworkInterface
import java.security.MessageDigest
import java.util.Collections
import java.util.UUID

class MainActivity : FlutterFragmentActivity() {
    companion object {
        private const val CHANNEL = "autopark/device_identity"
        private val WIDEVINE_UUID = UUID(-0x121074568629b532L, -0x5c37d8232ae2de13L)
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

    private fun readWidevineDeviceId(): String {
        var drm: MediaDrm? = null
        return try {
            drm = MediaDrm(WIDEVINE_UUID)
            val bytes = drm.getPropertyByteArray(MediaDrm.PROPERTY_DEVICE_UNIQUE_ID)
            bytes.joinToString("") { b -> "%02X".format(b) }
        } catch (_: Exception) {
            ""
        } finally {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    drm?.close()
                } else {
                    @Suppress("DEPRECATION")
                    drm?.release()
                }
            } catch (_: Exception) {
            }
        }
    }

    private fun readHardwareIdentity(): Map<String, String> {
        val realMac = readNetworkInterfaceMac()
        // Widevine hardware ID stays 100% identical across uninstalls, reinstalls, and new CI APK builds!
        val widevineId = readWidevineDeviceId()
        val androidId = try {
            Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        } catch (_: Exception) {
            ""
        }.trim().uppercase()

        val stableSeed = when {
            widevineId.isNotEmpty() -> "HW-WV:$widevineId"
            androidId.isNotEmpty() -> "ANDROID:$androidId:${Build.BOARD}:${Build.BRAND}"
            else -> "BUILD:${Build.MANUFACTURER}:${Build.MODEL}:${Build.HARDWARE}:${Build.BOARD}"
        }

        val effectiveMac = if (realMac.isNotEmpty()) {
            realMac
        } else {
            deriveMacFromSeed(stableSeed)
        }

        val deviceId = when {
            widevineId.isNotEmpty() -> "HW-${widevineId.take(16)}"
            androidId.isNotEmpty() -> "AND-$androidId"
            else -> effectiveMac.replace(":", "")
        }

        val model = listOf(Build.MANUFACTURER, Build.MODEL)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .trim()

        return mapOf(
            "macAddress" to effectiveMac,
            "deviceId" to deviceId,
            "deviceModel" to model,
            "source" to when {
                realMac.isNotEmpty() -> "wifi_mac"
                widevineId.isNotEmpty() -> "widevine_hw_id"
                else -> "android_hw_id"
            },
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
