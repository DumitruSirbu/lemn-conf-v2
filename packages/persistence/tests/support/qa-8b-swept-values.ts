import { fc } from "@fast-check/vitest";

import { DATABASE_NAMES_BY_ENVIRONMENT } from "../../src/migration-target.js";
import {
  FAKE_DATABASE,
  QA_HOST,
  QA_PASSWORD,
  QA_USER,
} from "./qa-8b-connection-values.js";

export const LISTED_NAMES: readonly string[] = [
  ...DATABASE_NAMES_BY_ENVIRONMENT.values(),
].flat();

/**
 * Characters a URL parser strips, encodes or passes on, and that a later consumer of the raw string may not take: line
 * breaks, NUL and other controls, the edges of Latin-1, and characters above U+00FF.
 */
export const ODD_CHARACTERS: readonly string[] = [
  "\n",
  "\r",
  "\r\n",
  "\u0000",
  "\t",
  " ",
  "\u001f",
  "\u007f",
  "\u0080",
  "é",
  "ÿ",
  "Ā",
  "€",
  " ",
  "😀",
];

const FRAGMENTS: readonly string[] = [
  "postgres://",
  "postgresql://",
  "POSTGRES://",
  "postgres:",
  "mysql://",
  QA_USER,
  QA_PASSWORD,
  QA_HOST,
  FAKE_DATABASE,
  ...LISTED_NAMES,
  ...ODD_CHARACTERS,
  "..",
  "'",
  ":",
  "@",
  "/",
  "?",
  "#",
  "%ZZ",
  "%2F",
  "%",
  "[",
  "]",
  "\\",
  "5432",
  "notaport",
  "sslmode=require",
];

const assembledValue = fc
  .array(fc.oneof(fc.constantFrom(...FRAGMENTS), fc.string({ maxLength: 3 })), {
    maxLength: 14,
  })
  .map((parts) => parts.join(""));

const nearlyWellFormedValue = fc
  .record({
    scheme: fc.constantFrom(
      "postgres://",
      "postgresql://",
      "postgres:",
      "mysql://",
    ),
    user: fc.constantFrom(
      QA_USER,
      "",
      `${QA_USER}%ZZ`,
      `${QA_USER}%40`,
      `a@b\\${QA_USER}`,
    ),
    password: fc.constantFrom(
      `:${QA_PASSWORD}`,
      ":",
      "",
      `:${QA_PASSWORD}%ZZ`,
      `:x@${QA_PASSWORD}`,
      `:1/${QA_PASSWORD}`,
    ),
    host: fc.constantFrom(
      QA_HOST,
      "",
      `${QA_HOST}:5432`,
      `${QA_HOST}:notaport`,
      `${QA_HOST}'x`,
    ),
    path: fc.constantFrom(
      `/${FAKE_DATABASE}`,
      "",
      "/",
      "/%ZZ",
      "?sslmode=x",
      ...LISTED_NAMES.map((name) => `/${name}`),
      ...LISTED_NAMES.map((name) => `/x/../${name}`),
      ...LISTED_NAMES.map((name) => `/${name.slice(0, 4)}\t${name.slice(4)}`),
      ...LISTED_NAMES.map((name) => `/${name}?dbname=other`),
    ),
  })
  .map(
    ({ scheme, user, password, host, path }) =>
      `${scheme}${user}${password}@${host}${path}`,
  );

const QUERIES: readonly string[] = [
  "",
  "?sslmode=require",
  "?sslmode=require&channel_binding=require",
  "?sslrootcert=/qa-8b-no-such-directory/root.pem",
  "?sslcert=client.pem&sslkey=client.key",
];

/**
 * A well-formed string with one or two odd characters put at any place its grammar has: before it, after it, on every
 * boundary between two parts, and inside every part.
 */
const valueWithOddCharacters = fc
  .record({
    name: fc.constantFrom(FAKE_DATABASE, ...LISTED_NAMES),
    query: fc.constantFrom(...QUERIES),
    insertions: fc.array(
      fc.record({
        place: fc.nat(),
        character: fc.constantFrom(...ODD_CHARACTERS),
      }),
      { minLength: 1, maxLength: 2 },
    ),
  })
  .map(({ name, query, insertions }) => {
    const parts = [
      "postgresql",
      "://",
      QA_USER,
      ":",
      QA_PASSWORD,
      "@",
      QA_HOST,
      ":5432",
      "/",
      name,
      query,
    ];
    for (const { place, character } of insertions)
      insertAt(parts, place, character);
    return parts.join("");
  });

/** Even places are the boundaries (the last is the end of the string); odd places are the middles of the parts. */
function insertAt(parts: string[], place: number, character: string): void {
  const slot = place % (2 * parts.length + 1);
  const index = Math.floor(slot / 2);
  if (index === parts.length) {
    parts.push(character);
    return;
  }
  const part = parts[index] ?? "";
  const middle = slot % 2 === 0 ? 0 : Math.ceil(part.length / 2);
  parts[index] = `${part.slice(0, middle)}${character}${part.slice(middle)}`;
}

export const anyValue = fc.oneof(
  assembledValue,
  nearlyWellFormedValue,
  valueWithOddCharacters,
);

export const SWEEP = { seed: 20261007, numRuns: 4000 };

/** Every distinct swept string: what a test that must use each one iterates, rather than sampling again. */
export function sweptValues(): string[] {
  return [...new Set(fc.sample(anyValue, SWEEP))];
}
