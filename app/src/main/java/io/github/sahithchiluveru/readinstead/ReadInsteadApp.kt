package io.github.sahithchiluveru.readinstead

import android.app.Application
import android.util.Log
import io.github.sahithchiluveru.readinstead.phone.AccessKey
import io.github.sahithchiluveru.readinstead.phone.PhoneServer
import java.util.concurrent.Executors

/**
 * Process-wide state. The Phone server lives here rather than in the Activity, so a
 * recreated Activity can't race the old one for its port.
 */
class ReadInsteadApp : Application() {
    val accessKey by lazy { AccessKey(PrefsKeyStore(getSharedPreferences("phone", MODE_PRIVATE))) }
    val phoneServer by lazy { PhoneServer(accessKey) }

    // Starting and stopping the server touches sockets, so it stays off the main thread,
    // and one executor keeps every start and stop in order.
    private val serverExecutor = Executors.newSingleThreadExecutor()

    fun startPhoneServer() = serverExecutor.execute {
        runCatching { phoneServer.start() }
            .onSuccess { Log.i(TAG, "phone server listening on port $it") }
            .onFailure { Log.e(TAG, "phone server failed to start", it) }
    }

    fun stopPhoneServer() = serverExecutor.execute { phoneServer.stop() }
}
