import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const androidRoot = resolve("apps/web/android");
const settings = await readFile(resolve(androidRoot, "capacitor.settings.gradle"), "utf8");
const appBuild = await readFile(resolve(androidRoot, "app/capacitor.build.gradle"), "utf8");
const requiredModules = [
  "capacitor-app",
  "capacitor-camera",
  "capacitor-splash-screen",
  "capacitor-status-bar",
  "capgo-capacitor-social-login",
];

for (const moduleName of requiredModules) {
  const include = new RegExp(`include\\s+['"]:${moduleName}['"]`);
  const dependency = new RegExp(`implementation\\s+project\\(['"]:${moduleName}['"]\\)`);
  if (!include.test(settings)) throw new Error(`Capacitor did not include Android module ${moduleName} in capacitor.settings.gradle`);
  if (!dependency.test(appBuild)) throw new Error(`Capacitor did not link Android module ${moduleName} in app/capacitor.build.gradle`);
}

console.log(`Verified ${requiredModules.length} required Android Capacitor plugin modules.`);
