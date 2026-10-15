// A fresh process that counts every `Function` construction while the built domain package is imported and
// every schema it exports parses a valid and an invalid value. Run by `zod-without-eval.test.ts`; its
// own process is the point: Zod caches its eval probe in module state, so only a graph that has not
// loaded Zod yet can show whether the probe runs (8Q.10, ADR 0161 decision 9).
//
// Usage: node function-construction-trap.mjs <file URL of dist/index.js>
// Prints one JSON document on stdout: { constructions, schemaNames, outcomes }.
const RealFunction = globalThis.Function;
const constructions = [];

function record(args) {
  constructions.push(args.map(String));
}

globalThis.Function = new Proxy(RealFunction, {
  construct(target, args, newTarget) {
    record(args);
    return Reflect.construct(target, args, newTarget);
  },
  apply(target, thisArg, args) {
    record(args);
    return Reflect.apply(target, thisArg, args);
  },
});

const domain = await import(process.argv[2]);

const { placements, room, settings } = domain.KITCHEN_L_DESIGN;
const firstPlacement = placements[0];

const VALID_SAMPLES = {
  ConfigurationTimestampSchema: "2026-08-25T00:00:00.000Z",
  ContactDataSchema: {
    name: "Ana",
    phone: "0712345678",
    email: "ana@example.com",
  },
  HandleSchema: "steel",
  DesignWallSchema: "A",
  DesignRoomShapeSchema: "L",
  CabinetBodySchema: firstPlacement.body,
  DesignPlacementSchema: firstPlacement,
  EmptyColumnSchema: {
    wall: "A",
    alongMm: 1000,
    widthMm: 600,
    y0Mm: 0,
    topMm: 720,
    depthMm: 600,
  },
  StoredColumnExtentSchema: {
    wall: "A",
    alongMm: 1000,
    widthMm: 600,
    y0Mm: 0,
    topMm: 720,
    depthMm: 600,
  },
  DesignRoomSchema: room,
  DesignSettingsSchema: settings,
  LegacyDesignSchema: domain.KITCHEN_L_DESIGN,
  DesignSchema: domain.KITCHEN_L_DESIGN,
  CurrentDesignSchema: domain.KITCHEN_L_DESIGN,
  FinishSchema: { kind: "free-colour", value: "#b8c4a1" },
};
const INVALID_SAMPLE = { not: ["a", "value"], widthMm: -1 };

const schemaNames = Object.keys(domain).filter((name) =>
  name.endsWith("Schema"),
);

const outcomes = {};
for (const name of schemaNames) {
  const schema = domain[name];
  outcomes[name] = {
    hasSample: name in VALID_SAMPLES,
    validAccepted: schema.safeParse(VALID_SAMPLES[name]).success,
    invalidRefused: !schema.safeParse(INVALID_SAMPLE).success,
  };
}

// `z.email()` is built inside the contact functions rather than exported as a schema, so it is reached
// through the e-mail channel and through the counted-form check.
const emailContact = {
  name: "Ana",
  phone: "+40 712 345 678",
  locality: "Cluj",
  channel: "email",
  consent: true,
  consentTextVersion: "placeholder",
};
outcomes.validateContactFields = {
  hasSample: true,
  validAccepted: domain.validateContactFields({
    ...emailContact,
    email: "ana@example.com",
  }).ok,
  invalidRefused: !domain.validateContactFields({
    ...emailContact,
    email: "not an address",
  }).ok,
};
outcomes.isCountedFormOfAddress = {
  hasSample: true,
  validAccepted: domain.isCountedFormOfAddress("ana@example.com"),
  invalidRefused: !domain.isCountedFormOfAddress("not an address"),
};

process.stdout.write(JSON.stringify({ constructions, schemaNames, outcomes }));
