import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaClient from "./pwa";

export const metadata: Metadata = {
  title: "첫자리 — 영화 예매 알림",
  description: "CGV, 롯데시네마, 메가박스. 기다리는 영화의 예매 알림 조건을 한곳에.",
  manifest: "/manifest.webmanifest",
  applicationName: "첫자리",
  appleWebApp: { capable: true, title: "첫자리", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#10141d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body className="antialiased">{children}<PwaClient /></body></html>;
}
