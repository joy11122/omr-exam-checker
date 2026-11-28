# Phase 13 — Android app packaging with Capacitor

## Android identity

- App name: OMR Exam Checker
- Android application ID: com.omrexamchecker.app
- Deep-link scheme: omrexamchecker://
- Capacitor major: 8
- Minimum Android API: 24 (Android 7.0) as defined by Capacitor 8
- iOS is intentionally not configured or generated.

The application continues to use the existing Next.js server, Auth.js sessions, MongoDB, and tenant-protected API routes.

## Implemented native capabilities

- Capacitor Android project generation and sync scripts.
- Android app lifecycle integration: native back button, splash screen, status bar, app URL events, and camera restoration after Android process recreation.
- Native OMR camera capture using the Capacitor Camera plugin, with image conversion into the same validated 10 MB upload pipeline used by the web application.
- Android gallery selection remains available through the existing file input.
- Native Google sign-in using Android Credential Manager through @capgo/capacitor-social-login.
- Backend Google ID token signature, audience, expiry and verified-email validation through Google's official google-auth-library.
- Auth.js issues the same server-side JWT session after native Google identity verification; the ID token is not stored in MongoDB or browser storage.
- Custom omrexamchecker:// deep-link intent filter.
- CI Android Gradle debug build and a manually triggered APK build workflow.

## Important hosting architecture limitation

The Next.js app uses server-rendered routes, Auth.js, and server-side MongoDB access. It cannot be exported as a self-contained static Capacitor web bundle without a separate frontend/backend architecture change.

For this phase, Capacitor's server.url is therefore used only for development/debug APK builds to load the deployed HTTPS Next.js app. Capacitor documentation explicitly describes server.url as a live-reload feature and says it is not intended for production. **Do not publish this debug APK to Google Play.** A production Play Store package requires a bundled local web frontend that talks to the secured Next.js API, or a separately approved native-web architecture. This is a deliberate release gate, not something this phase claims to have solved.

## Google OAuth setup

The existing Google Web OAuth client ID is used as the ID-token audience. Configure:

- AUTH_GOOGLE_ID: existing server-side Google Web OAuth client ID.
- AUTH_GOOGLE_SECRET: existing secret for browser-based Auth.js Google OAuth.
- NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID: same Web client ID, exposed only as a public OAuth client identifier.

Create an Android OAuth client in the same Google Cloud project using:
- Package name: com.omrexamchecker.app
- SHA-1 fingerprint from the exact APK signing certificate.

For Play Store distribution, register the Play App Signing SHA-1 as a separate Android OAuth client as well. Debug and release signing certificates have different fingerprints. Never use the Android OAuth client ID as webClientId.

## Local Android development

Requirements:
- Node.js 22 or newer.
- Android Studio 2025.2.1 or newer.
- Android SDK Platform 36 and JDK 21.
- A physical Android device or Android emulator with Google Play services for native Google sign-in.

Commands from repository root:

~~~bash
npm install
npm run android:add
~~~

Set CAPACITOR_SERVER_URL to the deployed HTTPS Next.js app URL before generating/syncing the Android project. Then:

~~~bash
npm run android:sync
npm run android:build
npm run android:open
~~~

The generated android/ folder is a native build output and is not committed by the source-only setup workflow. Generate it locally with npm run android:add or through the Android GitHub Actions workflow.

## GitHub Actions debug APK

Run Actions → Android APK → Run workflow. Supply the canonical HTTPS URL of the deployed Next.js app. The workflow generates the Android project, configures native Google sign-in and deep links, builds a debug APK, and uploads the APK and certificate information.

## Required physical-device acceptance before any release

- Install the debug APK on Android 7+ and a current Android device.
- Test sign-in with email/password and native Google Credential Manager.
- Register the generated debug SHA-1 in Google Cloud and verify Google sign-in with a real account.
- Verify authenticated session persistence, sign-out, expired sessions and institution switching.
- Capture an OMR sheet using the rear camera, kill/recreate the app while the camera activity is open, and verify restored capture handling.
- Upload real JPEG/PNG/WebP photos through the existing server-side validation and private GridFS storage path.
- Verify Android back navigation, status bar, splash screen, keyboard resizing, file picker, print/PDF behavior and all tenant-protected routes.
- Test on a real device over mobile data and Wi-Fi.
- Complete a bundled-web production architecture and signing-key/Play App Signing setup before store release.

A successful Gradle build proves native compilation only; it does not replace physical-device, OAuth, camera, tenant-isolation or production-hosting acceptance.
