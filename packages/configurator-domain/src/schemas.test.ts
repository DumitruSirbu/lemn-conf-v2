import { describe, expect, it } from "vitest";

import { ConfigurationTimestampSchema, ContactDataSchema } from "./schemas.js";

describe("ConfigurationTimestampSchema", () => {
  it("accepts an offset ISO timestamp at millisecond precision", () => {
    expect(
      ConfigurationTimestampSchema.safeParse("2026-08-20T12:00:00.000Z")
        .success,
    ).toBe(true);
  });

  it("rejects a timestamp with more than millisecond precision", () => {
    expect(
      ConfigurationTimestampSchema.safeParse("2026-08-20T12:00:00.0001Z")
        .success,
    ).toBe(false);
  });

  it("rejects a timestamp with no offset", () => {
    expect(
      ConfigurationTimestampSchema.safeParse("2026-08-20T12:00:00.000").success,
    ).toBe(false);
  });
});

describe("ContactDataSchema", () => {
  it("requires name and phone, permits an optional valid email, and stays separate", () => {
    expect(
      ContactDataSchema.parse({
        name: "Ana",
        phone: "+373 60 000 000",
      }),
    ).toEqual({ name: "Ana", phone: "+373 60 000 000" });
    expect(
      ContactDataSchema.safeParse({
        name: "Ana",
        phone: "+373 60 000 000",
        email: "ana@example.com",
      }).success,
    ).toBe(true);
    expect(ContactDataSchema.safeParse({ name: "Ana" }).success).toBe(false);
    expect(
      ContactDataSchema.safeParse({
        name: "Ana",
        phone: "123",
        configuration: { anything: true },
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      ContactDataSchema.safeParse({
        name: "Ana",
        phone: "+373 60 000 000",
        email: "not-an-email",
      }).success,
    ).toBe(false);
  });
});
