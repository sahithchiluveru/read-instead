package io.github.sahithchiluveru.readinstead

import android.app.Application
import android.util.Log
import io.github.sahithchiluveru.readinstead.library.Library
import io.github.sahithchiluveru.readinstead.phone.AccessKey
import io.github.sahithchiluveru.readinstead.phone.PhoneServer
import io.github.sahithchiluveru.readinstead.phone.ReaderSession
import java.util.concurrent.Executors

/**
 * Process-wide state. The Phone server lives here rather than in the Activity, so a
 * recreated Activity can't race the old one for its port.
 */
class ReadInsteadApp : Application() {
    val library by lazy { Library(filesDir.resolve("library"), AndroidCovers()) }

    // The Access Key is kept with the app's other settings, in the Library's store.
    val accessKey by lazy {
        AccessKey(object : AccessKey.Store {
            override fun load() = library.setting("accessKey")
            override fun save(key: String) = library.saveSetting("accessKey", key)
        })
    }

    /** The open Activity's Reader session, for Now Reading; null while there's none. */
    @Volatile
    var readerSession: ReaderSession? = null

    val phoneServer by lazy { PhoneServer(accessKey, library, session = { readerSession?.currentSpread() }) }

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
