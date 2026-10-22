// What the tests of the staff kitchen page's writes (wave L3-U4) share: the routes of one kitchen told apart, the answers
// each write can be given, and the two ways a test types and chooses that `qa-l3-u3-harness.adversarial.ts` does not have.
// Not a test file.
import { act } from "react";

import type {
  RecordedRequest,
  ServerAnswer,
  StaffKitchensServer,
} from "./staff-kitchens-wire";
import { STAFF_KITCHEN_ID } from "./staff-kitchen-wire";

export const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;
export const NOTE_ADDRESS = `${KITCHEN_ADDRESS}/notes`;
export const STATUS_ADDRESS = `${KITCHEN_ADDRESS}/status`;
export const UNHIDE_ADDRESS = `${KITCHEN_ADDRESS}/unhide`;
export const SESSION_ADDRESS = "/api/account/session";

export type RouteAnswer = ServerAnswer | "hold" | "offline";
type Route = (request: RecordedRequest) => RouteAnswer;

/** Each route of the kitchen, by what it does. A route left out answers `500`, so a request nobody expected is seen. */
export interface KitchenRoutes {
  readonly read?: Route;
  readonly note?: Route;
  readonly status?: Route;
  readonly unhide?: Route;
}

const NO_SUCH_ROUTE: ServerAnswer = { status: 500 };

export function routeKitchen(routes: KitchenRoutes): Route {
  return (request) => {
    const route = routeOf(routes, request.url.pathname);
    return route === undefined ? NO_SUCH_ROUTE : route(request);
  };
}

function routeOf(routes: KitchenRoutes, path: string): Route | undefined {
  switch (path) {
    case KITCHEN_ADDRESS:
      return routes.read;
    case NOTE_ADDRESS:
      return routes.note;
    case STATUS_ADDRESS:
      return routes.status;
    case UNHIDE_ADDRESS:
      return routes.unhide;
    default:
      return undefined;
  }
}

/** The requests that were writes, in order. */
export function writesOf(server: StaffKitchensServer): RecordedRequest[] {
  return server.requests.filter(({ init }) => (init.method ?? "GET") !== "GET");
}

/** The requests that read the kitchen, in order. */
export function readsOf(server: StaffKitchensServer): RecordedRequest[] {
  return server.requests.filter(
    ({ url, init }) =>
      url.pathname === KITCHEN_ADDRESS && (init.method ?? "GET") === "GET",
  );
}

export function bodyOf(request: RecordedRequest): unknown {
  return JSON.parse(request.init.body as string);
}

export function wireNoteStored(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "note-new",
    text: "Clientul vrea fronturi din nuc.",
    createdAt: "2026-10-21T12:00:00.000Z",
    author: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
    ...overrides,
  };
}

export const noteCreated = (
  overrides: Readonly<Record<string, unknown>> = {},
): ServerAnswer => ({ status: 201, body: { note: wireNoteStored(overrides) } });

export const statusSaved = (
  status: string,
  overrides: Readonly<Record<string, unknown>> = {},
): ServerAnswer => ({
  status: 200,
  body: {
    status,
    changedBy: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
    changedAt: "2026-10-21T12:00:00.000Z",
    ...overrides,
  },
});

export const NO_CONTENT: ServerAnswer = { status: 204 };

export const conflict = (word: string): ServerAnswer => ({
  status: 409,
  body: { status: word },
});

export const invalidInput = (
  field: "text" | "status",
  code: string,
): ServerAnswer => ({
  status: 400,
  body: { status: "invalid-input", issues: [{ field, code }] },
});

export const ONE_REFUSAL: ServerAnswer = {
  status: 404,
  body: { error: "Design not found" },
};

/** A keystroke in a textarea: through the prototype's setter, because React tracks `value` on the element. */
export function typeIntoTextarea(
  field: HTMLTextAreaElement,
  value: string,
): void {
  const valueProperty = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  );
  act(() => {
    valueProperty?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function chooseOption(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export function pressKey(
  target: EventTarget,
  key: string,
  shiftKey = false,
): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

/** The one thing in a list, or a failure that says how many there were. */
export function theOnly<Item>(items: readonly Item[]): Item {
  const [only] = items;
  if (items.length !== 1 || only === undefined) {
    throw new Error(`expected one, found ${String(items.length)}`);
  }
  return only;
}

/** The item at a place in a list, or a failure that names the place. */
export function itemAt<Item>(items: readonly Item[], place: number): Item {
  const item = items[place];
  if (item === undefined) throw new Error(`nothing at ${String(place)}`);
  return item;
}
