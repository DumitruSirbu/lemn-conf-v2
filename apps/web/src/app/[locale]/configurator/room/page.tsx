import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import {
  parseRoomUrlState,
  type RoomSearchParams,
} from "@/room/room-url-state";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RoomSearchParams>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const state = parseRoomUrlState(await searchParams);
  return (
    <main
      data-room-substate={state.substate}
      data-marked-fields={state.markedFields.join(",")}
    >
      <section data-room-state={state.substate} />
    </main>
  );
}
