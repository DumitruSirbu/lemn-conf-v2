import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ro } from "@/content/ro";

import "./globals.css";

export const metadata: Metadata = {
  title: `${ro.brand} — configurator bucătărie`,
  description: "Configurează-ți bucătăria direct în model.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#faf8f4",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
