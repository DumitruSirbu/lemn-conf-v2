// **The departure state machine's own harness** — M7 wave 7F2, criterion 13.
//
// Until 7F2 the departure sequences were driven through the screen's *Continuă* over a draft the
// domain refuses: the only way to tap it twice, because on a room the domain accepts the first tap
// replaces the form with sub-state 1F. 7F2 makes that button inactive at 1C (ADR 0120 decision 4),
// so the sequences are re-homed here: the real `useRoomQuerySync`, its real `departTo`, and nothing
// of the screen around it — no composition to take the form away, and no *Continuă* to be refused.
//
// It draws exactly what those tests touch: an input per field the draft's shape asks for, carrying
// the screen's own test ids so a test types and reads through the same helpers it always has, and
// one button per destination. The render must sit inside a `NextIntlClientProvider`, because the
// router `departTo` pushes through is next-intl's.
import type { RoomShape } from "@lemnaria/configurator-domain";
import { createElement, Fragment, type ReactElement } from "react";

import { withEnteredText } from "@/room/room-draft";
import { useRoomQuerySync } from "@/room/room-query-sync";
import { requiredFieldsFor } from "@/room/room-url-state";

/** The probe's stand-in for *Continuă*: `departTo("presets")` and nothing else. */
export const DEPART_TO_PRESETS = "probe-depart-presets";

/** The probe's stand-in for *Înapoi*: `departTo("shapes")` and nothing else. */
export const DEPART_TO_SHAPES = "probe-depart-shapes";

export interface DepartureProbeProps {
  /** The first draft's shape, as the screen hands it to the sync. */
  readonly seedShape: RoomShape;
}

export function DepartureProbe({
  seedShape,
}: DepartureProbeProps): ReactElement {
  const { draft, setDraft, departTo } = useRoomQuerySync(seedShape);

  return createElement(
    Fragment,
    null,
    ...requiredFieldsFor(draft.shape).map((field) =>
      createElement("input", {
        key: field,
        "data-testid": `room-length-${field}`,
        value: draft.lengths[field].text,
        onChange: (event: { readonly target: HTMLInputElement }) => {
          setDraft(withEnteredText(draft, { field, text: event.target.value }));
        },
      }),
    ),
    createElement("button", {
      key: DEPART_TO_PRESETS,
      type: "button",
      "data-testid": DEPART_TO_PRESETS,
      onClick: () => {
        departTo("presets");
      },
    }),
    createElement("button", {
      key: DEPART_TO_SHAPES,
      type: "button",
      "data-testid": DEPART_TO_SHAPES,
      onClick: () => {
        departTo("shapes");
      },
    }),
  );
}
