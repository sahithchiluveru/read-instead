plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.github.sahithchiluveru.readinstead"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.sahithchiluveru.readinstead"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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
        // Keep books and pdf.js data uncompressed-friendly and fast to stream.
        noCompress += listOf("pdf", "epub", "wasm")
    }
}

// The web reader (reader/) is built with npm and bundled as assets/reader.
val readerDir = rootProject.layout.projectDirectory.dir("reader")
val npm = if (System.getProperty("os.name").startsWith("Windows")) "npm.cmd" else "npm"

val buildReader by tasks.registering(Exec::class) {
    workingDir = readerDir.asFile
    commandLine(npm, "run", "build")
    inputs.dir(readerDir.dir("src"))
    inputs.dir(readerDir.dir("fixtures"))
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
