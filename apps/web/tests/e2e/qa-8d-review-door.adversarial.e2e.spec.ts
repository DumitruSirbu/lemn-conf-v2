// The review's address as a second door to a design: what a browser that may not see the design is sent from it,
// compared with what the editor's address sends the same browser, over real HTTP and in a real page.
//
// **Must not run concurrently with any other persistence live run**: each test mints rows and deletes them (ADR 0006).
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
} from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { recordRequests } from "./support/qa-8d-review";
import { mintSeededDesign, type Locale } from "./support/seeded-design";

const VISITOR_COOKIE = "__Host-lemnaria_visitor";
const LOCALES: readonly Locale[] = ["ro", "ru"];
const ARRIVAL_QUERY = "?select=p25&settings=open";

interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** A request with exactly the cookies named and no jar, so one answer cannot change the next request. */
async function ask(
  baseURL: string,
  path: string,
  cookies: Readonly<Record<string, string>>,
): Promise<Answer> {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  const context: APIRequestContext = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: cookie === "" ? {} : { cookie },
  });
  try {
    const response = await context.get(path, { maxRedirects: 0 });
    return {
      status: response.status(),
      headers: response.headers(),
      body: await response.text(),
    };
  } finally {
    await context.dispose();
  }
}

/** What every response carries that is drawn fresh per request and says nothing about the design. */
function withoutPerRequestValues(text: string): string {
  return text
    .replace(/nonce=\\?"[^"\\]*\\?"/g, "nonce=N")
    .replace(/'nonce-[^']*'/g, "'nonce-N'")
    .replace(/\\?"nonce\\?":\\?"[^"\\]*\\?"/g, "nonce:N")
    .replace(/__next_r=\\?"[^"\\]*\\?"/g, "__next_r=R");
}

function comparable(answer: Answer, designId: string): Answer {
  const headers = Object.fromEntries(
    Object.entries(answer.headers)
      .filter(([name]) => name !== "date")
      .map(([name, value]) => [
        name,
        withoutPerRequestValues(value).replaceAll(designId, "ID"),
      ]),
  );
  return {
    status: answer.status,
    headers,
    body: withoutPerRequestValues(answer.body).replaceAll(designId, "ID"),
  };
}

const SCRIPT_ELEMENT = /<script\b[^>]*>[\s\S]*?<\/script>/g;
const STREAMED_CHUNK = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;

/** The document as drawn: everything the server sent but its scripts, byte for byte. */
function markupOf(body: string): string {
  return body.replace(SCRIPT_ELEMENT, "<script/>");
}

/**
 * What the scripts carry to the client, as the set of rows the server streamed. A development server numbers its
 * rows, and orders its own debugging rows, by timing (two identical requests differ in both), so each row's number
 * and its references to other rows are blanked and the rows are sorted. What every row says is still compared whole.
 */
function streamedRowsOf(body: string): string {
  const streamed = [...body.matchAll(STREAMED_CHUNK)]
    .map((chunk) => chunk[1] ?? "")
    .join("");
  return streamed
    .split("\\n")
    .map((row) =>
      row.replace(/^[0-9a-f]+:/, "#:").replace(/\$[A-Za-z@]?[0-9a-f]+/g, "$#"),
    )
    .sort()
    .join("\n");
}

/** Where two bodies first part, with what stands around it, so a failure names the difference and not two pages. */
function firstDifference(one: string, other: string): string {
  if (one === other) return "none";
  let at = 0;
  while (at < one.length && one[at] === other[at]) at += 1;
  const around = (text: string): string =>
    text.slice(Math.max(0, at - 120), at + 240);
  return `at ${String(at)} of ${String(one.length)} and ${String(other.length)}: ${JSON.stringify(around(one))} against ${JSON.stringify(around(other))}`;
}

function refusalPageIn(body: string): string {
  const page = /<main[^>]*data-testid="design-load-error"[\s\S]*?<\/main>/.exec(
    body,
  );
  if (page === null) throw new Error("the response draws no load-error page");
  return page[0];
}

/** The headers a door's answer is judged by: everything but the two that name the address asked for. */
function headersThatDoNotNameTheAddress(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => name !== "link" && name !== "content-length",
    ),
  );
}

interface Visitors {
  readonly baseURL: string;
  readonly ownedId: string;
  readonly unknownId: string;
  readonly owner: Readonly<Record<string, string>>;
  readonly foreign: Readonly<Record<string, string>>;
  readonly cleanUp: () => Promise<void>;
}

/** Two browsers, each with its own design, and the visitor cookie each was given. */
async function mintTwoVisitors(
  browser: Browser,
  baseURL: string,
): Promise<Visitors> {
  const ownerContext = await browser.newContext();
  const foreignContext = await browser.newContext();
  const owned = await mintSeededDesign(await ownerContext.newPage());
  const foreignOwn = await mintSeededDesign(await foreignContext.newPage());
  const visitorOf = async (
    context: typeof ownerContext,
  ): Promise<Record<string, string>> => {
    const cookie = (await context.cookies()).find(
      (candidate) => candidate.name === VISITOR_COOKIE,
    );
    if (cookie === undefined) throw new Error("the mint set no visitor cookie");
    return { [VISITOR_COOKIE]: cookie.value };
  };
  const owner = await visitorOf(ownerContext);
  const foreign = await visitorOf(foreignContext);
  return {
    baseURL,
    ownedId: owned.id,
    // The same length and alphabet as a real id, so no comparison below differs by the id's shape.
    unknownId: Array.from(owned.id).reverse().join(""),
    owner,
    foreign,
    cleanUp: async () => {
      await ownerContext.close();
      await foreignContext.close();
      await deleteMintedDesigns([owned.id, foreignOwn.id]);
    },
  };
}

function baseUrlOf(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error("the project sets no baseURL");
  return baseURL;
}

function refusedVisitors(
  visitors: Visitors,
): readonly (readonly [string, Readonly<Record<string, string>>])[] {
  return [
    ["no cookie", {}],
    ["a malformed cookie", { [VISITOR_COOKIE]: "not-a-visitor" }],
    ["another visitor's cookie", visitors.foreign],
  ];
}

test("a browser the design does not open in gets from the review's address the editor's own answer: status, headers and refusal page", async ({
  browser,
  baseURL,
}) => {
  const visitors = await mintTwoVisitors(browser, baseUrlOf(baseURL));
  try {
    for (const locale of LOCALES) {
      for (const [name, cookies] of refusedVisitors(visitors)) {
        for (const id of [visitors.ownedId, visitors.unknownId]) {
          const detail = `${locale}, ${name}, ${id === visitors.ownedId ? "an existing design" : "an unknown id"}`;
          const editor = comparable(
            await ask(visitors.baseURL, `/${locale}/d/${id}`, cookies),
            id,
          );
          const review = comparable(
            await ask(visitors.baseURL, `/${locale}/d/${id}/review`, cookies),
            id,
          );

          expect(review.status, detail).toBe(editor.status);
          expect(
            headersThatDoNotNameTheAddress(review.headers),
            detail,
          ).toEqual(headersThatDoNotNameTheAddress(editor.headers));
          expect(refusalPageIn(review.body), detail).toBe(
            refusalPageIn(editor.body),
          );
        }
      }
    }
  } finally {
    await visitors.cleanUp();
  }
});

test("nothing the review's address sends tells a design that exists from one that was never made", async ({
  browser,
  baseURL,
}) => {
  const visitors = await mintTwoVisitors(browser, baseUrlOf(baseURL));
  try {
    for (const locale of LOCALES) {
      for (const [name, cookies] of refusedVisitors(visitors)) {
        for (const query of ["", ARRIVAL_QUERY]) {
          const detail = `${locale}, ${name}, query ${JSON.stringify(query)}`;
          const existing = comparable(
            await ask(
              visitors.baseURL,
              `/${locale}/d/${visitors.ownedId}/review${query}`,
              cookies,
            ),
            visitors.ownedId,
          );
          const neverMade = comparable(
            await ask(
              visitors.baseURL,
              `/${locale}/d/${visitors.unknownId}/review${query}`,
              cookies,
            ),
            visitors.unknownId,
          );

          expect(existing.status, detail).toBe(neverMade.status);
          expect(existing.headers, detail).toEqual(neverMade.headers);
          expect(
            firstDifference(markupOf(existing.body), markupOf(neverMade.body)),
            detail,
          ).toBe("none");
          expect(
            firstDifference(
              streamedRowsOf(existing.body),
              streamedRowsOf(neverMade.body),
            ),
            detail,
          ).toBe("none");
          // The comparison above is of something: a page whose rows were not found would compare empty with empty.
          expect(streamedRowsOf(existing.body).length, detail).toBeGreaterThan(
            1000,
          );
          expect(existing.body, detail).not.toContain("review-bottom");
        }
      }
    }
  } finally {
    await visitors.cleanUp();
  }
});

test("the owner is the control: the same two addresses answer the owner with a design, so the refusals above are not what every request gets", async ({
  browser,
  baseURL,
}) => {
  const visitors = await mintTwoVisitors(browser, baseUrlOf(baseURL));
  try {
    const editor = await ask(
      visitors.baseURL,
      `/ro/d/${visitors.ownedId}`,
      visitors.owner,
    );
    const review = await ask(
      visitors.baseURL,
      `/ro/d/${visitors.ownedId}/review`,
      visitors.owner,
    );

    for (const answer of [editor, review]) {
      expect(answer.status).toBe(200);
      expect(answer.body).not.toContain('data-testid="design-load-error"');
    }
    expect(review.headers["cache-control"]).toBe(
      editor.headers["cache-control"],
    );
    // The page the server sends has not yet asked the browser for WebGL, so it may not carry a price.
    expect(review.body).not.toContain('data-section="figure"');
    expect(review.body).not.toContain('data-testid="review-row"');
  } finally {
    await visitors.cleanUp();
  }
});

interface ShapeCase {
  readonly path: (id: string) => string;
  readonly status: number;
  readonly location?: (id: string) => string;
}

const ADMITTED_AND_REFUSED_SHAPES: readonly ShapeCase[] = [
  {
    path: (id) => `/d/${id}/review`,
    status: 307,
    location: (id) => `/ro/d/${id}/review`,
  },
  {
    path: (id) => `/d/${id}/contact`,
    status: 307,
    location: (id) => `/ro/d/${id}/contact`,
  },
  {
    path: (id) => `/d/${id}/done`,
    status: 307,
    location: (id) => `/ro/d/${id}/done`,
  },
  { path: (id) => `/ro/d/${id}/review`, status: 200 },
  { path: (id) => `/ru/d/${id}/review`, status: 200 },
  // The contact step is a page since wave 8L and the done step one since wave 8M (the owner's and a stranger's request
  // alike answer 200, the stranger's with the load-error page).
  { path: (id) => `/ro/d/${id}/contact`, status: 200 },
  { path: (id) => `/ru/d/${id}/contact`, status: 200 },
  { path: (id) => `/ro/d/${id}/done`, status: 200 },
  { path: (id) => `/ru/d/${id}/done`, status: 200 },
  { path: (id) => `/d/${id}/edit`, status: 404 },
  { path: (id) => `/ro/d/${id}/edit`, status: 404 },
  { path: (id) => `/d/${id}/Review`, status: 404 },
  { path: (id) => `/ro/d/${id}/Review`, status: 404 },
  { path: (id) => `/ro/d/${id}/REVIEW`, status: 404 },
  { path: (id) => `/ro/d/${id}/Contact`, status: 404 },
  { path: (id) => `/ro/d/${id}/DONE`, status: 404 },
  { path: (id) => `/ro/d/${id}/%72eview`, status: 404 },
  { path: (id) => `/d/${id}/review/extra`, status: 404 },
  { path: (id) => `/ro/d/${id}/review/extra`, status: 404 },
  { path: (id) => `/ro/d/${id}/review/review`, status: 404 },
  { path: (id) => `/ro/d/${id}/review%2Fextra`, status: 404 },
  { path: (id) => `/ro/d/${id}/review;x`, status: 404 },
  { path: (id) => `/ro/d/${id}/review.json`, status: 404 },
  { path: (id) => `/RO/d/${id}/review`, status: 404 },
  { path: (id) => `/s/${id}/review`, status: 404 },
  { path: (id) => `/ro/s/${id}/review`, status: 404 },
  { path: (id) => `/ro/s/${id}/contact`, status: 404 },
  { path: (id) => `/ro/s/${id}/done`, status: 404 },
  { path: () => "/ro/configurator/review", status: 404 },
  { path: (id) => `/ro/api/designs/${id}/review`, status: 404 },
];

test("the three step addresses are admitted per language and nothing longer, differently named or differently cased is, for the owner as for a stranger", async ({
  browser,
  baseURL,
}) => {
  const visitors = await mintTwoVisitors(browser, baseUrlOf(baseURL));
  try {
    for (const shape of ADMITTED_AND_REFUSED_SHAPES) {
      const path = shape.path(visitors.ownedId);
      for (const cookies of [visitors.owner, {}]) {
        const answer = await ask(visitors.baseURL, path, cookies);

        expect(answer.status, path).toBe(shape.status);
        if (shape.location !== undefined)
          expect(answer.headers.location, path).toBe(
            shape.location(visitors.ownedId),
          );
        if (shape.status === 404)
          expect(answer.body, path).not.toContain("design-load-error");
      }
    }
  } finally {
    await visitors.cleanUp();
  }
});

test("an encoded slash before the step name opens no review: it is an id nobody owns, to its owner too", async ({
  browser,
  baseURL,
}) => {
  const visitors = await mintTwoVisitors(browser, baseUrlOf(baseURL));
  try {
    const answer = await ask(
      visitors.baseURL,
      `/ro/d/${visitors.ownedId}%2Freview`,
      visitors.owner,
    );

    expect(answer.status).toBe(200);
    expect(answer.body).toContain('data-testid="design-load-error"');
    expect(answer.body).not.toContain("review-bottom");
  } finally {
    await visitors.cleanUp();
  }
});

for (const door of ["", "/review"] as const) {
  test(`another visitor's design opened at /d/{id}${door} with ?select= and ?settings=open: the refusal page, nothing selected, nothing opened, no request for the design and an untouched cookie jar`, async ({
    page,
    context,
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    const foreignDesign = await mintSeededDesign(await ownerContext.newPage());
    const own = await mintSeededDesign(page);
    try {
      const jarBefore = await context.cookies();
      const requests = recordRequests(page);
      const address = `/ro/d/${foreignDesign.id}${door}${ARRIVAL_QUERY}`;

      await page.goto(address);

      await expect(page.getByTestId("design-load-error")).toBeVisible();
      // Long enough for an arrival effect to have run had the screen mounted.
      await page.waitForTimeout(1500);
      await expect(page.locator("canvas")).toHaveCount(0);
      await expect(page.getByTestId("editor-panel")).toHaveCount(0);
      await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
      await expect(page.getByTestId("review-bottom")).toHaveCount(0);
      await expect(page.locator("main")).toHaveCount(1);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(
        address,
      );
      expect(
        requests.filter((request) => request.pathname.startsWith("/api/")),
        JSON.stringify(requests),
      ).toEqual([]);
      expect(await context.cookies()).toEqual(jarBefore);
    } finally {
      await ownerContext.close();
      await deleteMintedDesigns([foreignDesign.id, own.id]);
    }
  });
}
