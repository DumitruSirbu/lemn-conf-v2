import { createHash } from "node:crypto";

import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import {
  FakeContactSubmissionStore,
  type ContactSubmissionStore,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { vi } from "vitest";

import {
  createFakeMailSender,
  type FakeMailSender,
} from "@/lib/server/mail/fake-mail-sender";
import type { MailOutcome, MailSender } from "@/lib/server/mail/mail-sender";
import type { OwnedDesignLoad } from "@/lib/server/load-owned-design";
import { PRICE_STORES_GLOBAL_KEY } from "@/lib/server/price-stores";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

// What the adversarial files of the contact route share: a request whose every value is invented and recognisable, the
// three things that reach outside the process as fakes a test can script, and the route loaded on a module graph of
// its own, so that what one test made the process write once is not what the next finds written.

/** Every value a customer or a browser could send, each recognisable wherever it must not appear. */
export const MARKER = {
  name: "Qazim Markerperson 7c41",
  phone: "069 741 852",
  phoneDigits: "69741852",
  locality: "Markerville 7c41",
  address: "Marker.7c41@Example.invalid",
  requestId: "qa8k_marker_request_7c41",
  designId: "qa8kMarkerDesign7c41_",
  networkAddress: "203.0.113.41",
  visitorValue: "qa8kMarkerVisitor7c41".padEnd(43, "v"),
} as const;

export const MARKER_VISITOR_HASH = createHash("sha256")
  .update(MARKER.visitorValue, "utf8")
  .digest("hex");

/** What no answer and no line may hold, whatever the branch. */
export const SUBMITTED_MARKERS: readonly string[] = [
  MARKER.name,
  "Markerperson",
  MARKER.phone,
  MARKER.phoneDigits,
  MARKER.locality,
  MARKER.address,
  MARKER.address.toLowerCase(),
  MARKER.requestId,
  MARKER.designId,
  MARKER.networkAddress,
  MARKER.visitorValue,
  MARKER_VISITOR_HASH,
];

export const STORED_REVISION = "1";
const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const ROUTE_ADDRESS = "https://lemnaria.test/api/contact-submissions";
const NETWORK_SOURCE_VARIABLE = "CLIENT_NETWORK_SOURCE";
const MINUTE_MS = 60_000;
const REQUEST_ID_LENGTH = 40;

export type Fields = Record<string, unknown>;

/** A design's request the form could send. `contact` overrides are merged into the contact, the rest replace. */
export function designRequest(
  overrides: Fields = {},
  contact: Fields = {},
): Fields {
  return {
    contact: {
      name: MARKER.name,
      phone: MARKER.phone,
      locality: MARKER.locality,
      channel: "phone",
      consent: true,
      consentTextVersion: "placeholder",
      ...contact,
    },
    design: { id: MARKER.designId, revision: STORED_REVISION },
    clientRequestId: MARKER.requestId,
    locale: "ro",
    honeypot: "",
    elapsedMs: 12_000,
    ...overrides,
  };
}

/** The same request with no design: a callback. */
export function callbackRequest(
  overrides: Fields = {},
  contact: Fields = {},
): Fields {
  const request = designRequest(overrides, contact);
  const withoutDesign = Object.fromEntries(
    Object.entries(request).filter(([key]) => key !== "design"),
  );
  return { ...withoutDesign, intent: "callback", ...overrides };
}

export function byEmail(address: string = MARKER.address): Fields {
  return { channel: "email", email: address };
}

/** A request id of the schema's shape that no other test of the file uses. */
export function requestIdOf(label: string): string {
  return `qa8k_${label}_`.padEnd(REQUEST_ID_LENGTH, "x");
}

/** The three things of the route that reach outside the process, as a test scripts them. */
export interface Outside {
  store: ContactSubmissionStore;
  heldStore: FakeContactSubmissionStore;
  sender: MailSender;
  fakeSender: FakeMailSender;
  load: (designId: string) => Promise<OwnedDesignLoad>;
  /** Every design id the owned load was asked for. */
  loadsAsked: string[];
}

export function found(
  design: Design = KITCHEN_L_DESIGN,
  revision: string = STORED_REVISION,
): OwnedDesignLoad {
  return { kind: "found", design, revision };
}

/** A store that holds what it is given, a sender that accepts unless scripted, and the caller's own design. */
export function resetOutside(
  outside: Outside,
  outcomes: readonly MailOutcome[] = [],
): void {
  outside.heldStore = new FakeContactSubmissionStore();
  outside.store = outside.heldStore;
  outside.fakeSender = createFakeMailSender(outcomes);
  outside.sender = outside.fakeSender;
  outside.loadsAsked = [];
  outside.load = (designId) => {
    outside.loadsAsked.push(designId);
    return Promise.resolve(found());
  };
}

export type StoreStep = "lookUp" | "record" | "markNotified";

/** The store as it is, but for one step, which rejects with `thrown`. */
export function failTheStoreAt(
  outside: Outside,
  step: StoreStep,
  thrown: Error,
): void {
  const held = outside.heldStore;
  outside.store = {
    lookUp: held.lookUp.bind(held),
    record: held.record.bind(held),
    markNotified: held.markNotified.bind(held),
    [step]: () => Promise.reject(thrown),
  };
}

export type Post = (request: NextRequest) => Promise<Response>;

/**
 * The process's price stores, seeded with the sample book as a deployment-free test run seeds them. These files name
 * `CLIENT_NETWORK_SOURCE`, a variable only a deployment has, so the store selection would otherwise choose the real stores
 * (which answer "unavailable") and every design request would be refused before it reached what the file is about.
 */
async function plantSeededPriceStores(): Promise<void> {
  const { seedFakePriceStores } = await import(
    "@/lib/server/price-book-test-seed"
  );
  Reflect.set(globalThis, PRICE_STORES_GLOBAL_KEY, seedFakePriceStores());
}

/** The route on a fresh module graph: nothing the process has "already written once" is carried into it. */
export async function loadRoute(): Promise<Post> {
  vi.resetModules();
  await plantSeededPriceStores();
  const route = await import(
    "../../../../src/app/api/contact-submissions/route"
  );
  return route.POST;
}

export interface Sending {
  /** `undefined` removes a header the default would send. */
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly withVisitor?: boolean;
}

/** A same-origin JSON request from the marker network address, as a browser's `fetch` would send it. */
export function contactRequest(
  body: BodyInit | null,
  { headers = {}, withVisitor = false }: Sending = {},
): NextRequest {
  const sent: Record<string, string | undefined> = {
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    "x-forwarded-for": MARKER.networkAddress,
    ...(withVisitor
      ? { cookie: `${VISITOR_COOKIE_NAME}=${MARKER.visitorValue}` }
      : {}),
    ...headers,
  };
  const present = Object.entries(sent).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return new NextRequest(ROUTE_ADDRESS, {
    method: "POST",
    body,
    headers: present,
  });
}

export function send(
  post: Post,
  fields: Fields,
  sending: Sending = {},
): Promise<Response> {
  return post(contactRequest(JSON.stringify(fields), sending));
}

/** The server names a network source, so each request is counted under its own address's block. */
export function nameTheNetworkSource(): void {
  vi.stubEnv(NETWORK_SOURCE_VARIABLE, "vercel");
}

export function nameNoNetworkSource(): void {
  vi.stubEnv(NETWORK_SOURCE_VARIABLE, undefined);
}

/** Every bucket the limiter was asked to count, in order, as the length of its window in minutes. */
export function watchCountedWindows(): () => number[] {
  const recording = vi.spyOn(getRateLimitStore(), "recordHits");
  return () =>
    recording.mock.calls.flatMap(([buckets]) =>
      buckets.map(
        ({ window }) =>
          (window.endsAt.getTime() - window.startsAt.getTime()) / MINUTE_MS,
      ),
    );
}

/** The counter store refuses from its `failingFrom`-th call on (counted from one). */
export function failCountersFrom(failingFrom: number): void {
  const store = getRateLimitStore();
  const record = store.recordHits.bind(store);
  let calls = 0;
  vi.spyOn(store, "recordHits").mockImplementation((buckets) => {
    calls += 1;
    return calls >= failingFrom
      ? Promise.reject(new Error(`counters down for ${MARKER.name}`))
      : record(buckets);
  });
}

export interface Wire {
  readonly status: number;
  readonly headers: readonly (readonly [string, string])[];
  readonly body: string;
}

/** An answer as it leaves: its status, every header and its body's text. */
export async function wireOf(answer: Response): Promise<Wire> {
  return {
    status: answer.status,
    headers: [...answer.headers].sort(([a], [b]) => a.localeCompare(b)),
    body: await answer.clone().text(),
  };
}

/** The same, with the one header a limit's answers may differ in taken out. */
export async function wireWithoutTheWait(answer: Response): Promise<Wire> {
  const wire = await wireOf(answer);
  return {
    ...wire,
    headers: wire.headers.filter(([name]) => name !== "retry-after"),
  };
}

export async function codeOf(answer: Response): Promise<unknown> {
  return ((await answer.clone().json()) as { code?: unknown }).code;
}

export async function referenceOf(answer: Response): Promise<unknown> {
  return ((await answer.clone().json()) as { reference?: unknown }).reference;
}
