import { readFileSync } from "node:fs";
import { join } from "node:path";

import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
import { NeonShareLinkRepository } from "../src/share-link-repository.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  everySentQuery,
  queryDriver,
  resetQueryDriver,
  type SentQuery,
} from "./support/mocked-neon-query-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The S4 gate (plan S4, ADR 0172 D9): a design its client hid or deleted is refused by every statement an account, a
 * visitor or a share link can reach it by, and the refusal is the one that an unknown id gets. The gate is the pair
 * `hidden_by_client_at is null and deleted_by_client_at is null` in each statement's own predicate.
 *
 * Two readings of the same fact, so that neither can drift from the other. The SOURCE census reads every `this.sql`
 * template of the two repositories, names the method that holds it, and pins how many pairs it carries: a statement
 * added without the gate, a gate dropped from one half, or a gate moved into another statement changes a number here.
 * The SENT census runs each public method against a recording driver and reads the text that actually leaves.
 */
const PAIR =
  /(?:d\.)?hidden_by_client_at is null and (?:d\.)?deleted_by_client_at is null/g;
const HIDDEN_HALF = /(?:d\.)?hidden_by_client_at is null/g;
const DELETED_HALF = /(?:d\.)?deleted_by_client_at is null/g;
const REACHES_DESIGNS = /\b(?:from|join|update|into) designs\b/;
const METHOD_START = /^ {2}(?:private |public )?(?:async )?([A-Za-z]\w*)\(/gm;

const SRC = join(import.meta.dirname, "..", "src");

interface SourceTemplate {
  readonly method: string;
  readonly pairs: number;
  readonly text: string;
}

function templatesOf(fileName: string): SourceTemplate[] {
  const source = readFileSync(join(SRC, fileName), "utf8");
  const methods = [...source.matchAll(METHOD_START)].map((match) => ({
    name: match[1] ?? "",
    at: match.index,
  }));
  return [...source.matchAll(/this\.sql`([\s\S]*?)`/g)].map((match) => {
    const enclosing = methods
      .filter((method) => method.at < match.index)
      .at(-1);
    return {
      method: enclosing?.name ?? "(outside any method)",
      pairs: (match[1]?.match(PAIR) ?? []).length,
      text: match[1] ?? "",
    };
  });
}

function pairsByMethod(
  templates: readonly SourceTemplate[],
): Record<string, number[]> {
  const grouped: Record<string, number[]> = {};
  for (const { method, pairs } of templates)
    (grouped[method] ??= []).push(pairs);
  return grouped;
}

/** Per method, the pairs each of its templates carries, in source order. */
const GATED_CONFIGURATION_METHODS = {
  updateByWriteToken: [3],
  updateByAccount: [3],
  loadOwned: [1],
  loadAuthorized: [1],
  resume: [2],
};

/** Statements that reach `designs` without the pair, and why that is right. Each is asserted below, not just listed. */
const EXEMPT_CONFIGURATION_METHODS = {
  // A mint reads back, and rotates the visitor of, rows the same browser owns; it writes a new row with no marks.
  mintStatements: [0, 0],
  mintInsert: [0, 0],
  // The ungated read: no production caller since ADR 0114 Amendment H2; the live suites need an unfiltered read.
  load: [0],
  // Both name `account_id is null`: only a claimed design can carry a mark, so an unclaimed one is never marked.
  countClaimable: [0],
  claimVisitorDesigns: [0],
};

const GATED_SHARE_LINK_METHODS = {
  issueStatementsByWriteToken: [1, 1, 1, 1],
  issueStatementsByAccount: [1, 1, 1, 1],
  revokeByWriteToken: [1],
  revokeByAccount: [1],
  statusByWriteToken: [2],
  statusByAccount: [2],
  loadShared: [1],
};

describe("S4: the source census of every statement that reaches `designs`", () => {
  describe("neon-configuration-repository.ts", () => {
    const templates = templatesOf("neon-configuration-repository.ts");

    it("classifies every template: the gated methods and the named exemptions are all of them", () => {
      expect(pairsByMethod(templates)).toEqual({
        ...GATED_CONFIGURATION_METHODS,
        ...EXEMPT_CONFIGURATION_METHODS,
      });
    });

    it("carries ten gate pairs, and no half of one on its own", () => {
      const code = templates.map(({ text }) => text).join("\n");

      expect(templates.reduce((sum, { pairs }) => sum + pairs, 0)).toBe(10);
      expect(code.match(HIDDEN_HALF)).toHaveLength(10);
      expect(code.match(DELETED_HALF)).toHaveLength(10);
    });

    it("reaches `designs` in every template, so none of the twelve is exempt for not being a designs statement", () => {
      expect(templates).toHaveLength(12);
      for (const { text } of templates) expect(text).toMatch(REACHES_DESIGNS);
    });

    it("leaves the exemptions exempt: a mint's statements, the ungated load and the claim carry no mark predicate", () => {
      const exempt = templates.filter(
        ({ method }) => method in EXEMPT_CONFIGURATION_METHODS,
      );

      for (const { text } of exempt) expect(text).not.toContain("by_client_at");
    });

    it("keeps the unclaimed-only predicate on the claim and the claimable count", () => {
      for (const method of ["countClaimable", "claimVisitorDesigns"]) {
        const [template] = templates.filter(
          (candidate) => candidate.method === method,
        );
        expect(template?.text).toContain(
          "visitor_hash = ${visitorHash} and account_id is null",
        );
      }
    });
  });

  describe("share-link-repository.ts", () => {
    const templates = templatesOf("share-link-repository.ts");

    it("classifies every template: each is gated, and the gated methods are all of them", () => {
      expect(pairsByMethod(templates)).toEqual(GATED_SHARE_LINK_METHODS);
    });

    it("carries fifteen gate pairs, and no half of one on its own", () => {
      const code = templates.map(({ text }) => text).join("\n");

      expect(templates.reduce((sum, { pairs }) => sum + pairs, 0)).toBe(15);
      expect(code.match(HIDDEN_HALF)).toHaveLength(15);
      expect(code.match(DELETED_HALF)).toHaveLength(15);
    });

    it("reaches `designs` in every one of its thirteen templates, and every one is gated", () => {
      expect(templates).toHaveLength(13);
      for (const { text, pairs } of templates) {
        expect(text).toMatch(REACHES_DESIGNS);
        expect(pairs).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it("pins the total: twenty-five gate pairs across the two repositories", () => {
    const total = [
      ...templatesOf("neon-configuration-repository.ts"),
      ...templatesOf("share-link-repository.ts"),
    ].reduce((sum, { pairs }) => sum + pairs, 0);

    expect(total).toBe(25);
  });
});

/* ---- the same fact read off what is sent ---- */

const WRITE_TOKEN_HASH = "1".repeat(64);
const VISITOR_HASH = "2".repeat(64);
const TOKEN_HASH = "3".repeat(64);
const ACCOUNT_ID = "A".repeat(21);
const DESIGN_ID = "design-under-test";

const configuration = () =>
  new NeonConfigurationRepository(WELL_FORMED_UNREACHABLE_VALUE);
const shareLinks = () =>
  new NeonShareLinkRepository(WELL_FORMED_UNREACHABLE_VALUE);

function pairsIn(statements: readonly SentQuery[]): number {
  return statements.reduce(
    (sum, { text }) =>
      sum + (text.replace(/\s+/g, " ").match(PAIR) ?? []).length,
    0,
  );
}

async function sentBy(
  call: () => Promise<unknown>,
  reply: unknown,
): Promise<SentQuery[]> {
  resetQueryDriver();
  answerQueryWith(reply);
  await call();
  return everySentQuery();
}

const SAVE = {
  id: DESIGN_ID,
  design: KITCHEN_L_DESIGN,
  expectedRevision: "1",
  requestVisitor: { kind: "absent" },
} as const;
const SAVED_ROW = [{ is_authorised: true, revision: "2", owns_visitor: false }];
const WRITE_TOKEN_SHARE = {
  kind: "write-token",
  writeTokenHash: WRITE_TOKEN_HASH,
  visitorHash: VISITOR_HASH,
} as const;
const ACCOUNT_SHARE = { kind: "account", accountId: ACCOUNT_ID } as const;

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("S4: what each method sends carries the gate in every statement that reaches `designs`", () => {
  const cases: readonly [string, () => Promise<SentQuery[]>, number][] = [
    [
      "saveAuthorized by write token",
      () =>
        sentBy(
          () =>
            configuration().saveAuthorized({
              ...SAVE,
              credential: { kind: "write-token", hash: WRITE_TOKEN_HASH },
            }),
          SAVED_ROW,
        ),
      3,
    ],
    [
      "saveAuthorized by account",
      () =>
        sentBy(
          () =>
            configuration().saveAuthorized({
              ...SAVE,
              credential: { kind: "account", accountId: ACCOUNT_ID },
            }),
          SAVED_ROW,
        ),
      3,
    ],
    [
      "loadOwned by visitor and account",
      () =>
        sentBy(
          () =>
            configuration().loadOwned({
              id: DESIGN_ID,
              accessor: { visitorHash: VISITOR_HASH, accountId: ACCOUNT_ID },
            }),
          [],
        ),
      1,
    ],
    [
      "loadAuthorized",
      () =>
        sentBy(
          () =>
            configuration().loadAuthorized({
              id: DESIGN_ID,
              writeTokenHash: WRITE_TOKEN_HASH,
              visitorHash: VISITOR_HASH,
            }),
          [],
        ),
      1,
    ],
    [
      "resume",
      () =>
        sentBy(
          () =>
            configuration().resume({
              visitorHash: VISITOR_HASH,
              accountId: ACCOUNT_ID,
            }),
          [],
        ),
      2,
    ],
    [
      "share issue by write token",
      () =>
        sentBy(
          () =>
            shareLinks().issue({
              designId: DESIGN_ID,
              credential: WRITE_TOKEN_SHARE,
              tokenHash: TOKEN_HASH,
            }),
          [{ token_hash: TOKEN_HASH }],
        ),
      4,
    ],
    [
      "share issue by account",
      () =>
        sentBy(
          () =>
            shareLinks().issue({
              designId: DESIGN_ID,
              credential: ACCOUNT_SHARE,
              tokenHash: TOKEN_HASH,
            }),
          [{ token_hash: TOKEN_HASH }],
        ),
      4,
    ],
    [
      "share revoke by write token",
      () =>
        sentBy(
          () =>
            shareLinks().revoke({
              designId: DESIGN_ID,
              credential: WRITE_TOKEN_SHARE,
            }),
          [{ is_authorised: true }],
        ),
      1,
    ],
    [
      "share revoke by account",
      () =>
        sentBy(
          () =>
            shareLinks().revoke({
              designId: DESIGN_ID,
              credential: ACCOUNT_SHARE,
            }),
          [{ is_authorised: true }],
        ),
      1,
    ],
    [
      "share status by write token",
      () =>
        sentBy(
          () =>
            shareLinks().status({
              designId: DESIGN_ID,
              credential: WRITE_TOKEN_SHARE,
            }),
          [{ is_authorised: true, active: true }],
        ),
      2,
    ],
    [
      "share status by account",
      () =>
        sentBy(
          () =>
            shareLinks().status({
              designId: DESIGN_ID,
              credential: ACCOUNT_SHARE,
            }),
          [{ is_authorised: true, active: true }],
        ),
      2,
    ],
    [
      "the public share read",
      () => sentBy(() => shareLinks().loadShared(TOKEN_HASH), []),
      1,
    ],
  ];

  it.each(cases)("%s", async (_label, call, expectedPairs) => {
    const statements = await call();

    expect(statements.length).toBeGreaterThan(0);
    expect(pairsIn(statements)).toBe(expectedPairs);
    for (const statement of statements) {
      const text = statement.text.replace(/\s+/g, " ");
      if (REACHES_DESIGNS.test(text)) expect(text.match(PAIR)).not.toBeNull();
    }
  });

  it("a share issue sends four statements and each of them carries the gate", async () => {
    const statements = await sentBy(
      () =>
        shareLinks().issue({
          designId: DESIGN_ID,
          credential: ACCOUNT_SHARE,
          tokenHash: TOKEN_HASH,
        }),
      [{ token_hash: TOKEN_HASH }],
    );

    expect(statements).toHaveLength(4);
    expect(statements.map((statement) => pairsIn([statement]))).toEqual([
      1, 1, 1, 1,
    ]);
    expect(queryDriver.transactions[0]?.options).toEqual({
      isolationLevel: "ReadCommitted",
    });
  });

  describe("each credential's arm names its own credential and not the other's", () => {
    it("the write-token arms name the write token and never an account", async () => {
      const save = await sentBy(
        () =>
          configuration().saveAuthorized({
            ...SAVE,
            credential: { kind: "write-token", hash: WRITE_TOKEN_HASH },
          }),
        SAVED_ROW,
      );
      const issue = await sentBy(
        () =>
          shareLinks().issue({
            designId: DESIGN_ID,
            credential: WRITE_TOKEN_SHARE,
            tokenHash: TOKEN_HASH,
          }),
        [{ token_hash: TOKEN_HASH }],
      );

      for (const statement of [...save, ...issue]) {
        expect(statement.text).toContain("write_token_hash");
        expect(statement.text).not.toContain("account_id");
      }
    });

    it("the account arms name the account and never a write token", async () => {
      const save = await sentBy(
        () =>
          configuration().saveAuthorized({
            ...SAVE,
            credential: { kind: "account", accountId: ACCOUNT_ID },
          }),
        SAVED_ROW,
      );
      const issue = await sentBy(
        () =>
          shareLinks().issue({
            designId: DESIGN_ID,
            credential: ACCOUNT_SHARE,
            tokenHash: TOKEN_HASH,
          }),
        [{ token_hash: TOKEN_HASH }],
      );

      for (const statement of [...save, ...issue]) {
        expect(statement.text).toContain("account_id");
        expect(statement.text).not.toContain("write_token_hash");
      }
    });
  });

  it("a resume asks for the newest open design inside each candidate query, before its limit", async () => {
    const [statement] = await sentBy(
      () =>
        configuration().resume({
          visitorHash: VISITOR_HASH,
          accountId: ACCOUNT_ID,
        }),
      [],
    );
    const text = (statement?.text ?? "").replace(/\s+/g, " ");

    const candidates = [
      ...text.matchAll(
        /\(select id, updated_at from designs where (.*?) limit 1\)/g,
      ),
    ];
    expect(candidates).toHaveLength(2);
    for (const [, predicate] of candidates) expect(predicate).toMatch(PAIR);
  });
});

describe("S4: a hidden or deleted design is `none` at the mapping as well as in the text", () => {
  it("loadOwned, loadAuthorized and loadShared answer none for a statement that matched no row", async () => {
    resetQueryDriver();
    answerQueryWith([]);
    expect(
      await configuration().loadOwned({
        id: DESIGN_ID,
        accessor: { visitorHash: VISITOR_HASH },
      }),
    ).toEqual({ kind: "none" });

    answerQueryWith([]);
    expect(
      await configuration().loadAuthorized({
        id: DESIGN_ID,
        writeTokenHash: WRITE_TOKEN_HASH,
        visitorHash: VISITOR_HASH,
      }),
    ).toEqual({ kind: "none" });

    answerQueryWith([]);
    expect(await shareLinks().loadShared(TOKEN_HASH)).toEqual({ kind: "none" });
  });

  it("a share status for a design the gate excludes is `refused`, with no word about a link", async () => {
    resetQueryDriver();
    answerQueryWith([{ is_authorised: false, active: false }]);

    expect(
      await shareLinks().status({
        designId: DESIGN_ID,
        credential: ACCOUNT_SHARE,
      }),
    ).toBe("refused");
  });

  it("a share issue whose closing select finds nothing is `refused`", async () => {
    resetQueryDriver();
    answerQueryWith([]);

    expect(
      await shareLinks().issue({
        designId: DESIGN_ID,
        credential: ACCOUNT_SHARE,
        tokenHash: TOKEN_HASH,
      }),
    ).toBe("refused");
  });
});
