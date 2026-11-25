package com.autopark.auto_park

import android.content.Context
import android.os.Build
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.net.NetworkInterface
import java.security.MessageDigest
import java.util.Collections

class MainActivity : FlutterFragmentActivity() {
    companion object {
        private const val CHANNEL = "autopark/device_identity"
        private const val PREFS_NAME = "autopark_device_identity"
        private const val KEY_PERMANENT_MAC = "permanent_mac"
        private const val KEY_PERMANENT_ID = "permanent_device_id"
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
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val cachedMac = prefs.getString(KEY_PERMANENT_MAC, "")?.trim().orEmpty()
        val cachedId = prefs.getString(KEY_PERMANENT_ID, "")?.trim().orEmpty()

        val model = listOf(Build.MANUFACTURER, Build.MODEL)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .trim()

        if (cachedMac.isNotEmpty() && cachedId.isNotEmpty()) {
            return mapOf(
                "macAddress" to cachedMac,
                "deviceId" to cachedId,
                "deviceModel" to model,
                "source" to "permanent_hw_mac",
            )
        }

        val realMac = readNetworkInterfaceMac()
        // Signing-key-independent hardware fingerprint: stays 100% identical across
        // APK rebuilds, reinstalls, and different CI signing certificates.
        val hwSeed = listOf(
            "AUTOPARK-HW-V1",
            Build.BRAND,
            Build.MANUFACTURER,
            Build.MODEL,
            Build.DEVICE,
            Build.BOARD,
            Build.HARDWARE,
            Build.PRODUCT,
            Build.BOOTLOADER,
            Build.SUPPORTED_ABIS.joinToString(","),
        ).joinToString("|")

        val effectiveMac = if (realMac.isNotEmpty()) realMac else deriveMacFromSeed(hwSeed)
        val deviceId = "AP-" + effectiveMac.replace(":", "")

        prefs.edit()
            .putString(KEY_PERMANENT_MAC, effectiveMac)
            .putString(KEY_PERMANENT_ID, deviceId)
            .apply()

        return mapOf(
            "macAddress" to effectiveMac,
            "deviceId" to deviceId,
            "deviceModel" to model,
            "source" to if (realMac.isNotEmpty()) "wifi_mac" else "permanent_hw_mac",
        )
    }

    private fun readNetworkInterfaceMac(): String {
        try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
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
            // Android 11+ restricts raw Wi-Fi MAC access; fall back to permanent hardware MAC
        }
        return ""
    }

    private fun deriveMacFromSeed(seed: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(seed.toByteArray(Charsets.UTF_8))
        // Set locally-administered unicast bits on first octet so it is always a valid MAC
        val b0 = ((digest[0].toInt() and 0xFE) or 0x02) and 0xFF
        val bytes = intArrayOf(
            b0,
            digest[1].toInt() and 0xFF,
            digest[2].toInt() and 0xFF,
            digest[3].toInt() and 0xFF,
            digest[4].toInt() and 0xFF,
            digest[5].toInt() and 0xFF,
        )
        return bytes.joinToString(":") { "%02X".format(it) }
    }
}
