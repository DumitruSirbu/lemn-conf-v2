import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_WIDTH_MM,
  NARROWEST_CATALOG_WIDTH_MM,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  snapshotSubmission,
  validateContactFields,
  type ContactFields,
  type ContactFieldsInput,
  type Design,
  type DesignPlacement,
  type DesignWall,
  type Finish,
  type Handle,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";

import type {
  LeadNoticeInput,
  NoticeKitchenLink,
} from "@/lib/server/mail/lead-notification";
import type { PublicOriginOutcome } from "@/lib/server/public-origin";

import { ro } from "../../../support/romanian-content";
import {
  VARIED_L_ARM,
  VARIED_U_ARM,
  variedKitchensOf,
  type VariedArm,
} from "../../../support/varied-kitchens";
import { MEASURED_DEEPENING_ROWS } from "../../../support/deepening-rows";
import { NOTHING_DISABLED } from "../../../support/availability";

// Fictitious throughout: the origin is a reserved name that resolves nowhere, the numbers are no one's.
export const FIXTURE_ORIGIN = "https://example.invalid";
export const FIXTURE_TOKEN = "Fixture0Tok1";
export const FIXTURE_KITCHEN_URL = `${FIXTURE_ORIGIN}/ro/s/${FIXTURE_TOKEN}`;
export const FIXTURE_PUBLIC_ORIGIN: PublicOriginOutcome = {
  status: "configured",
  origin: FIXTURE_ORIGIN,
};
export const FIXTURE_REFERENCE = "LM-FIXT2345";
export const FIXTURE_REQUEST_ID = "fixture_request_000001";
export const FIXTURE_REVISION = "7";

export const KITCHEN_LINK: NoticeKitchenLink = {
  kind: "link",
  url: FIXTURE_KITCHEN_URL,
};
export const NO_LINK: NoticeKitchenLink = { kind: "unavailable" };

export function fixtureContact(
  overrides: ContactFieldsInput = {},
): ContactFields {
  const result = validateContactFields({
    name: "Ion Exemplu",
    phone: "069 000 123",
    locality: "Orhei",
    channel: "whatsapp",
    consent: true,
    consentTextVersion: "placeholder",
    ...overrides,
  });
  if (!result.ok) throw new Error("the fixture contact is not valid");
  return result.contact;
}

export function snapshotOf(design: Design): SubmissionSnapshot | undefined {
  const result = snapshotSubmission({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
  return result.ok ? result.snapshot : undefined;
}

/** The arm's kitchens the domain would store, each with its snapshot. */
export function sendableKitchensOf(arm: VariedArm): readonly {
  readonly design: Design;
  readonly snapshot: SubmissionSnapshot;
}[] {
  return variedKitchensOf(arm).flatMap(({ design }) => {
    const snapshot = snapshotOf(design);
    return snapshot === undefined ? [] : [{ design, snapshot }];
  });
}

function firstSendable(arm: VariedArm): SubmissionSnapshot {
  const [first] = sendableKitchensOf(arm);
  if (first === undefined) throw new Error("the arm has no sendable kitchen");
  return first.snapshot;
}

export const L_SNAPSHOT = firstSendable(VARIED_L_ARM);
export const U_SNAPSHOT = firstSendable(VARIED_U_ARM);

const OWN_FINISH: Finish = { kind: "palette-entry", entryId: "pal.antracit" };
const OWN_HANDLES: readonly Handle[] = ["steel", "black", "push"];

/** Every body dressed, so each row carries the most facts the review gives. */
export function dressed(design: Design): Design {
  return {
    ...design,
    placements: design.placements.map((placement, index) => ({
      ...placement,
      body: {
        ...placement.body,
        finish: OWN_FINISH,
        handle: OWN_HANDLES[index % OWN_HANDLES.length],
      },
    })),
  };
}

/**
 * The densest kitchen a stored document can hold without two bodies overlapping: a U with every wall at the longest
 * run the schema allows, each band of the generated U's own bodies (a base cabinet, a wall cabinet and a top one)
 * narrowed to the catalogue's narrowest width and packed edge to edge. Walls B and C start past wall A's cabinets.
 */
export function densestUKitchen(): Design {
  const [generated] = sendableKitchensOf(VARIED_U_ARM);
  if (generated === undefined) throw new Error("the U arm has no kitchen");
  const { design } = generated;
  const room = {
    ...design.room,
    widthMm: MAX_ROOM_WIDTH_MM,
    depthMm: MAX_ROOM_DEPTH_MM,
    wallCMm: MAX_ROOM_DEPTH_MM,
  };
  const depthMm = cabinetDepthMmOf(design);
  const runs: readonly (readonly [DesignWall, number, number])[] = [
    ["A", 0, room.widthMm],
    ["B", depthMm, room.depthMm],
    ["C", depthMm, room.wallCMm],
  ];
  const bands = bandTemplatesOf(design);
  const placements = runs.flatMap(([wall, startMm, endMm]) =>
    bands.flatMap((band) => packedRun({ wall, startMm, endMm, band })),
  );
  return {
    ...design,
    room,
    emptyColumns: [],
    columnExtents: [],
    placements: placements.map((placement, index) => ({
      ...placement,
      id: `dense-${String(index)}`,
    })),
  };
}

/** One body of the generated kitchen for each band it fills, by build: the floor's cabinet and the two wall rows. */
function bandTemplatesOf(design: Design): readonly DesignPlacement[] {
  const byBand = new Map<number, DesignPlacement>();
  for (const placement of design.placements) {
    const isPlainCabinet =
      placement.body.buildId === "base-cabinet" ||
      placement.body.buildId === "wall-cabinet";
    if (isPlainCabinet && !byBand.has(placement.y0Mm)) {
      byBand.set(placement.y0Mm, placement);
    }
  }
  const templates = [...byBand.values()];
  if (templates.length !== 3)
    throw new Error("the generated U does not fill three bands with cabinets");
  return templates;
}

interface PackedRun {
  readonly wall: DesignWall;
  readonly startMm: number;
  readonly endMm: number;
  readonly band: DesignPlacement;
}

function packedRun({
  wall,
  startMm,
  endMm,
  band,
}: PackedRun): DesignPlacement[] {
  const widthMm = NARROWEST_CATALOG_WIDTH_MM;
  const count = Math.floor((endMm - startMm) / widthMm);
  return Array.from({ length: count }, (_unused, slot) => ({
    ...band,
    wall,
    alongMm: startMm + widthMm * (slot + 0.5),
    body: { ...band.body, widthMm },
  }));
}

export function designSubmission(
  overrides: Partial<ContactSubmissionToRecord> = {},
): ContactSubmissionToRecord {
  return {
    clientRequestId: FIXTURE_REQUEST_ID,
    payloadDigest: "f".repeat(64),
    contact: fixtureContact(),
    locale: "ro",
    target: {
      kind: "design",
      design: { id: "design-fixture", revision: FIXTURE_REVISION },
    },
    snapshot: L_SNAPSHOT,
    ...overrides,
  };
}

export function callbackSubmission(
  overrides: Partial<ContactSubmissionToRecord> = {},
): ContactSubmissionToRecord {
  return designSubmission({
    target: { kind: "intent", intent: "callback" },
    snapshot: undefined,
    ...overrides,
  });
}

export function noticeInput(
  submission: ContactSubmissionToRecord,
  kitchenLink: NoticeKitchenLink = KITCHEN_LINK,
): LeadNoticeInput {
  return {
    reference: FIXTURE_REFERENCE,
    submission,
    content: ro,
    kitchenLink,
    publicOrigin: FIXTURE_PUBLIC_ORIGIN,
  };
}

/** A name and a locality made of what markup, a script and an attribute would need, with nothing that breaks a line. */
export const HOSTILE_NAME = `Ion <script>alert("x")</script> & 'O'Brien' </td><img src=x onerror=y>`;
export const HOSTILE_LOCALITY = `Balti "><a href="javascript:alert(1)">x</a> {{name}}`;

export interface LeadNoticeFixture {
  readonly name: string;
  readonly input: LeadNoticeInput;
}

/** What the owner's preview renders: each variant a reader of the shop's inbox can meet. */
export const LEAD_NOTICE_FIXTURES: readonly LeadNoticeFixture[] = [
  {
    name: "design-with-link",
    input: noticeInput(designSubmission()),
  },
  {
    name: "design-link-unavailable",
    input: noticeInput(
      designSubmission({ contact: fixtureContact({ channel: "phone" }) }),
      NO_LINK,
    ),
  },
  {
    name: "special-characters",
    input: noticeInput(
      designSubmission({
        contact: {
          ...fixtureContact(),
          name: HOSTILE_NAME,
          locality: HOSTILE_LOCALITY,
        },
      }),
    ),
  },
  {
    name: "russian-client",
    input: noticeInput(designSubmission({ locale: "ru" })),
  },
  {
    name: "email-channel-u-kitchen",
    input: noticeInput(
      designSubmission({
        contact: fixtureContact({
          channel: "email",
          email: "ion.exemplu+oferta@example.invalid",
          locality: "",
        }),
        snapshot: U_SNAPSHOT,
      }),
    ),
  },
  {
    name: "callback",
    input: noticeInput(callbackSubmission()),
  },
];

export function fixtureNamed(name: string): LeadNoticeInput {
  const fixture = LEAD_NOTICE_FIXTURES.find(
    (candidate) => candidate.name === name,
  );
  if (fixture === undefined) throw new Error(`no fixture named ${name}`);
  return fixture.input;
}
