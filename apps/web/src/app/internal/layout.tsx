import type { ReactNode } from "react";

import { routing } from "@/i18n/routing";

import "../globals.css";

export default function InternalLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={routing.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
