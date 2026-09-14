import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { RoomScreen } from "@/room/room-screen";
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

  // The route stays a shell (M7 criterion 17): it resolves the query and renders one client
  // component. No copy key, no field, no style and no `"use client"` — which is what keeps the whole
  // of Step 1's surface under `src/room`, where the wave's lint gates read it.
  //
  // The query travels beside the state it was parsed into, because the sub-states record which
  // fields are still to be filled but not the lengths that already read, and 1B's fields have to
  // show what the URL already holds. Reading it twice on the client — or carrying a second copy
  // anywhere — is what this prop exists instead of.
  const query = await searchParams;
  const state = parseRoomUrlState(query);
  return (
    <main
      data-room-substate={state.substate}
      data-marked-fields={state.markedFields.join(",")}
    >
      <RoomScreen state={state} query={query} />
    </main>
  );
}
