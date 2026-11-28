import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { NativeAppBridge } from "@/components/native/native-app-bridge";

export const metadata: Metadata = {
  title: "OMR Exam Checker",
  description:
    "A reliable OMR examination management platform for educational institutions.",
  applicationName: "OMR Exam Checker",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><NativeAppBridge />{children}</body>
    </html>
  );
}
