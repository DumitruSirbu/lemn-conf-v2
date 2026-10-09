import { fc } from "@fast-check/vitest";

/** Text no refusal may repeat; every unstorable text below holds it. */
export const POISON_MARKER = "QA8I-POISON-MARKER";

/** A number no clean tree holds, swapped in a document's text for one a double cannot hold. */
export const NUMBER_SENTINEL = 918_273_645_546_372;

/** Texts a double cannot hold, which `JSON.parse` reads as an infinity. */
export const OVERFLOWING_NUMBER_TEXTS = ["1e999", "-1e999", "1e309"] as const;

type JsonObject = Record<string, unknown>;

const LARGEST_DOUBLE = Number.MAX_VALUE;
const SMALLEST_DOUBLE = Number.MIN_VALUE;

/** Storable text: printable ASCII, a whole surrogate pair, and the names a careless walk trips on. */
const cleanText: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.constantFrom(
    "",
    "😀",
    "x😀y",
    "__proto__",
    "constructor",
    "toString",
    'a"b\\c',
    " ",
    "é",
  ),
);

const cleanNumber: fc.Arbitrary<number> = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(
    -0,
    SMALLEST_DOUBLE,
    LARGEST_DOUBLE,
    -LARGEST_DOUBLE,
    Number.MAX_SAFE_INTEGER,
  ),
);

/** An object whose every key is its own property, `__proto__` included. */
function objectOf(
  entries: readonly (readonly [string, unknown])[],
): JsonObject {
  return Object.fromEntries(entries) as JsonObject;
}

const cleanTrees = fc.letrec<{ value: unknown; object: JsonObject }>((tie) => ({
  value: fc.oneof(
    { maxDepth: 4 },
    cleanText,
    cleanNumber,
    fc.boolean(),
    fc.constant(null),
    fc.array(tie("value"), { maxLength: 4 }),
    tie("object"),
  ),
  object: fc
    .array(fc.tuple(cleanText, tie("value")), { maxLength: 4 })
    .map(objectOf),
}));

/** A JSON object of storable text and finite numbers, a few levels deep. */
export const cleanJsonObject: fc.Arbitrary<JsonObject> = cleanTrees.object;

const cleanJsonList: fc.Arbitrary<unknown[]> = fc.array(cleanTrees.value, {
  maxLength: 3,
});

/** Text Postgres cannot hold: a NUL, either half of a pair alone, and a pair the wrong way round. */
export const unstorableText: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(
      "\u0000",
      "\uD800",
      "\uDBFF",
      "\uDC00",
      "\uDFFF",
      "\uDC00\uD800",
    ),
    fc.string({ maxLength: 6 }),
    fc.string({ maxLength: 6 }),
  )
  .map(
    ([unstorable, before, after]) =>
      `${POISON_MARKER}${before}${unstorable}${after}`,
  );

type Wrap = (inner: unknown) => unknown;

const wrapInObject: fc.Arbitrary<Wrap> = fc
  .tuple(cleanJsonObject, cleanText)
  .map(([around, key]) => (inner) => ({ ...around, [key]: inner }));

const wrapInList: fc.Arbitrary<Wrap> = fc
  .tuple(cleanJsonList, cleanJsonList)
  .map(([before, after]) => (inner) => [...before, inner, ...after]);

function buriedIn(innermost: fc.Arbitrary<unknown>): fc.Arbitrary<JsonObject> {
  return fc
    .tuple(
      innermost,
      fc.array(fc.oneof(wrapInObject, wrapInList), { maxLength: 6 }),
      wrapInObject,
    )
    .map(
      ([inner, wraps, outermost]) =>
        outermost(
          wraps.reduce((node, wrap) => wrap(node), inner),
        ) as JsonObject,
    );
}

/** A JSON object holding one unstorable text at any depth: as a value, as a list's member or as a key. */
export const objectHoldingUnstorableText: fc.Arbitrary<JsonObject> = buriedIn(
  fc.oneof(
    unstorableText,
    fc.tuple(unstorableText, cleanTrees.value).map(([key, value]) => ({
      ...objectOf([[key, value]]),
    })),
  ),
);

/** JSON text of an object holding, at any depth, one number a double cannot hold. */
export const textHoldingAnOverflowingNumber: fc.Arbitrary<string> = fc
  .tuple(
    buriedIn(fc.constant(NUMBER_SENTINEL)),
    fc.constantFrom(...OVERFLOWING_NUMBER_TEXTS),
  )
  .map(([tree, overflowing]) =>
    JSON.stringify(tree).replace(String(NUMBER_SENTINEL), overflowing),
  );
