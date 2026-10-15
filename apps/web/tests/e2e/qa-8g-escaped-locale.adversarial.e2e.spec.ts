// A page whose address is written with percent-escapes, on a built server that names a network source: whatever
// spelling the server serves a design's page or a share's view for must be counted as a read, and a share's view
// must carry its headers however its address was spelled.
//
// Each request is sent from a documentation block of its own, so the one hit it may make is found, and removed,
// under that block's key. It needs the first server's production build, so it runs under CI only.
import { request as sendOverHttp } from "node:http";

import { deleteRateLimitCountersForTests } from "@lemnaria/persistence";
import { expect, test } from "@playwright/test";

import { SHARE_VIEW_HEADERS } from "../../src/lib/security-headers";
import {
  blockOfAddress,
  SHARED_BLOCK,
} from "../../src/lib/server/rate-limit/client-network";
import {
  MINT_POLICY,
  READ_POLICY,
  SHARE_WRITE_POLICY,
} from "../../src/lib/server/rate-limit/limit-policy";
import { bucketKeyOfBlock } from "./support/e2e-rate-limit-run";
import { deleteMintedDesigns } from "./support/minted-designs";
import {
  ESCAPED_LOCALE_SERVER_PORT,
  startProductionPolicyServer,
  type ProductionPolicyServer,
} from "./support/production-policy-server";

const SERVER_START_TIMEOUT_MS = 300_000;
const OWNER_ADDRESS = "2001:db8:5d8:1c0::1";

const RUN_UNDER_CI =
  "It needs the production build the first server makes under CI, and builds nothing itself. Run it with: " +
  "CI=1 pnpm --filter @lemnaria/web exec playwright test " +
  "tests/e2e/qa-8g-escaped-locale.adversarial.e2e.spec.ts --project=mobile";

interface Spelling {
  readonly label: string;
  /** The address, given the design's id and the share's token. */
  readonly path: (id: string, token: string) => string;
  readonly isShareView: boolean;
  /** What the server answers it with: a served page, a redirect to the plain address, or not found. */
  readonly status: Answered;
}

const SERVED = 200;
const SENT_ON = 307;
const TIDIED = 308;
const NOT_FOUND = 404;
type Answered =
  | typeof SERVED
  | typeof SENT_ON
  | typeof TIDIED
  | typeof NOT_FOUND;

const design =
  (path: (id: string) => string): Spelling["path"] =>
  (id) =>
    path(id);
const share =
  (path: (token: string) => string): Spelling["path"] =>
  (_id, token) =>
    path(token);

const PLAIN_SPELLINGS: readonly Spelling[] = [
  {
    label: "a design's page",
    path: design((id) => `/ro/d/${id}`),
    isShareView: false,
    status: SERVED,
  },
  {
    label: "a design's review step",
    path: design((id) => `/ro/d/${id}/review`),
    isShareView: false,
    status: SERVED,
  },
  {
    label: "a share's view",
    path: share((token) => `/ro/s/${token}`),
    isShareView: true,
    status: SERVED,
  },
];

/** The root sends its reader on, so it is known by where it sends them and not by a page. */
const PLAIN_ROOT: Spelling = {
  label: "the locale's root",
  path: () => "/ro",
  isShareView: false,
  status: SENT_ON,
};
const ESCAPED_ROOT: Spelling = {
  label: "/%72o",
  path: () => "/%72o",
  isShareView: false,
  status: NOT_FOUND,
};

const ESCAPED_SPELLINGS: readonly Spelling[] = [
  {
    label: "/%72o/d/{id}",
    path: design((id) => `/%72o/d/${id}`),
    isShareView: false,
    status: NOT_FOUND,
  },
  {
    label: "/r%6F/d/{id}",
    path: design((id) => `/r%6F/d/${id}`),
    isShareView: false,
    status: NOT_FOUND,
  },
  {
    label: "/%72%6f/d/{id}",
    path: design((id) => `/%72%6f/d/${id}`),
    isShareView: false,
    status: NOT_FOUND,
  },
  {
    label: "/r%6F/d/{id}/review",
    path: design((id) => `/r%6F/d/${id}/review`),
    isShareView: false,
    status: NOT_FOUND,
  },
  {
    label: "/%72o/s/{token}",
    path: share((token) => `/%72o/s/${token}`),
    isShareView: true,
    status: NOT_FOUND,
  },
  {
    label: "/%72%6f/s/{token}",
    path: share((token) => `/%72%6f/s/${token}`),
    isShareView: true,
    status: NOT_FOUND,
  },
  {
    label: "/r%6F/s/{token}",
    path: share((token) => `/r%6F/s/${token}`),
    isShareView: true,
    status: NOT_FOUND,
  },
  {
    label: "/ro/%64/{id}",
    path: design((id) => `/ro/%64/${id}`),
    isShareView: false,
    status: NOT_FOUND,
  },
  {
    label: "/ro/d%2F{id}",
    path: design((id) => `/ro/d%2F${id}`),
    isShareView: false,
    status: NOT_FOUND,
  },
  {
    label: "/ro/%73/{token}",
    path: share((token) => `/ro/%73/${token}`),
    isShareView: true,
    status: NOT_FOUND,
  },
  {
    label: "/ro/s%2F{token}",
    path: share((token) => `/ro/s%2F${token}`),
    isShareView: true,
    status: NOT_FOUND,
  },
  {
    label: "/%2572o/d/{id}",
    path: design((id) => `/%2572o/d/${id}`),
    isShareView: false,
    status: NOT_FOUND,
  },
  {
    label: "/%2572o/s/{token}",
    path: share((token) => `/%2572o/s/${token}`),
    isShareView: true,
    status: NOT_FOUND,
  },
];

/** The first character of `text` written as its percent-escape. */
function withItsFirstCharacterEscaped(text: string): string {
  return `%${text.charCodeAt(0).toString(16)}${text.slice(1)}`;
}

type PathOf = (part: string) => string;

function page(label: string, status: Answered, path: PathOf): Spelling {
  return { label, path: design(path), isShareView: false, status };
}

function view(label: string, status: Answered, path: PathOf): Spelling {
  return { label, path: share(path), isShareView: true, status };
}

/** Every other way an address can be written that is not the plain one, with what the server answers each. */
const ODD_SPELLINGS: readonly Spelling[] = [
  page(
    "an escaped id",
    SERVED,
    (id) => `/ro/d/${withItsFirstCharacterEscaped(id)}`,
  ),
  page("a dot segment, /ro/./d/{id}", SERVED, (id) => `/ro/./d/${id}`),
  page("two dots, /ro/../ro/d/{id}", SERVED, (id) => `/ro/../ro/d/${id}`),
  page("an escaped dot, /ro/%2e/d/{id}", SERVED, (id) => `/ro/%2e/d/${id}`),
  page(
    "escaped dots, /ro/%2e%2e/ro/d/{id}",
    SERVED,
    (id) => `/ro/%2e%2e/ro/d/${id}`,
  ),
  page("a doubled slash, /ro//d/{id}", TIDIED, (id) => `/ro//d/${id}`),
  page("a doubled first slash, //ro/d/{id}", TIDIED, (id) => `//ro/d/${id}`),
  page("a doubled slash before the id", TIDIED, (id) => `/ro/d//${id}`),
  page("a trailing slash, /ro/d/{id}/", TIDIED, (id) => `/ro/d/${id}/`),
  page("a backslash, /ro\\d\\{id}", TIDIED, (id) => `/ro\\d\\${id}`),
  page(
    "an escaped step, /ro/d/{id}/%72eview",
    NOT_FOUND,
    (id) => `/ro/d/${id}/%72eview`,
  ),
  page(
    "an escaped backslash, /ro%5Cd%5C{id}",
    NOT_FOUND,
    (id) => `/ro%5Cd%5C${id}`,
  ),
  page(
    "a fixed segment in capitals, /ro/D/{id}",
    NOT_FOUND,
    (id) => `/ro/D/${id}`,
  ),
  page(
    "an escaped slash in the locale, /ro%2Fd/{id}",
    NOT_FOUND,
    (id) => `/ro%2Fd/${id}`,
  ),
  page("an escaped slash after the locale, /ro%2f", NOT_FOUND, () => "/ro%2f"),
  page(
    "a space after the locale, /ro%20/d/{id}",
    NOT_FOUND,
    (id) => `/ro%20/d/${id}`,
  ),
  page(
    "a parameter on the locale, /ro;x/d/{id}",
    NOT_FOUND,
    (id) => `/ro;x/d/${id}`,
  ),
  page(
    "a null after the locale, /ro%00/d/{id}",
    NOT_FOUND,
    (id) => `/ro%00/d/${id}`,
  ),
  view(
    "an escaped token",
    SERVED,
    (token) => `/ro/s/${withItsFirstCharacterEscaped(token)}`,
  ),
  view("a dot segment, /ro/./s/{token}", SERVED, (token) => `/ro/./s/${token}`),
  view(
    "an escaped dot, /ro/%2e/s/{token}",
    SERVED,
    (token) => `/ro/%2e/s/${token}`,
  ),
  view("a doubled slash, /ro//s/{token}", TIDIED, (token) => `/ro//s/${token}`),
  view(
    "a trailing slash, /ro/s/{token}/",
    TIDIED,
    (token) => `/ro/s/${token}/`,
  ),
  view("a backslash, /ro\\s\\{token}", TIDIED, (token) => `/ro\\s\\${token}`),
  view(
    "a fixed segment in capitals, /ro/S/{token}",
    NOT_FOUND,
    (token) => `/ro/S/${token}`,
  ),
  view(
    "an escaped slash in the locale, /ro%2Fs/{token}",
    NOT_FOUND,
    (token) => `/ro%2Fs/${token}`,
  ),
];

/** An address of either family that ends as a static file does: its page's lookup runs, so it is counted. */
const SUFFIXED_SPELLINGS: readonly Spelling[] = [
  page("a design's address ending .png", SERVED, (id) => `/ro/d/${id}.png`),
  page("a design's address ending .woff2", SERVED, (id) => `/ro/d/${id}.woff2`),
  page("a design's address ending .glb", SERVED, (id) => `/ro/d/${id}.glb`),
  page("a design's address ending .PNG", SERVED, (id) => `/ro/d/${id}.PNG`),
  view(
    "a share's address ending .png",
    SERVED,
    (token) => `/ro/s/${token}.png`,
  ),
  view(
    "a share's address ending .ico",
    SERVED,
    (token) => `/ro/s/${token}.ico`,
  ),
  page("a step ending .png", NOT_FOUND, (id) => `/ro/d/${id}/review.png`),
  page("a deeper address ending .png", NOT_FOUND, (id) => `/ro/d/${id}/x.png`),
  page("the root ending .png", NOT_FOUND, () => "/ro.png"),
  page("an escaped locale ending .png", NOT_FOUND, (id) => `/%72o/d/${id}.png`),
  view(
    "an escaped locale's share ending .png",
    NOT_FOUND,
    (token) => `/r%6F/s/${token}.png`,
  ),
];

const EVERY_SPELLING: readonly Spelling[] = [
  ...PLAIN_SPELLINGS,
  PLAIN_ROOT,
  ESCAPED_ROOT,
  ...ESCAPED_SPELLINGS,
  ...ODD_SPELLINGS,
  ...SUFFIXED_SPELLINGS,
];

/** A read is counted once when its page is served or its root sends the reader on, and never otherwise. */
function hitsOwedBy({ status }: Spelling): number {
  return status === SERVED || status === SENT_ON ? 1 : 0;
}

const SERVED_SPELLINGS = EVERY_SPELLING.filter(
  ({ status }) => status === SERVED,
);
const SERVED_SHARE_VIEWS = SERVED_SPELLINGS.filter(
  ({ isShareView }) => isShareView,
);

interface AnswerAsReceived {
  readonly status: number;
  readonly body: string;
  /** A header's value, or nothing. */
  header(name: string): string;
}

/** The address sent exactly as written: a client that parses it first would tidy away the spelling under test. */
function askAsWritten(
  origin: string,
  path: string,
  headers: Record<string, string>,
): Promise<AnswerAsReceived> {
  const { hostname, port } = new URL(origin);
  return new Promise((resolve, reject) => {
    const sent = sendOverHttp(
      { hostname, port, path, method: "GET", headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            header: (name) => {
              const value = response.headers[name.toLowerCase()];
              return Array.isArray(value) ? value.join(", ") : (value ?? "");
            },
          });
        });
      },
    );
    sent.on("error", reject);
    sent.end();
  });
}

interface Seen {
  readonly status: number;
  /** Where a redirect sends its reader, or nothing. */
  readonly location: string;
  readonly isServed: boolean;
  readonly hitsCounted: number;
  readonly missingShareHeaders: readonly string[];
}

/** The cookies of an answer, as the header a browser would send them back in. */
function cookieHeaderOf(setCookies: readonly string[]): string {
  return setCookies.map((setCookie) => setCookie.split(";")[0]).join("; ");
}

test.describe("a page's address written with percent-escapes, on a server that names a source", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  let server: ProductionPolicyServer | undefined;
  let designId = "";
  let shareToken = "";
  let ownerCookies = "";
  let blocksUsed = 0;
  let rowsRemoved = 0;
  const mintedIds: string[] = [];
  const suiteMintedIds: string[] = [];

  function running(): ProductionPolicyServer {
    if (server === undefined) throw new Error("the server did not start");
    return server;
  }

  /** One request from a block no other request of this file uses, and the hits found under that block's key. */
  async function read(spelling: Spelling): Promise<Seen> {
    blocksUsed += 1;
    const address = `2001:db8:5d8:${blocksUsed.toString(16)}::7`;
    // The root sends a browser that owns a design on to it, so the root is read as a stranger reads it.
    const isRoot = spelling === PLAIN_ROOT || spelling === ESCAPED_ROOT;
    const response = await askAsWritten(
      running().origin,
      spelling.path(designId, shareToken),
      isRoot
        ? { "x-forwarded-for": address }
        : { "x-forwarded-for": address, cookie: ownerCookies },
    );
    const { body } = response;
    const removed = await deleteRateLimitCountersForTests([
      bucketKeyOfBlock(
        running().secret,
        READ_POLICY.name,
        blockOfAddress(address),
      ),
    ]);
    rowsRemoved += removed.rowsRemoved;
    const seen: Seen = {
      status: response.status,
      location: response.header("location"),
      isServed: response.status === 200 && body.includes('<html lang="ro"'),
      hitsCounted: removed.counts.reduce((sum, count) => sum + count, 0),
      missingShareHeaders: SHARE_VIEW_HEADERS.filter(
        ({ key, value }) => response.header(key) !== value,
      ).map(({ key }) => key),
    };
    console.log(
      `escaped locale: ${spelling.label} -> ${String(seen.status)} ${seen.location}, ` +
        `served ${String(seen.isServed)}, ` +
        `hits ${String(seen.hitsCounted)}, share headers missing [${seen.missingShareHeaders.join(", ")}]`,
    );
    return seen;
  }

  test.beforeAll(async () => {
    test.setTimeout(SERVER_START_TIMEOUT_MS);
    server = await startProductionPolicyServer(ESCAPED_LOCALE_SERVER_PORT, {
      networkSource: "vercel",
    });
    const sameOrigin = {
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": OWNER_ADDRESS,
    };
    const minted = await fetch(`${server.origin}/api/designs`, {
      method: "POST",
      headers: sameOrigin,
    });
    designId = ((await minted.json()) as { id: string }).id;
    mintedIds.push(designId);
    ownerCookies = cookieHeaderOf(minted.headers.getSetCookie());
    const shared = await fetch(
      `${server.origin}/api/designs/${designId}/share`,
      { method: "POST", headers: { ...sameOrigin, cookie: ownerCookies } },
    );
    shareToken = ((await shared.json()) as { path: string }).path.replace(
      "/s/",
      "",
    );
  });

  test.afterAll(async () => {
    if (server !== undefined) {
      const ownerBlock = blockOfAddress(OWNER_ADDRESS);
      const { secret } = server;
      const removed = await deleteRateLimitCountersForTests([
        bucketKeyOfBlock(secret, MINT_POLICY.name, ownerBlock),
        bucketKeyOfBlock(secret, SHARE_WRITE_POLICY.name, ownerBlock),
        bucketKeyOfBlock(secret, READ_POLICY.name, ownerBlock),
        bucketKeyOfBlock(secret, READ_POLICY.name, SHARED_BLOCK),
        bucketKeyOfBlock(secret, READ_POLICY.name, blockOfAddress("127.0.0.1")),
        bucketKeyOfBlock(secret, READ_POLICY.name, blockOfAddress("::1")),
      ]);
      console.log(
        `escaped locale: ${String(rowsRemoved)} read rows removed by their keys, and ` +
          `${String(removed.rowsRemoved)} rows of the set-up and the readiness polls`,
      );
    }
    await server?.stop();
    await deleteMintedDesigns([...mintedIds, ...suiteMintedIds]);
  });

  test("mints one design on the suite's own server, so the run's teardown finds its row", async ({
    request,
  }) => {
    const minted = await request.post("/api/designs", {
      headers: { "sec-fetch-site": "same-origin" },
    });
    suiteMintedIds.push(((await minted.json()) as { id: string }).id);

    expect(minted.status()).toBe(201);
  });

  test("holds a served arm that is not empty, and no escaped locale in it", () => {
    const answeredOf = (spellings: readonly Spelling[]) =>
      spellings.map(({ status }) => status);

    expect(SERVED_SPELLINGS).toHaveLength(17);
    expect(SERVED_SHARE_VIEWS).toHaveLength(6);
    expect(new Set(answeredOf([ESCAPED_ROOT, ...ESCAPED_SPELLINGS]))).toEqual(
      new Set([NOT_FOUND]),
    );
    expect(ESCAPED_SPELLINGS).toHaveLength(13);
  });

  for (const spelling of EVERY_SPELLING) {
    const hitsOwed = hitsOwedBy(spelling);
    test(`answers ${spelling.label} with ${String(spelling.status)}, counted ${String(hitsOwed)}`, async () => {
      const seen = await read(spelling);

      expect(seen.status).toBe(spelling.status);
      expect(seen.isServed).toBe(spelling.status === SERVED);
      expect(seen.hitsCounted).toBe(hitsOwed);
    });
  }

  for (const spelling of SERVED_SHARE_VIEWS) {
    test(`sends a share view's three headers with ${spelling.label}`, async () => {
      const seen = await read(spelling);

      expect(seen.status).toBe(SERVED);
      expect(seen.missingShareHeaders).toEqual([]);
    });
  }
});
