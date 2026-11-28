"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export function NativeAppBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

    let disposed = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    const register = async (promise: ReturnType<typeof App.addListener>) => {
      const handle = await promise;
      if (disposed) await handle.remove();
      else handles.push(handle);
    };

    void register(App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    }));

    void register(App.addListener("appUrlOpen", ({ url }) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === "omrexamchecker:") {
          window.dispatchEvent(new CustomEvent("omr-native-url-open", { detail: { url } }));
          return;
        }
        if (parsed.origin === window.location.origin) window.location.assign(parsed.href);
      } catch {
        // Ignore malformed or unrelated external intents.
      }
    }));

    void register(App.addListener("appRestoredResult", (event) => {
      if (event.pluginId === "Camera" && event.methodName === "getPhoto" && event.success) {
        window.dispatchEvent(new CustomEvent("omr-native-camera-restored", { detail: event.data }));
      }
    }));

    void StatusBar.setOverlaysWebView({ overlay: false });
    void StatusBar.setStyle({ style: Style.Dark });
    void StatusBar.setBackgroundColor({ color: "#f8f9fb" });
    void SplashScreen.hide();

    return () => {
      disposed = true;
      for (const handle of handles) void handle.remove();
    };
  }, []);

  return null;
}
