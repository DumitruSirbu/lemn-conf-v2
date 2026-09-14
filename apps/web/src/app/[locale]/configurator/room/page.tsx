import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { routing } from "@/i18n/routing";
import { RoomScreen } from "@/room/room-screen";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // The route is a shell and nothing else (M7 criterion 17): one client component, no copy key, no
  // field, no style, no `"use client"` — which is what keeps the whole of Step 1's surface under
  // `src/room`, where the wave's lint gates read it.
  //
  // **It parses nothing, on purpose** (ruling R9). Next reuses a page segment on a back/forward
  // navigation, so a parse made here and handed down would describe the entry the customer left
  // rather than the one they are looking at; the screen reads `useSearchParams` instead, and D5 is
  // unrepresentable because there is no second reading of the URL to believe.
  //
  // `connection()` is what keeps the route out of the prerender manifest now that no request-time
  // input is consumed here (`next/dist/docs/01-app/03-api-reference/04-functions/connection.md`).
  // It replaces an `await searchParams` whose only remaining job was that side effect — a read
  // nobody used, which the next reader would have deleted as dead and silently made the route
  // static. `next build`'s route table is the check, not this comment.
  await connection();
  return <RoomScreen />;
}
