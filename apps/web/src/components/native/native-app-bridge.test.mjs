import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../../../capacitor.config.ts", import.meta.url), "utf8");
const androidSetup = await readFile(new URL("../../../../../scripts/android-configure.mjs", import.meta.url), "utf8");
const bridge = await readFile(new URL("./native-app-bridge.tsx", import.meta.url), "utf8");

test("Capacitor app identity is Android-only and uses the local web fallback", () => {
  assert.match(config, /appId: "com\\.omrexamchecker\\.app"/);
  assert.match(config, /webDir: "..\\/..\\/www"/);
  assert.match(config, /CAPACITOR_SERVER_URL/);
  assert.doesNotMatch(config, /ios:/);
});

test("Android setup configures the custom deep link and stock Capacitor activity", () => {
  assert.match(androidSetup, /omrexamchecker/);
  assert.match(androidSetup, /android\\.intent\\.action\\.VIEW/);
  assert.match(androidSetup, /android\\.intent\\.category\\.BROWSABLE/);
  assert.match(androidSetup, /extends BridgeActivity/);
  assert.doesNotMatch(androidSetup, /ModifiedMainActivityForSocialLoginPlugin/);
});

test("native bridge handles Android back, camera restoration, and app links", () => {
  assert.match(bridge, /backButton/);
  assert.match(bridge, /appRestoredResult/);
  assert.match(bridge, /omr-native-camera-restored/);
  assert.match(bridge, /appUrlOpen/);
});
