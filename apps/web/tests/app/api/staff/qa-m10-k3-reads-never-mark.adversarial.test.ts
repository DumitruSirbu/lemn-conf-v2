import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { KitchenChangeStore } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  accountRequest,
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import {
  freshStaffWorld,
  plantClient,
  plantKitchen,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";

// Adversarial QA of "a render never writes": opening a kitchen, reading the list and polling the count are reads, and none
// of them marks a kitchen seen. The mark is the seen route's alone, and only the screen's request on open asks for it.

const marks = vi.hoisted(() => ({ asked: [] as unknown[] }));

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-kitchen-reader-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffKitchenReaderModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/kitchen-change-store-instance", () => ({
  getKitchenChangeStore: (): KitchenChangeStore =>
    ({
      markSeen: (request: unknown) => {
        marks.asked.push(request);
        return Promise.reject(new Error("a read marked a kitchen seen"));
      },
    }) as unknown as KitchenChangeStore,
}));

const { GET: openOne } = await import("@/app/api/staff/kitchens/[id]/route");
const { GET: readList } = await import("@/app/api/staff/kitchens/route");
const { GET: pollCount } = await import(
  "@/app/api/staff/kitchens/changed-count/route"
);

let staffWorld: StaffWorld;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  captureConsole();
  marks.asked.length = 0;
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function signedInOperator() {
  const email = "operator@example.test";
  const staff = await signedInAs({ role: "operator" }, email);
  staffWorld.reader.plantAccount({
    id: staff.account.id,
    email,
    name: "Operator Name",
    phone: null,
  });
  return staff;
}

function requestAt(path: string, cookie: string) {
  return accountRequest(path, {
    cookie,
    headers: { "x-forwarded-for": "192.0.2.10" },
  });
}

describe("a read of the staff kitchens", () => {
  it("marks no kitchen seen by opening one, listing them or polling the count", async () => {
    const { session } = await signedInOperator();
    const client = plantClient();
    const kitchen = plantKitchen({ accountId: client.id });

    const opened = await openOne(
      requestAt(`/api/staff/kitchens/${kitchen.id}`, session.cookie),
      { params: Promise.resolve({ id: kitchen.id }) },
    );
    const listed = await readList(
      requestAt(
        "/api/staff/kitchens?segment=sent&onlyChanged=true",
        session.cookie,
      ),
    );
    const counted = await pollCount(
      requestAt("/api/staff/kitchens/changed-count", session.cookie),
    );

    expect([opened.status, listed.status, counted.status]).toEqual([
      200, 200, 200,
    ]);
    expect(marks.asked).toEqual([]);
  });
});

describe("the sources of the staff area", () => {
  const SOURCE_ROOT = join(import.meta.dirname, "..", "..", "..", "..", "src");
  const MARK_OWNERS = [
    join("app", "api", "staff", "kitchens", "[id]", "seen", "route.ts"),
    join("lib", "server", "staff", "staff-kitchen-seen.ts"),
    join("lib", "server", "staff", "kitchen-change-store-instance.ts"),
  ];
  // The digest cron lists and claims through the same store but must never mark a kitchen seen.
  const STORE_READERS = [
    join("app", "api", "cron", "staff-change-digest", "route.ts"),
  ];
  const STORE_IMPORT =
    /from\s+["'][^"']*(kitchen-change-store-instance|staff-kitchen-seen)["']/u;
  const MARK_CALL = ".markSeen(";

  function sourcesUnder(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) return sourcesUnder(path);
      return /\.(ts|tsx)$/u.test(name) ? [path] : [];
    });
  }

  it("lets no module but the seen route's reach the store that marks a kitchen seen", () => {
    const reachers = sourcesUnder(SOURCE_ROOT)
      .map((path) => relative(SOURCE_ROOT, path))
      .filter((path) => !MARK_OWNERS.includes(path))
      .filter((path) => {
        const source = readFileSync(join(SOURCE_ROOT, path), "utf8");
        const importsStore =
          STORE_IMPORT.test(source) && !STORE_READERS.includes(path);
        return importsStore || source.includes(MARK_CALL);
      });

    expect(reachers).toEqual([]);
  });

  it("sends the seen mark from no server component: every page under the app directory is free of a POST to it", () => {
    const pages = sourcesUnder(join(SOURCE_ROOT, "app")).filter((path) =>
      /[\\/]page\.tsx$/u.test(path),
    );

    const posting = pages.filter((path) =>
      /\/seen|staff-seen|useMarkSeen/u.test(readFileSync(path, "utf8")),
    );

    expect(pages.length).toBeGreaterThan(20);
    expect(posting.map((path) => path.split(sep).slice(-4).join("/"))).toEqual(
      [],
    );
  });
});
