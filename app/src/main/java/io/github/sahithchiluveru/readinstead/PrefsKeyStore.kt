package io.github.sahithchiluveru.readinstead

import android.content.SharedPreferences
import io.github.sahithchiluveru.readinstead.phone.AccessKey

/** Persists the Access Key in SharedPreferences. */
class PrefsKeyStore(private val prefs: SharedPreferences) : AccessKey.Store {
    override fun load(): String? = prefs.getString("access_key", null)
    override fun save(key: String) {
        prefs.edit().putString("access_key", key).apply()
    }
}
