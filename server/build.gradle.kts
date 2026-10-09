// The Phone API: an HTTP server embedded in the TV app, kept free of Android APIs so its
// tests run on a plain JVM (Seam 1 in the spec).
plugins {
    id("org.jetbrains.kotlin.jvm")
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation("io.ktor:ktor-server-core:3.0.1")
    implementation("io.ktor:ktor-server-cio:3.0.1")
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}
