# Read Instead

A two-page e-reader for a Google TV (built for a Sony Bravia 3), so the TV gets used for reading instead of movies. Books are uploaded from a phone over the home Wi-Fi; everything stays local. See the spec in [issue #1](https://github.com/sahithchiluveru/read-instead/issues/1).

## Layout

- `app/`: Android TV shell (Kotlin). A single fullscreen WebView that loads the web reader from the APK's assets.
- `reader/`: the web reader. [foliate-js](https://github.com/johnfactotum/foliate-js) renders EPUBs and [pdf.js](https://mozilla.github.io/pdf.js/) renders PDFs. `npm run build` assembles `reader/dist`, and the Gradle build bundles it into the APK as `assets/reader`.
- `reader/fixtures/`: bundled public-domain sample books from Project Gutenberg. Moby-Dick was printed to a 530-page A5 PDF.
- `docs/research/`: research notes behind the layout and page-spread decisions.

## Building

Requirements: JDK 17, Node.js 24, and the Android SDK (`local.properties` with `sdk.dir=...`, or `ANDROID_HOME`).

Windows PowerShell:

```powershell
cd reader; npm ci; npx playwright install chromium-headless-shell; npm test; cd ..
.\gradlew.bat assembleDebug    # → app\build\outputs\apk\debug\app-debug.apk
```

macOS / Linux / Git Bash:

```sh
cd reader && npm ci && npx playwright install chromium-headless-shell && npm test && cd ..
./gradlew assembleDebug
```

`npm test` includes the Reader-seam tests, which drive the reader in headless Chromium (the engine behind the TV's WebView) with the remote's keys; the Playwright step downloads that browser once.

Gradle also rebuilds the reader (`npm run build`) on every build, so after the first `npm ci` you only need the Gradle command. If JDK 17 isn't your default Java, set `JAVA_HOME` for the session, for example `$env:JAVA_HOME = "$HOME\tools\jdk-17.0.20.1+1"` in PowerShell.

GitHub Actions runs the same steps on every push. You can download the APK from the run's **read-instead-debug-apk** artifact.

## Installing test builds on the TV (ADB over Wi-Fi)

One-time TV setup:

1. **Settings → System → About**, then press OK on **Android TV OS build** 7 times to enable Developer options.
2. **Settings → System → Developer options**: turn on **USB debugging** and **Wireless debugging**.
3. In **Wireless debugging**, choose **Pair device with pairing code**. On the PC:
   ```sh
   adb pair <tv-ip>:<pairing-port> <6-digit-code>
   ```

Each time you want to install a build (the same commands work in PowerShell; `adb.exe` lives in `%LOCALAPPDATA%\Android\Sdk\platform-tools`):

```sh
adb connect <tv-ip>:<port shown under Wireless debugging>
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n io.github.sahithchiluveru.readinstead/.MainActivity
```

The pairing is remembered. The connect port can change after the TV restarts, so check it in the Wireless debugging screen (or run `adb mdns services`). Use the SDK's `platform-tools/adb`: very old adb versions (1.0.32) can't pair.

Reader console output goes to logcat under the `ReadInstead` tag. Page-turn timings are logged as `[turn] ...`:

```sh
adb logcat -s ReadInstead:*
```
