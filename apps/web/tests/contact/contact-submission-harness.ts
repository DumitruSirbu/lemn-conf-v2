import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { FetchContact } from "@/contact/send-contact-request";
import {
  useContactSubmission,
  type ContactPorts,
  type ContactSubmission,
  type ContactSubmissionOptions,
} from "@/contact/use-contact-submission";
import {
  useConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import { underSamplePriceBook } from "../support/sample-price-root";

export const DESIGN_ID = "design0123456789abcde" as DesignId;
export const FIRST_REVISION = "4";

export const VALID_FIELDS = {
  name: "Ana Popescu",
  phone: "069 123 456",
  locality: "Chisinau",
  email: "ana@example.com",
} as const;

/** The body as the route reads it; only what the tests look at is typed. */
export interface RecordedBody {
  readonly clientRequestId: string;
  readonly elapsedMs: number;
  readonly honeypot: string;
  readonly locale: string;
  readonly contact: Readonly<Record<string, unknown>>;
  readonly design?: { readonly id: string; readonly revision: string };
  readonly intent?: string;
}

export interface RecordedRequest {
  readonly url: string;
  readonly init: RequestInit;
  /** The body as parsed JSON, read when the request was made. */
  readonly body: RecordedBody;
  readonly outstandingBefore: number;
  readonly store: {
    readonly isSaved: boolean;
    readonly revision: string | null;
    readonly designId: string | null;
  };
}

/** What the server says, kept as data: a `Response` body can be read once, and one answer serves many tests. */
export type Answer =
  | {
      readonly kind: "response";
      readonly status: number;
      readonly body: unknown;
      readonly headers: Record<string, string>;
    }
  | { readonly kind: "network-failure" };

interface Pending {
  readonly resolve: (response: Response) => void;
  readonly reject: (reason: unknown) => void;
}

/** A `fetch` whose requests stay out until the test answers the oldest one; it honours an abort signal as `fetch` does. */
export class ControlledFetch {
  readonly requests: RecordedRequest[] = [];
  private readonly pending: Pending[] = [];

  readonly fetchContact: FetchContact = (url, init) => {
    this.requests.push(this.recordOf(url, init));
    return new Promise<Response>((resolve, reject) => {
      this.pending.push({ resolve, reject });
      init.signal?.addEventListener("abort", () => {
        reject(new Error("aborted"));
      });
    });
  };

  get outstanding(): number {
    return this.pending.length;
  }

  get lastRequest(): RecordedRequest {
    const last = this.requests.at(-1);
    if (last === undefined) throw new Error("no request was made");
    return last;
  }

  answerOldest(answer: Answer): void {
    const oldest = this.pending.shift();
    if (oldest === undefined) return;
    if (answer.kind === "response") {
      oldest.resolve(jsonResponse(answer.status, answer.body, answer.headers));
    } else oldest.reject(new TypeError("Failed to fetch"));
  }

  private recordOf(url: string, init: RequestInit): RecordedRequest {
    const state = useConfiguratorStore.getState();
    return {
      url,
      init,
      body: parseBody(init.body),
      outstandingBefore: this.pending.length,
      store: {
        isSaved: state.design === state.savedDesign,
        revision: state.revision,
        designId: state.designId,
      },
    };
  }
}

function parseBody(body: RequestInit["body"]): RecordedBody {
  if (typeof body !== "string") throw new Error("the body was not text");
  return JSON.parse(body) as RecordedBody;
}

/** Reading a response body takes more than the microtasks one `await` flushes. */
function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function answerWith(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Answer {
  return { kind: "response", status, body, headers };
}

/** A clock the test moves; the same reading serves the monotonic and the wall port. */
export class TestClock {
  nowMs = 100_000;

  advance(milliseconds: number): void {
    this.nowMs += milliseconds;
  }
}

/** Ids of the generator's own shape, numbered so that two are never equal. */
export function numberedRequestIds(): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `request-id-${String(count).padStart(8, "0")}`;
  };
}

export function hydrateSavedDesign(revision = FIRST_REVISION): void {
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision,
    canWrite: true,
  });
}

export function editWithoutSaving(label: string): void {
  act(() => {
    useConfiguratorStore.setState({
      design: { ...KITCHEN_L_DESIGN, presetId: label },
    });
  });
}

/** A change to the store that React is told of, as a write from another part of the page would be. */
export function changeStore(change: Partial<ConfiguratorState>): void {
  act(() => {
    useConfiguratorStore.setState(change);
  });
}

/** The server's answer to the write: what is on screen is now what it holds, at the next revision. */
export function landSave(revision: string): void {
  act(() => {
    useConfiguratorStore.setState((state) => ({
      savedDesign: state.design,
      revision,
    }));
  });
}

export interface MountedContactForm {
  readonly fetchControl: ControlledFetch;
  readonly clock: TestClock;
  readonly current: () => ContactSubmission;
  /** Runs the call inside one `act`, so every call inside it happens before React renders again. */
  readonly inOneTask: (call: (form: ContactSubmission) => void) => void;
  readonly answerOldest: (answer: Answer) => Promise<void>;
  readonly unmount: () => void;
}

export function mountContactForm(
  options: Omit<ContactSubmissionOptions, "ports"> & {
    readonly ports?: Partial<ContactPorts>;
  },
): MountedContactForm {
  const fetchControl = new ControlledFetch();
  const clock = new TestClock();
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  let latest: ContactSubmission | undefined;
  const ports: Partial<ContactPorts> = {
    fetchContact: fetchControl.fetchContact,
    monotonicNow: () => clock.nowMs,
    wallNowMs: () => clock.nowMs,
    generateId: numberedRequestIds(),
    ...options.ports,
  };
  function Probe() {
    latest = useContactSubmission({ ...options, ports });
    return null;
  }
  act(() => {
    root.render(
      underSamplePriceBook(
        createElement(NextIntlClientProvider, {
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
          children: createElement(Probe),
        }),
      ),
    );
  });
  const current = (): ContactSubmission => {
    if (latest === undefined) throw new Error("the probe has not rendered");
    return latest;
  };
  return {
    fetchControl,
    clock,
    current,
    inOneTask: (call) => {
      act(() => {
        call(current());
      });
    },
    answerOldest: async (answer) => {
      await act(async () => {
        fetchControl.answerOldest(answer);
        await nextMacrotask();
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** Every field of the body but the ones the digest leaves out and the id itself, as text. */
export function coveredPartOf(request: RecordedRequest): string {
  const left = ["clientRequestId", "honeypot", "elapsedMs"];
  return JSON.stringify(
    Object.entries(request.body).filter(([name]) => !left.includes(name)),
  );
}

/** Types valid text into every field and gives consent, as a customer would before pressing. */
export function fillValidForm(form: MountedContactForm): void {
  form.inOneTask(({ edit }) => {
    edit({ type: "text-changed", field: "name", text: VALID_FIELDS.name });
    edit({ type: "text-changed", field: "phone", text: VALID_FIELDS.phone });
    edit({
      type: "text-changed",
      field: "locality",
      text: VALID_FIELDS.locality,
    });
    edit({ type: "consent-changed", isGiven: true });
  });
}
