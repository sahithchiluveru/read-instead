plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing and versioning come from environment variables or Gradle properties
// (-P or ~/.gradle/gradle.properties), never from the repo. CI sets them from GitHub secrets;
// see "Releases" in the README.
fun releaseSetting(name: String): String? =
    (System.getenv(name) ?: providers.gradleProperty(name).orNull)?.takeIf { it.isNotBlank() }

val signingSettings = listOf(
    "READ_INSTEAD_KEYSTORE",
    "READ_INSTEAD_KEYSTORE_PASSWORD",
    "READ_INSTEAD_KEY_ALIAS",
    "READ_INSTEAD_KEY_PASSWORD",
).associateWith { releaseSetting(it) }
val releaseSigned = signingSettings.values.all { it != null }
if (!releaseSigned && signingSettings.values.any { it != null }) {
    val missing = signingSettings.filterValues { it == null }.keys
    throw GradleException("Release signing is partly configured; also set ${missing.joinToString()}.")
}

// Every release must have a higher versionCode than the last, or Android refuses the upgrade.
// CI passes the workflow run number.
val appVersionCode = releaseSetting("READ_INSTEAD_VERSION_CODE")?.toInt() ?: 1

android {
    namespace = "io.github.sahithchiluveru.readinstead"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.sahithchiluveru.readinstead"
        minSdk = 28
        targetSdk = 35
        versionCode = appVersionCode
        versionName = "0.1.$appVersionCode"
    }

    signingConfigs {
        if (releaseSigned) {
            create("release") {
                storeFile = file(signingSettings.getValue("READ_INSTEAD_KEYSTORE")!!)
                storePassword = signingSettings.getValue("READ_INSTEAD_KEYSTORE_PASSWORD")
                keyAlias = signingSettings.getValue("READ_INSTEAD_KEY_ALIAS")
                keyPassword = signingSettings.getValue("READ_INSTEAD_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (releaseSigned) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/reader-assets"))
    androidResources {
        // Keep pdf.js's WebAssembly uncompressed and fast to stream.
        noCompress += listOf("wasm")
    }
}

// Without the release key, assembleRelease still works but builds app-release-unsigned.apk,
// which the TV won't install. Use the debug APK for local testing.
if (!releaseSigned) {
    gradle.taskGraph.whenReady {
        if (allTasks.any { it.path == ":app:packageRelease" }) {
            logger.warn("Release signing is not configured, so the release APK will be unsigned.")
        }
    }
}

// The web reader (reader/) is built with npm and bundled as assets/reader.
val readerDir = rootProject.layout.projectDirectory.dir("reader")
val npm = if (System.getProperty("os.name").startsWith("Windows")) "npm.cmd" else "npm"

val buildReader by tasks.registering(Exec::class) {
    workingDir = readerDir.asFile
    commandLine(npm, "run", "build")
    inputs.dir(readerDir.dir("src"))
    inputs.file(readerDir.file("package-lock.json"))
    inputs.file(readerDir.file("scripts/build.mjs"))
    outputs.dir(readerDir.dir("dist"))
}

val copyReader by tasks.registering(Sync::class) {
    dependsOn(buildReader)
    from(readerDir.dir("dist"))
    into(layout.buildDirectory.dir("generated/reader-assets/reader"))
}

tasks.named("preBuild") { dependsOn(copyReader) }

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation(project(":server"))
}
