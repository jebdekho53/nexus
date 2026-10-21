# MATRIX Mobile Controller - Android Native Project

This directory contains the complete native Android project for the **MATRIX Mobile Controller**.

## Features
- **Remote Tatkal Execution:** Schedule, start, or stop bookings running on your Desktop or VPS from your phone.
- **Instant QR Code Delivery:** Receives live payment QR code in real-time within milliseconds.
- **1-Tap UPI Intent:** Automatically handles `upi://pay` links, allowing instant payment via Google Pay, PhonePe, or PayTM installed on the phone.
- **Hardware Acceleration:** Native Chrome WebView with dark Cyber Matrix theme.

## How to Build the APK

### Option 1: Using Android Studio (GUI)
1. Open **Android Studio**.
2. Select **Open an Existing Project** and choose this `android/` folder.
3. Wait for Gradle sync to complete.
4. Go to **Build** -> **Build Bundle(s) / APK(s)** -> **Build APK(s)**.
5. The generated APK will be in:
   `android/app/build/outputs/apk/debug/app-debug.apk`
6. Transfer this APK to any Android phone and install!

### Option 2: Using Command Line (Gradle)
```bash
cd android
./gradlew assembleRelease
```
The output APK will be in `app/build/outputs/apk/release/app-release.apk`.

---

## Direct Web App / PWA (No Build Required)
You can also directly open **`https://matrix.vaidya-gpt.com/mobile`** (or your PC's Wi-Fi IP `http://<PC_IP>:8085/mobile`) in Google Chrome on Android or Safari on iOS, and tap **"Install App" / "Add to Home Screen"**. It installs as a standalone native app on your phone with the Futuristic Blue Matrix icon!
