import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../../../capacitor.config.ts", import.meta.url), "utf8");
const androidSetup = await readFile(new URL("../../../../../scripts/android-configure.mjs", import.meta.url), "utf8");
const bridge = await readFile(new URL("./native-app-bridge.tsx", import.meta.url), "utf8");

test("Capacitor app identity is Android-only and uses the local web fallback", () => {
  assert.ok(config.includes('appId: "com.omrexamchecker.app"'));
  assert.ok(config.includes('webDir: "../../www"'));
  assert.ok(config.includes("CAPACITOR_SERVER_URL"));
  assert.ok(!config.includes("ios:"));
});

test("Android setup configures the custom deep link and stock Capacitor activity", () => {
  assert.ok(androidSetup.includes("omrexamchecker"));
  assert.ok(androidSetup.includes("android.intent.action.VIEW"));
  assert.ok(androidSetup.includes("android.intent.category.BROWSABLE"));
  assert.ok(androidSetup.includes("extends BridgeActivity"));
  assert.ok(!androidSetup.includes("ModifiedMainActivityForSocialLoginPlugin"));
});

test("native bridge handles Android back, camera restoration, and app links", () => {
  assert.ok(bridge.includes("backButton"));
  assert.ok(bridge.includes("appRestoredResult"));
  assert.ok(bridge.includes("omr-native-camera-restored"));
  assert.ok(bridge.includes("appUrlOpen"));
});
