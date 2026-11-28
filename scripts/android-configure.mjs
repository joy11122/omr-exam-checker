import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

const javaDirectory = resolve("android/app/src/main/java/com/omrexamchecker/app");
await mkdir(javaDirectory, { recursive: true });
const javaPath = resolve(javaDirectory, "MainActivity.java");
const kotlinPath = resolve(javaDirectory, "MainActivity.kt");
await rm(kotlinPath, { force: true });
const mainActivity = `package com.omrexamchecker.app;

import android.content.Intent;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.w("Google Activity Result", "SocialLogin plugin handle is unavailable");
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.w("Google Activity Result", "SocialLogin plugin instance has an unexpected type");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Required by the native Google Credential Manager plugin.
    }
}
`;
await writeFile(javaPath, mainActivity, "utf8");
console.log("Android MainActivity configured for native Google Credential Manager sign-in.");
