package io.github.sahithchiluveru.readinstead

import android.net.ConnectivityManager
import android.webkit.JavascriptInterface
import io.github.sahithchiluveru.readinstead.phone.AccessKey
import io.github.sahithchiluveru.readinstead.phone.PhoneServer
import org.json.JSONObject
import java.net.Inet4Address

/**
 * Tells the Add books screen where the Phone Page lives, exposed to the web reader as
 * `ReadInsteadPhone`. The link carries the Access Key, for the QR code.
 */
class PhoneLinkBridge(
    private val accessKey: AccessKey,
    private val server: PhoneServer,
    private val connectivity: ConnectivityManager,
) {
    /**
     * `{ address, url, error }`: the address to show (host:port) and the URL for the QR
     * code, or null for both with an `error` to show instead.
     */
    @JavascriptInterface
    fun link(): String {
        val ip = lanAddress()
        val error = when {
            ip == null -> "Connect the TV to Wi-Fi to add books"
            !server.isRunning -> "The phone link couldn't start. Restart Read Instead and try again."
            else -> null
        }
        val address = if (error == null) "$ip:${PhoneServer.PORT}" else null
        return JSONObject()
            .put("address", address ?: JSONObject.NULL)
            .put("url", address?.let { "http://$it/?k=${accessKey.current}" } ?: JSONObject.NULL)
            .put("error", error ?: JSONObject.NULL)
            .toString()
    }

    /** Locks out every connected phone and returns the new link. */
    @JavascriptInterface
    fun resetKey(): String {
        accessKey.reset()
        return link()
    }

    private fun lanAddress(): String? {
        val network = connectivity.activeNetwork ?: return null
        return connectivity.getLinkProperties(network)?.linkAddresses
            ?.map { it.address }
            ?.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }
            ?.hostAddress
    }
}
