import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve("android/app/src/main/AndroidManifest.xml");
let manifest;
try {
  manifest = await readFile(manifestPath, "utf8");
} catch {
  throw new Error("Android project is missing. Run npm run android:add first.");
}

const scheme = "omrexamchecker";
if (!manifest.includes(`android:scheme="${scheme}"`)) {
  const activityPattern = /(<activity\b[^>]*android:name="\.MainActivity"[^>]*>)([\s\S]*?)(<\/activity>)/;
  if (!activityPattern.test(manifest)) {
    throw new Error("Could not find the Capacitor MainActivity in AndroidManifest.xml.");
  }
  manifest = manifest.replace(activityPattern, (_match, open, body, close) =>
    `${open}${body}
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${scheme}" />
            </intent-filter>
        ${close}`,
  );
}

if (!manifest.includes('android:name="android.hardware.camera"')) {
  manifest = manifest.replace(
    "<application",
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n    <application',
  );
}

await writeFile(manifestPath, manifest, "utf8");
console.log("Android manifest configured for OMR Exam Checker and omrexamchecker:// deep links.");
