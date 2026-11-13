import fc from "fast-check";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import type { StaffPageRead } from "@/lib/server/staff/staff-page";
import type { StaffShellContext } from "@/staff/staff-shell";

import roMessages from "../../../../src/messages/ro.json";
import ruMessages from "../../../../src/messages/ru.json";
import {
  aDesign,
  aDesignId,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { withoutPriceBook } from "../../../support/price-book-wrapper";
import {
  SENT_AT,
  freshStaffWorld,
  plantKitchen,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";

// W3b adversarial QA: the 3D page and the endpoint it feeds read `version` in two places, and must mean the same thing by
// it. For any query string a person can type into the address, the request the screen makes from what the page kept is
// always answered with a copy (never the endpoint's `400`), and when the endpoint would have served a copy for the query as
// typed, the page's reading serves that same copy.

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

const gate = vi.hoisted(() => ({ shell: undefined as unknown }));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: () => Promise.resolve(),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: ({ locale }: { locale: "ro" | "ru" }) =>
    Promise.resolve(
      createTranslator({
        locale,
        messages: (locale === "ru"
          ? ruMessages
          : roMessages) as typeof roMessages,
      }),
    ),
}));
vi.mock("@/lib/server/staff/staff-page", () => ({
  readStaffPage: (): Promise<StaffPageRead> =>
    Promise.resolve({
      kind: "signed-in",
      shell: gate.shell as StaffShellContext,
    }),
}));

const { GET } = await import("@/app/api/staff/kitchens/[id]/3d/route");
const { default: StaffKitchen3dPage } = await import(
  "../../../../src/app/[locale]/staff/kitchens/[id]/3d/page"
);

gate.shell = {
  role: "operator",
  email: "staff@example.test",
  navigation: ["kitchens"],
} satisfies StaffShellContext;

const SENT_DESIGN = aDesign("sent-copy");
const CURRENT_DESIGN = aDesign("current-copy");
const FRAGMENTS = [
  "version=sent",
  "version=current",
  "version=Sent",
  "version=",
  "version",
  "version=latest",
  "version=sent%00",
  "version=%73ent",
  "version=%63urrent",
  "version=sent+",
  "version=%20sent",
  "version[]=current",
  "Version=current",
  "version=sent&version=sent",
  "ver=current",
  "__proto__=current",
  "version=__proto__",
  "x=1",
  "",
] as const;

let staffWorld: StaffWorld;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** `searchParams` as the framework hands a page: one string for a name given once, an array for a name given more. */
function searchParamsOf(search: string): Record<string, string | string[]> {
  const params = new URLSearchParams(search);
  const record: Record<string, string | string[]> = {};
  for (const name of new Set(params.keys())) {
    const values = params.getAll(name);
    Object.defineProperty(record, name, {
      value: values.length === 1 ? values[0] : values,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return record;
}

async function versionThePageKeeps(
  search: string,
  id: string,
): Promise<"sent" | "current" | undefined> {
  const page = withoutPriceBook(
    await StaffKitchen3dPage({
      params: Promise.resolve({ locale: "ro", id }),
      searchParams: Promise.resolve(searchParamsOf(search)),
    }),
  );
  return (page as { props: { version?: "sent" | "current" } }).props.version;
}

async function askEndpoint(
  { id, cookie }: { id: string; cookie: string },
  search: string,
) {
  const request = accountRequest(`/api/staff/kitchens/${id}/3d`, {
    cookie,
    search,
    headers: { "x-forwarded-for": "192.0.2.10" },
  });
  const answer = await GET(request, { params: Promise.resolve({ id }) });
  return {
    status: answer.status,
    body: answer.status === 200 ? await jsonOf(answer) : undefined,
  };
}

function plantTwoCopies(): string {
  const kitchen = plantKitchen({ design: CURRENT_DESIGN });
  const clientRequestId = aDesignId();
  staffWorld.reader.plantRequest({
    clientRequestId,
    designId: kitchen.id,
    reference: "LM-2026-0042",
    createdAt: SENT_AT,
  });
  staffWorld.reader.plantSentCopy({
    clientRequestId,
    createdAt: SENT_AT,
    isRevoked: false,
    design: SENT_DESIGN,
  });
  return kitchen.id;
}

function queryOf(fragments: readonly string[]): string {
  const joined = fragments.filter((piece) => piece !== "").join("&");
  return joined === "" ? "" : `?${joined}`;
}

function requestOf(version: "sent" | "current" | undefined): string {
  return version === undefined ? "" : `?version=${version}`;
}

describe("the page and the endpoint read `version` alike", () => {
  it("never makes the endpoint refuse what the page kept, and serves the copy the query as typed would have", async () => {
    const { session } = await signedInAs(
      { role: "operator" },
      "operator@example.test",
    );
    const id = plantTwoCopies();

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...FRAGMENTS), { maxLength: 4 }),
        async (fragments) => {
          const search = queryOf(fragments);
          const kept = await versionThePageKeeps(search, id);

          const screenAsks = await askEndpoint(
            { id, cookie: session.cookie },
            requestOf(kept),
          );
          const asTyped = await askEndpoint(
            { id, cookie: session.cookie },
            search,
          );

          expect(screenAsks.status).toBe(200);
          if (asTyped.status === 200) {
            expect(screenAsks.body).toEqual(asTyped.body);
          } else {
            expect(asTyped.status).toBe(400);
            expect(kept).toBeUndefined();
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it.each([
    ["sent", "as-sent"],
    ["current", "current"],
  ] as const)(
    "keeps %s, and the endpoint serves the %s copy for it",
    async (version, source) => {
      const { session } = await signedInAs(
        { role: "operator" },
        "operator@example.test",
      );
      const id = plantTwoCopies();

      const kept = await versionThePageKeeps(`?version=${version}`, id);
      const answer = await askEndpoint(
        { id, cookie: session.cookie },
        requestOf(kept),
      );

      expect(kept).toBe(version);
      expect((answer.body as { source: string }).source).toBe(source);
    },
  );
});
