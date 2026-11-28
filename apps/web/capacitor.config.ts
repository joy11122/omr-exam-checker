import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();
let server: CapacitorConfig["server"];

if (serverUrl) {
  const parsed = new URL(serverUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("CAPACITOR_SERVER_URL must use HTTPS outside local development.");
  }
  server = {
    url: parsed.origin,
    cleartext: false,
    allowNavigation: [parsed.hostname],
  };
}

const config: CapacitorConfig = {
  appId: "com.omrexamchecker.app",
  appName: "OMR Exam Checker",
  webDir: "../../www",
  android: {
    backgroundColor: "#f8f9fb",
    allowMixedContent: false,
  },
  plugins: {
    SocialLogin: { providers: { google: true, apple: false, facebook: false, twitter: false } },
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: "#f8f9fb",
    },
  },
  ...(server ? { server } : {}),
};

export default config;
