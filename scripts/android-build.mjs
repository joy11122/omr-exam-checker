import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const isWindows = process.platform === "win32";
const executable = isWindows ? "gradlew.bat" : "./gradlew";
const result = spawnSync(executable, ["assembleDebug"], {
  cwd: resolve("android"),
  stdio: "inherit",
  shell: isWindows,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
