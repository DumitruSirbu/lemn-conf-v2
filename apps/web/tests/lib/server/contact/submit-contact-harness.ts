import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type Design,
} from "@lemnaria/configurator-domain";
import {
  FakeAccountKitchenStore,
  FakeContactSubmissionStore,
  FakeSentKitchenViewRepository,
  FakeSentMarkStore,
  type ContactSubmissionStore,
  type SentKitchenViewRepository,
} from "@lemnaria/persistence";
import { vi } from "vitest";

import { makeContactJudge } from "@/lib/server/contact/judge-contact-request";
import {
  submitContact,
  type ContactBody,
  type SubmitContactPorts,
} from "@/lib/server/contact/submit-contact";
import { readDigester } from "@/lib/server/digest/digest-secret";
import {
  createFakeMailSender,
  type FakeMailSender,
} from "@/lib/server/mail/fake-mail-sender";
import type { MailOutcome } from "@/lib/server/mail/mail-sender";
import type { PublicOriginOutcome } from "@/lib/server/public-origin";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

import { ro } from "../../../support/romanian-content";

export const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
export const DESIGN_ID = "abcdefghijklmnopqrstu";
export const REQUEST_ID = "req_0123456789abcdef";
export const VISITOR_HASH = "ab".repeat(32);
export const NAME_MARKER = "Zorba Fakeperson";
export const EMAIL_MARKER = "Zorba.Fake@Example.invalid";
export const PLACEHOLDER_REFERENCE = "LM-00000000";
export const PUBLIC_ORIGIN = "https://lemnaria.example";
export const CONFIGURED_ORIGIN: PublicOriginOutcome = {
  status: "configured",
  origin: PUBLIC_ORIGIN,
};
const NOON = new Date("2026-07-15T12:20:00Z");

export const ENVIRONMENT = {
  DIGEST_SECRET: FAKE_SECRET,
  [CLIENT_NETWORK_SOURCE_VARIABLE]: "vercel",
};

/** A request the form could send: a design at its revision, or a callback when `design` is `null`. */
export function bodyOf(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(requestOf(overrides));
}

export function requestOf(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = {
    contact: {
      name: NAME_MARKER,
      phone: "069 000 111",
      locality: "Fakeville",
      channel: "phone",
      consent: true,
      consentTextVersion: "placeholder",
    },
    design: { id: DESIGN_ID, revision: "1" },
    clientRequestId: REQUEST_ID,
    locale: "ro",
    honeypot: "",
    elapsedMs: 12_000,
  };
  const merged: Record<string, unknown> = { ...base, ...overrides };
  if (overrides.intent !== undefined) delete merged.design;
  return merged;
}

export function callbackBodyOf(
  overrides: Record<string, unknown> = {},
): string {
  return bodyOf({ intent: "callback", ...overrides });
}

export interface Harness {
  readonly ports: SubmitContactPorts;
  readonly store: FakeContactSubmissionStore;
  readonly sender: FakeMailSender;
  /** The frozen copies' fake, which takes a view only for a request the store holds, as the table's reference does. */
  readonly views: FakeSentKitchenViewRepository;
  /** Every port call, in order: judge asks, lookups, loads, records, view records, sends, marks. */
  readonly calls: string[];
  readonly recorded: ReturnType<typeof spyOnCounters>;
  submit(body?: string, visitorHash?: string): ReturnType<typeof submitContact>;
}

export interface HarnessOptions {
  readonly design?: Design;
  readonly outcomes?: readonly MailOutcome[];
  readonly environment?: Record<string, string | undefined>;
  readonly headers?: Headers;
  readonly store?: (
    inner: FakeContactSubmissionStore,
  ) => ContactSubmissionStore;
  readonly loadOwned?: SubmitContactPorts["loadOwned"];
  readonly createSender?: SubmitContactPorts["createSender"];
  readonly digester?: SubmitContactPorts["digester"];
  readonly noticeContent?: SubmitContactPorts["noticeContent"];
  readonly book?: SubmitContactPorts["book"];
  readonly readPublicOrigin?: SubmitContactPorts["readPublicOrigin"];
  readonly views?: (
    inner: FakeSentKitchenViewRepository,
  ) => SentKitchenViewRepository;
}

/** Every port the orchestration is handed, made of fakes: the persistence package's fake store and frozen views, the
 *  mail's fake sender, the limiter with the setup's fake counters, an owned load that answers a design, and a
 *  configured origin. Nothing reaches a network. */
export function aHarness(options: HarnessOptions = {}): Harness {
  const calls: string[] = [];
  const innerStore = new FakeContactSubmissionStore();
  const innerViews = new FakeSentKitchenViewRepository({
    isRequestStored: (clientRequestId) =>
      innerStore
        .heldSubmissions()
        .some((held) => held.submission.clientRequestId === clientRequestId),
  });
  const sender = createFakeMailSender(options.outcomes);
  const environment = options.environment ?? ENVIRONMENT;
  const headers =
    options.headers ?? new Headers({ "x-forwarded-for": "192.0.2.77" });
  const store = (options.store ?? ((inner) => inner))(innerStore);
  const views = (options.views ?? ((inner) => inner))(innerViews);
  const ports: SubmitContactPorts = {
    store: loggedStore(store, calls),
    sentMarks: new FakeSentMarkStore(new FakeAccountKitchenStore()),
    createSender:
      options.createSender ??
      (() => ({ kind: "sender", sender: loggedSender(sender, calls) })),
    book: options.book ?? SAMPLE_PRICE_BOOK,
    digester: options.digester ?? readDigester(environment),
    noticeContent: options.noticeContent ?? ro,
    servedLocales: ["ro", "ru"],
    loadOwned:
      options.loadOwned ??
      (() => {
        calls.push("load");
        return Promise.resolve({
          kind: "found",
          design: options.design ?? KITCHEN_L_DESIGN,
          revision: "1",
        });
      }),
    makeJudge: (instant) =>
      loggedJudge(makeContactJudge({ environment, headers, instant }), calls),
    now: () => NOON,
    readPublicOrigin: options.readPublicOrigin ?? (() => CONFIGURED_ORIGIN),
    sentKitchenViews: loggedViews(views, calls),
  };
  return {
    ports,
    store: innerStore,
    sender,
    views: innerViews,
    calls,
    recorded: spyOnCounters(),
    submit: (body = bodyOf(), visitorHash) =>
      submitContact({ text: body, visitorHash } satisfies ContactBody, ports),
  };
}

function spyOnCounters() {
  return vi.spyOn(getRateLimitStore(), "recordHits");
}

function loggedStore(
  store: ContactSubmissionStore,
  calls: string[],
): ContactSubmissionStore {
  return {
    lookUp: (request) => {
      calls.push("lookUp");
      return store.lookUp(request);
    },
    record: (submission) => {
      calls.push("record");
      return store.record(submission);
    },
    markNotified: (id) => {
      calls.push("mark");
      return store.markNotified(id);
    },
  };
}

function loggedViews(
  views: SentKitchenViewRepository,
  calls: string[],
): SentKitchenViewRepository {
  return {
    record: (view) => {
      calls.push("record-view");
      return views.record(view);
    },
    load: (tokenHash) => views.load(tokenHash),
  };
}

function loggedSender(sender: FakeMailSender, calls: string[]) {
  return {
    send: (message: Parameters<FakeMailSender["send"]>[0]) => {
      calls.push("send");
      return sender.send(message);
    },
  };
}

function loggedJudge(
  judge: ReturnType<typeof makeContactJudge>,
  calls: string[],
): ReturnType<typeof makeContactJudge> {
  return {
    everyRequest: () => {
      calls.push("judge:every");
      return judge.everyRequest();
    },
    triesOfStoredRequest: (id) => {
      calls.push("judge:tries");
      return judge.triesOfStoredRequest(id);
    },
    newRequest: (subjects) => {
      calls.push("judge:new");
      return judge.newRequest(subjects);
    },
  };
}

export async function wireOf(answer: Response): Promise<string> {
  return JSON.stringify([
    answer.status,
    [...answer.headers],
    await answer.clone().text(),
  ]);
}
