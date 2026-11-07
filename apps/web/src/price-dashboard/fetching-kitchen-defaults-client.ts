import {
  HandleSchema,
  isRevisionShape,
  ITEM_ID_MEMBER_OF_KIND,
  readStoredNewKitchenSettings,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import { ownValueOf } from "@/staff/staff-kitchens-wire-reading";

import {
  ask,
  CONFLICT_STATUS,
  INVALID_INPUT_STATUS,
  OK_STATUS,
  type Answer,
} from "./dashboard-fetch";
import type {
  DefaultsSaveOutcome,
  KitchenDefaultsClient,
} from "./kitchen-defaults-client";
import {
  DEFAULTS_ROW_ORDER,
  type KitchenDefaultsPageInput,
  type TierOffer,
} from "./kitchen-defaults-model";
import {
  DEFAULTS_REFUSAL_CODES,
  type DashboardIssue,
  type DashboardRequestField,
  type DashboardStateWire,
  type DefaultsRefusalCode,
  type KitchenDefaultsSaveRequestWire,
  type KitchenDefaultsStateWire,
} from "./price-dashboard-wire-contract";
import { FETCHING_PRICE_DRAFT_CLIENT } from "./price-draft-client";

// The defaults client of a build with a server behind the screen. A save goes to `PUT /api/staff/prices/defaults`. The
// facts are read again from two routes: the defaults, with the revisions a save expects, from `GET …/defaults`, and the
// tiers on offer and what is switched off from the dashboard's state. Each answer is believed only when it is the route's
// own: anything else is `failed` for a save and nothing for a read.

const DEFAULTS_ADDRESS = "/api/staff/prices/defaults";

const CHANGED_MEANWHILE = "changed-meanwhile";
const AVAILABILITY_CHANGED_MEANWHILE = "availability-changed-meanwhile";
const ITEM_UNAVAILABLE = "item-unavailable";

const FAILED: DefaultsSaveOutcome = { kind: "failed" };

/** The members a `400` of the defaults save may name: the six values, and the two revisions the request carries. */
const REFUSABLE_MEMBERS: readonly DashboardRequestField[] = [
  ...DEFAULTS_ROW_ORDER,
  "expectedRevision",
  "expectedAvailabilityRevision",
];

type ItemKind = keyof typeof ITEM_ID_MEMBER_OF_KIND;

export const FETCHING_KITCHEN_DEFAULTS_CLIENT: KitchenDefaultsClient = {
  save: async (request: KitchenDefaultsSaveRequestWire) => {
    const answer = await ask(DEFAULTS_ADDRESS, {
      method: "PUT",
      body: JSON.stringify(request),
    });
    return answer === undefined ? FAILED : defaultsSaveOutcomeOf(answer);
  },
  readAgain: readDefaultsPageAgain,
};

// ---------------------------------------------------------------------------------------------------------------------
// A save

/**
 * An answer of the defaults route, sorted: `200` saved, `400` with a member the route names refused, `409` of an
 * unavailable item or of either changed-meanwhile word, and anything else failed. A `401` is failed too: the client's
 * outcomes carry no state of the session, and the page's own session watch ends it.
 */
export function defaultsSaveOutcomeOf({
  status,
  body,
}: Answer): DefaultsSaveOutcome {
  if (status === OK_STATUS) return savedOutcomeOf(body);
  if (status === INVALID_INPUT_STATUS) return invalidOutcomeOf(body);
  if (status === CONFLICT_STATUS) return conflictOutcomeOf(body);
  return FAILED;
}

function savedOutcomeOf(body: unknown): DefaultsSaveOutcome {
  const revision = ownValueOf(body, "revision");
  const availabilityRevision = ownValueOf(body, "availabilityRevision");
  if (!isRevisionShape(revision) || !isRevisionShape(availabilityRevision)) {
    return FAILED;
  }
  return { kind: "saved", saved: { revision, availabilityRevision } };
}

/** The members a `400` names with a code the route has; a `400` that names none of them (`invalid-request`) is failed. */
function invalidOutcomeOf(body: unknown): DefaultsSaveOutcome {
  const declared = ownValueOf(body, "issues");
  if (!Array.isArray(declared)) return FAILED;
  const issues = (declared as readonly unknown[]).flatMap(
    (entry) => issueOf(entry) ?? [],
  );
  return issues.length === 0 ? FAILED : { kind: "invalid", issues };
}

function issueOf(
  entry: unknown,
): DashboardIssue<DefaultsRefusalCode> | undefined {
  const field = REFUSABLE_MEMBERS.find(
    (known) => known === ownValueOf(entry, "field"),
  );
  const code = DEFAULTS_REFUSAL_CODES.find(
    (known) => known === ownValueOf(entry, "code"),
  );
  return field === undefined || code === undefined
    ? undefined
    : { field, code };
}

function conflictOutcomeOf(body: unknown): DefaultsSaveOutcome {
  const word = ownValueOf(body, "status");
  if (word === CHANGED_MEANWHILE || word === AVAILABILITY_CHANGED_MEANWHILE) {
    return { kind: "conflict" };
  }
  if (word !== ITEM_UNAVAILABLE) return FAILED;
  const item = readItemRef(ownValueOf(body, "item"));
  return item === undefined ? FAILED : { kind: "item-unavailable", item };
}

/** The item a `409 item-unavailable` names, rebuilt as its kind and its one id; anything else is not believed. */
function readItemRef(declared: unknown): ItemRef | undefined {
  const kind = ownValueOf(declared, "kind");
  if (
    typeof kind !== "string" ||
    !Object.hasOwn(ITEM_ID_MEMBER_OF_KIND, kind)
  ) {
    return undefined;
  }
  const idMember = ITEM_ID_MEMBER_OF_KIND[kind as ItemKind];
  const id = ownValueOf(declared, idMember);
  if (typeof id !== "string" || id === "") return undefined;
  if (kind === "handle" && !HandleSchema.safeParse(id).success) {
    return undefined;
  }
  return { kind, [idMember]: id } as ItemRef;
}

// ---------------------------------------------------------------------------------------------------------------------
// The facts again

/**
 * The screen's facts from two reads, the defaults first. They are joined only when both state the same availability head:
 * a head that moved between the reads would pair one read's revisions with the other's switched-off items, so the answer
 * is then nothing, and the screen says it could not read them.
 */
async function readDefaultsPageAgain(): Promise<
  KitchenDefaultsPageInput | undefined
> {
  const defaults = await readDefaultsState();
  if (defaults === undefined) return undefined;
  const dashboard = await FETCHING_PRICE_DRAFT_CLIENT.readState();
  return dashboard === undefined ? undefined : joined(defaults, dashboard);
}

async function readDefaultsState(): Promise<
  KitchenDefaultsStateWire | undefined
> {
  const answer = await ask(DEFAULTS_ADDRESS, { method: "GET" });
  return answer?.status === OK_STATUS
    ? readDefaultsStateWire(answer.body)
    : undefined;
}

function joined(
  state: KitchenDefaultsStateWire,
  { active }: DashboardStateWire,
): KitchenDefaultsPageInput | undefined {
  if (active.availability.revision !== state.availabilityRevision) {
    return undefined;
  }
  const materials = tierOffersOf(ownValueOf(active.book, "material"));
  const hardware = tierOffersOf(ownValueOf(active.book, "hardware"));
  const disabled = disabledItemsOf(active.availability);
  if (materials === undefined || hardware === undefined) return undefined;
  return disabled === undefined
    ? undefined
    : { state, materials, hardware, disabled };
}

/** The saved defaults as `GET …/defaults` sends them, all six members, each as the design's settings hold it. */
function readDefaultsStateWire(
  body: unknown,
): KitchenDefaultsStateWire | undefined {
  const revision = ownValueOf(body, "revision");
  const availabilityRevision = ownValueOf(body, "availabilityRevision");
  const saved = ownValueOf(body, "saved");
  if (!isRevisionShape(revision) || !isRevisionShape(availabilityRevision)) {
    return undefined;
  }
  if (typeof saved !== "boolean") return undefined;
  const settings = readStoredNewKitchenSettings(ownValueOf(body, "defaults"));
  if (!settings.ok) return undefined;
  const {
    materialTierId,
    hardwareTierId,
    cabinetDepthMm,
    finish,
    handle,
    topRowHandle,
  } = settings.defaults;
  if (
    materialTierId === undefined ||
    hardwareTierId === undefined ||
    cabinetDepthMm === undefined ||
    finish === undefined ||
    handle === undefined ||
    topRowHandle === undefined
  ) {
    return undefined;
  }
  return {
    revision,
    availabilityRevision,
    saved,
    defaults: {
      materialTierId,
      hardwareTierId,
      cabinetDepthMm,
      finish,
      handle,
      topRowHandle,
    },
  };
}

/** The tiers of one group of the book, each with its id and words; a group that is not a list of tiers is not read. */
function tierOffersOf(group: unknown): readonly TierOffer[] | undefined {
  const tiers = ownValueOf(group, "tiers");
  if (!Array.isArray(tiers)) return undefined;
  const offers = (tiers as readonly unknown[]).map(tierOfferOf);
  return offers.every((offer) => offer !== undefined) ? offers : undefined;
}

function tierOfferOf(tier: unknown): TierOffer | undefined {
  const tierId = ownValueOf(tier, "tierId");
  const name = ownValueOf(tier, "name");
  const nameKey = ownValueOf(tier, "nameKey");
  if (typeof tierId !== "string" || typeof name !== "string") return undefined;
  return typeof nameKey === "string"
    ? { tierId, name, nameKey }
    : { tierId, name };
}

/** What is switched off. One entry that is not an item leaves the whole unread: it could be the one that is on offer. */
function disabledItemsOf(
  availability: unknown,
): readonly ItemRef[] | undefined {
  const declared = ownValueOf(availability, "disabled");
  if (!Array.isArray(declared)) return undefined;
  const items = (declared as readonly unknown[]).map(readItemRef);
  return items.every((item) => item !== undefined) ? items : undefined;
}
