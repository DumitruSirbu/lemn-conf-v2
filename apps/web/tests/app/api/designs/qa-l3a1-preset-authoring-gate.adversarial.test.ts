import { createHash } from "node:crypto";

import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import {
  FakePresetRepository,
  type LoadOwnedOutcome,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import { designNotFoundResponse } from "@/lib/server/design-errors";

import {
  freshPresetAuthorWorld,
  type PresetAuthorWorld,
  type SeededPresetSession,
} from "../../../support/preset-author-world";

/**
 * QA of wave L3-A1 (plan 8B Lot 3, P-L3-14): the preset authoring gate through the real save route and the real
 * `GET /api/designs/{id}`. The developer's tests check that a refused caller is answered with the design-not-found
 * response; they do not check that the gate is asked FIRST, which is what makes a refusal an oracle-free, cost-free
 * answer: a policy moved after the body read, the load or the limiter keeps every one of those assertions green. The
 * cases below fix the order by what a refused caller can observe (the body's rules, the design's existence, the
 * credential's limiter), and re-run the credential refusals the developer's table now runs without a session (so that
 * table passes on the policy's refusal and no longer proves the credential check).
 */

function hashOf(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const DESIGN_ID = "V1StGXR8Z5jdHi6BmyT_a";
const WRITE_TOKEN = "write-token-for-the-design-under-test";
const WRITE_COOKIE_NAME = `lemnaria_write_token_${DESIGN_ID}`;
const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const VISITOR_VALUE = "a".repeat(43);
const STORED_REVISION = "7";
const HOURS = 60 * 60 * 1000;
const ADMINISTRATOR_IDLE_LIFETIME_MS = 12 * HOURS;

const presets = vi.hoisted(() => ({ current: undefined as unknown }));
const loadAuthorized = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/repository", () => ({
  getAuthorizedDesignRepository: () => ({ loadAuthorized }),
  getPresetRepository: () => presets.current,
  getRepository: () => ({
    loadOwned: () =>
      Promise.resolve({
        kind: "found",
        design: KITCHEN_L_DESIGN,
        revision: STORED_REVISION,
      }),
  }),
}));

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/preset-author-world").then((world) =>
    world.presetAuthorSessionStoreModule(),
  ),
);

const { POST: savePreset } = await import(
  "../../../../src/app/api/designs/[id]/preset/route"
);
const { GET: readDesign } = await import(
  "../../../../src/app/api/designs/[id]/route"
);

let fakePresets: FakePresetRepository;
let world: PresetAuthorWorld;

beforeEach(() => {
  fakePresets = new FakePresetRepository();
  presets.current = fakePresets;
  world = freshPresetAuthorWorld();
  loadAuthorized.mockReset();
  loadAuthorized.mockImplementation(
    ({
      id,
      writeTokenHash,
      visitorHash,
    }: {
      id: string;
      writeTokenHash: string;
      visitorHash: string;
    }): Promise<LoadOwnedOutcome> =>
      Promise.resolve(
        id === DESIGN_ID &&
          writeTokenHash === hashOf(WRITE_TOKEN) &&
          visitorHash === hashOf(VISITOR_VALUE)
          ? {
              kind: "found",
              design: KITCHEN_L_DESIGN,
              revision: STORED_REVISION,
            }
          : { kind: "none" },
      ),
  );
});

// ---- The request ----

const AUTHOR_CREDENTIALS = `${WRITE_COOKIE_NAME}=${WRITE_TOKEN}; ${VISITOR_COOKIE_NAME}=${VISITOR_VALUE}`;

function validFields(): Record<string, unknown> {
  const png = new Uint8Array(64);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const header = new DataView(png.buffer);
  header.setUint32(8, 13);
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  header.setUint32(16, 1280);
  header.setUint32(20, 960);
  return {
    revision: STORED_REVISION,
    name: "Kitchen in L",
    imageType: "image/png",
    image: Buffer.from(png).toString("base64"),
  };
}

interface SaveAttempt {
  readonly cookie?: string;
  readonly body?: string;
  readonly fields?: Record<string, unknown>;
  readonly id?: string;
}

function save({
  cookie = AUTHOR_CREDENTIALS,
  body,
  fields,
  id = DESIGN_ID,
}: SaveAttempt = {}): Promise<Response> {
  return savePreset(
    new NextRequest(`https://example.test/api/designs/${id}/preset`, {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin", cookie },
      body: body ?? JSON.stringify({ ...validFields(), ...fields }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function withSession(session: SeededPresetSession): string {
  return `${AUTHOR_CREDENTIALS}; ${session.cookie}`;
}

interface Fingerprint {
  readonly status: number;
  readonly text: string;
  readonly headers: [string, string][];
}

async function fingerprintOf(response: Response): Promise<Fingerprint> {
  return {
    status: response.status,
    text: await response.text(),
    headers: [...response.headers],
  };
}

async function notFoundFingerprint(id = DESIGN_ID): Promise<Fingerprint> {
  return fingerprintOf(designNotFoundResponse(id));
}

async function canAuthorPresetsAnswer(cookie: string): Promise<unknown> {
  const response = await readDesign(
    new NextRequest(`https://example.test/api/designs/${DESIGN_ID}`, {
      headers: { cookie },
    }),
    { params: Promise.resolve({ id: DESIGN_ID }) },
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { canAuthorPresets: unknown })
    .canAuthorPresets;
}

// ---- Who is refused, each beside the administrator who is not ----

type RefusedCaller = readonly [
  name: string,
  cookieFor: (world: PresetAuthorWorld) => Promise<string>,
];

const REFUSED_CALLERS: readonly RefusedCaller[] = [
  [
    "a signed-in client",
    async (w) => withSession(await w.signIn({ role: "client" })),
  ],
  [
    "a signed-in operator",
    async (w) => withSession(await w.signIn({ role: "operator" })),
  ],
  ["no session", () => Promise.resolve(AUTHOR_CREDENTIALS)],
  [
    "an administrator whose address is not confirmed",
    async (w) =>
      withSession(
        await w.signIn({ role: "administrator", isEmailConfirmed: false }),
      ),
  ],
  [
    "an administrator whose session was revoked",
    async (w) => {
      const session = await w.signIn({ role: "administrator" });
      await w.sessions.revoke(session.tokenHash);
      return withSession(session);
    },
  ],
  [
    "an administrator demoted to operator",
    async (w) => {
      const session = await w.signIn({ role: "administrator" });
      w.accounts.setRoleOf(session.accountId, "operator");
      return withSession(session);
    },
  ],
  [
    "an administrator idle past 12 hours",
    async (w) => {
      const session = await w.signIn({ role: "administrator" });
      w.advance(ADMINISTRATOR_IDLE_LIFETIME_MS + 1_000);
      return withSession(session);
    },
  ],
  [
    "an administrator whose session store is down",
    async (w) => {
      const session = await w.signIn({ role: "administrator" });
      w.breakSessionLookups();
      return withSession(session);
    },
  ],
];

describe("the gate is asked before anything a refused caller could learn from", () => {
  it("the administrator control: the same request is loaded, counted against the limiter and stored", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    const recordHits = vi.spyOn(getRateLimitStore(), "recordHits");

    const response = await save({ cookie: withSession(administrator) });

    expect(response.status).toBe(201);
    expect(loadAuthorized).toHaveBeenCalledTimes(1);
    expect(recordHits).toHaveBeenCalled();
    expect(fakePresets.heldPresets()).toHaveLength(1);
  });

  describe.each(REFUSED_CALLERS)("%s", (_name, cookieFor) => {
    it("is answered with the design-not-found response, byte for byte, and nothing is stored", async () => {
      const cookie = await cookieFor(world);

      const response = await save({ cookie });

      expect(await fingerprintOf(response)).toEqual(
        await notFoundFingerprint(),
      );
      expect(fakePresets.heldPresets()).toHaveLength(0);
    });

    it("never reaches the design's load, so the answer says nothing of whether the design exists", async () => {
      const cookie = await cookieFor(world);

      await save({ cookie });

      expect(loadAuthorized).not.toHaveBeenCalled();
    });

    it("spends nothing of the write credential's, the network's or the day's limiter", async () => {
      const cookie = await cookieFor(world);
      const recordHits = vi.spyOn(getRateLimitStore(), "recordHits");

      await save({ cookie });

      expect(recordHits).not.toHaveBeenCalled();
    });

    it.each([
      ["a body that is not JSON", { body: "{not json" }],
      ["a stale revision", { fields: { revision: "6" } }],
      ["an image that fails its check", { fields: { image: "!!!!" } }],
      ["a name that fails its rule", { fields: { name: "a".repeat(81) } }],
      ["a body past the size bound", { body: "x".repeat(800_000) }],
    ])(
      "with %s answers the same 404, not the body's own refusal",
      async (_label, attempt) => {
        const cookie = await cookieFor(world);

        const response = await save({ cookie, ...attempt });

        expect(await fingerprintOf(response)).toEqual(
          await notFoundFingerprint(),
        );
      },
    );

    it("on an id that names no design answers the same as on the design's own id (no oracle on existence)", async () => {
      const cookie = await cookieFor(world);
      const unknownId = "no-such-design-00000x";

      const known = await fingerprintOf(await save({ cookie }));
      const unknown = await fingerprintOf(
        await save({
          cookie: cookie.replaceAll(DESIGN_ID, unknownId),
          id: unknownId,
        }),
      );

      expect(unknown).toEqual({
        ...known,
        text: (await notFoundFingerprint(unknownId)).text,
      });
      expect(unknown.status).toBe(404);
    });
  });

  it("a refused caller who sends more requests than the credential's bucket holds leaves the administrator's save unaffected", async () => {
    const client = await world.signIn({ role: "client" });
    const administrator = await world.signIn({ role: "administrator" });

    for (let attempt = 0; attempt < 301; attempt += 1) {
      await save({ cookie: withSession(client) });
    }

    expect((await save({ cookie: withSession(administrator) })).status).toBe(
      201,
    );
  });
});

describe("an administrator who fails the design's own credential check is refused for that reason (the session is present)", () => {
  const wrongVisitor = `${VISITOR_COOKIE_NAME}=${"b".repeat(43)}`;
  const writeCookie = `${WRITE_COOKIE_NAME}=${WRITE_TOKEN}`;
  const visitorCookie = `${VISITOR_COOKIE_NAME}=${VISITOR_VALUE}`;

  it.each([
    ["no write token", visitorCookie, 0],
    ["no visitor cookie", writeCookie, 0],
    [
      "a malformed visitor cookie",
      `${writeCookie}; ${VISITOR_COOKIE_NAME}=short`,
      0,
    ],
    [
      "a wrong write token",
      `${WRITE_COOKIE_NAME}=not-the-token; ${visitorCookie}`,
      1,
    ],
    ["another browser's visitor", `${writeCookie}; ${wrongVisitor}`, 1],
  ])(
    "%s: the design-not-found response and nothing stored",
    async (_name, credentials, expectedLoads) => {
      const administrator = await world.signIn({ role: "administrator" });

      const response = await save({
        cookie: `${credentials}; ${administrator.cookie}`,
      });

      expect(await fingerprintOf(response)).toEqual(
        await notFoundFingerprint(),
      );
      expect(loadAuthorized).toHaveBeenCalledTimes(expectedLoads);
      expect(fakePresets.heldPresets()).toHaveLength(0);
    },
  );

  it("a wrong write token beside an image and a name that fail their rules: the same 404, the body never judged", async () => {
    const administrator = await world.signIn({ role: "administrator" });

    const response = await save({
      cookie: `${WRITE_COOKIE_NAME}=not-the-token; ${visitorCookie}; ${administrator.cookie}`,
      fields: { image: "!!!!", name: "a".repeat(81) },
    });

    expect(response.status).toBe(404);
  });

  it("the administrator's save of a design that does not exist is byte-identical to a refused caller's answer", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    const client = await world.signIn({ role: "client" });
    const unknownId = "no-such-design-00000x";
    const credentialsFor = (session: SeededPresetSession) =>
      `${WRITE_COOKIE_NAME.replace(DESIGN_ID, unknownId)}=${WRITE_TOKEN}; ${visitorCookie}; ${session.cookie}`;

    const asAdministrator = await fingerprintOf(
      await save({ id: unknownId, cookie: credentialsFor(administrator) }),
    );
    const asClient = await fingerprintOf(
      await save({ id: unknownId, cookie: credentialsFor(client) }),
    );

    expect(asAdministrator).toEqual(asClient);
    expect(asAdministrator.status).toBe(404);
  });
});

describe("the gate is the account's current state at each request, never an earlier answer", () => {
  it("a demotion between two saves, and between the editor's read and the save, ends authoring at once; a promotion restores it", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    const cookie = withSession(administrator);

    expect(await canAuthorPresetsAnswer(cookie)).toBe(true);
    expect((await save({ cookie })).status).toBe(201);

    world.accounts.setRoleOf(administrator.accountId, "operator");

    expect(await canAuthorPresetsAnswer(cookie)).toBe(false);
    expect((await save({ cookie })).status).toBe(404);
    expect(fakePresets.heldPresets()).toHaveLength(1);

    world.accounts.setRoleOf(administrator.accountId, "administrator");

    expect(await canAuthorPresetsAnswer(cookie)).toBe(true);
    expect((await save({ cookie })).status).toBe(201);
    expect(fakePresets.heldPresets()).toHaveLength(2);
  });

  it("a session revoked after the editor's read refuses the next save and stores nothing", async () => {
    const administrator = await world.signIn({ role: "administrator" });
    const cookie = withSession(administrator);
    expect(await canAuthorPresetsAnswer(cookie)).toBe(true);

    await world.sessions.revoke(administrator.tokenHash);

    expect((await save({ cookie })).status).toBe(404);
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });
});

describe("the editor's answer and the save never disagree", () => {
  it.each([
    ...REFUSED_CALLERS,
    [
      "a live, confirmed administrator",
      async (w: PresetAuthorWorld) =>
        withSession(await w.signIn({ role: "administrator" })),
    ] satisfies RefusedCaller,
  ])(
    "%s: canAuthorPresets is true exactly when the save is accepted",
    async (_name, cookieFor) => {
      const cookie = await cookieFor(world);

      const answer = await canAuthorPresetsAnswer(cookie);
      const saved = (await save({ cookie })).status === 201;

      expect(answer).toBe(saved);
    },
  );
});

describe("the route answers the one method it is written for", () => {
  it("exports a handler for POST and for no other HTTP method", async () => {
    const route = await import(
      "../../../../src/app/api/designs/[id]/preset/route"
    );
    const methods = ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"];

    const exported = methods.filter((method) => method in route);

    expect(exported).toEqual([]);
    expect(typeof route.POST).toBe("function");
  });
});
