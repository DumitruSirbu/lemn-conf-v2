"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  HARDWARE_RATE_FIELDS,
  isRateNeverZero,
  judgeCreatedRowText,
  type CreatedRowTextJudgement,
  type HardwareRateField,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import type { LeiInputReading } from "./price-field-input";
import { readLeiInput, refusingZero } from "./price-field-input";
import type { HardwareRatesWire } from "./price-dashboard-wire-contract";
import { useLateAnswerGuard } from "./use-late-answer-guard";
import type { CreateWriteResult, PriceDraft } from "./use-price-draft";

// Typing and creating a new hardware class (frame D4C): its Romanian name and description, and one rate for each mechanism,
// each read before anything is sent. The class and every rate go to "De publicat" in one write, so the draft never holds
// a class with a rate nobody set. A refusal or a failure is shown only while the values it was about are still on screen,
// but a class that was created is told at once whatever has been typed since: it is in the draft.

export type CreationFeedback =
  | { readonly kind: "none" }
  | { readonly kind: "created"; readonly created: ItemRef }
  | {
      readonly kind: "failed";
      readonly failure: Exclude<
        CreateWriteResult,
        { kind: "created" | "busy" }
      >;
    };

export interface RateEntry {
  readonly field: HardwareRateField;
  readonly text: string;
  readonly reading: LeiInputReading;
  /** The person has typed in it, so a refusal of it is shown. */
  readonly isTouched: boolean;
}

export interface TextEntry {
  readonly text: string;
  readonly judgement: CreatedRowTextJudgement;
  readonly isTouched: boolean;
}

export interface HardwareCreation {
  readonly name: TextEntry;
  readonly description: TextEntry;
  readonly rates: readonly RateEntry[];
  readonly feedback: CreationFeedback;
  readonly canCreate: boolean;
  /** Whether the client can create a class at all; where it cannot, the form says so and sends nothing. */
  readonly canWrite: boolean;
  readonly isCreating: boolean;
  readonly typeName: (text: string) => void;
  readonly typeDescription: (text: string) => void;
  readonly typeRate: (field: HardwareRateField, text: string) => void;
  readonly create: () => Promise<void>;
}

type TouchedKey = "name" | "description" | HardwareRateField;

export function useHardwareCreation({
  draft,
}: {
  readonly draft: Pick<
    PriceDraft,
    "createHardwareClass" | "canCreateHardwareClass" | "isBusy"
  >;
}): HardwareCreation {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rateTexts, setRateTexts] = useState<
    Readonly<Partial<Record<HardwareRateField, string>>>
  >({});
  const [touched, setTouched] = useState<ReadonlySet<TouchedKey>>(new Set());
  const [feedback, setFeedback] = useState<CreationFeedback>({ kind: "none" });
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const { moveOn: markMoved, begin } = useLateAnswerGuard();
  const {
    createHardwareClass,
    canCreateHardwareClass: canWrite,
    isBusy,
  } = draft;

  const nameEntry = useMemo(
    () => textEntryOf(name, "name", touched),
    [name, touched],
  );
  const descriptionEntry = useMemo(
    () => textEntryOf(description, "description", touched),
    [description, touched],
  );
  const rates = useMemo(
    () => rateEntriesOf(rateTexts, touched),
    [rateTexts, touched],
  );
  const canCreate =
    canWrite &&
    nameEntry.judgement.ok &&
    descriptionEntry.judgement.ok &&
    rates.every((rate) => rate.reading.kind === "amount") &&
    feedback.kind !== "created" &&
    !isCreating &&
    !isBusy;

  const moveOn = useCallback(
    (key: TouchedKey) => {
      markMoved();
      setTouched((held) => new Set(held).add(key));
      setFeedback((held) => (held.kind === "created" ? held : NO_FEEDBACK));
    },
    [markMoved],
  );

  const typeName = useCallback(
    (text: string) => {
      moveOn("name");
      setName(text);
    },
    [moveOn],
  );
  const typeDescription = useCallback(
    (text: string) => {
      moveOn("description");
      setDescription(text);
    },
    [moveOn],
  );
  const typeRate = useCallback(
    (field: HardwareRateField, text: string) => {
      moveOn(field);
      setRateTexts((held) => ({ ...held, [field]: text }));
    },
    [moveOn],
  );

  const create = useCallback(async () => {
    const value = creationOf(nameEntry, descriptionEntry, rates);
    if (!canCreate || isCreatingRef.current || value === undefined) return;
    const hasMoved = begin();
    isCreatingRef.current = true;
    setIsCreating(true);
    try {
      const result = await createHardwareClass(value);
      if (result.kind === "busy") return;
      if (result.kind === "created") {
        setFeedback({ kind: "created", created: result.created });
      } else if (!hasMoved()) {
        setFeedback({ kind: "failed", failure: result });
      }
    } finally {
      isCreatingRef.current = false;
      setIsCreating(false);
    }
  }, [
    canCreate,
    nameEntry,
    descriptionEntry,
    rates,
    begin,
    createHardwareClass,
  ]);

  return {
    name: nameEntry,
    description: descriptionEntry,
    rates,
    feedback,
    canCreate,
    canWrite,
    isCreating,
    typeName,
    typeDescription,
    typeRate,
    create,
  };
}

const NO_FEEDBACK: CreationFeedback = { kind: "none" };

function textEntryOf(
  text: string,
  field: "name" | "description",
  touched: ReadonlySet<TouchedKey>,
): TextEntry {
  return {
    text,
    judgement: judgeCreatedRowText(text, field),
    isTouched: touched.has(field),
  };
}

function rateEntriesOf(
  texts: Readonly<Partial<Record<HardwareRateField, string>>>,
  touched: ReadonlySet<TouchedKey>,
): readonly RateEntry[] {
  return HARDWARE_RATE_FIELDS.map((field) => {
    const text = texts[field] ?? "";
    return {
      field,
      text,
      reading: readRate(field, text),
      isTouched: touched.has(field),
    };
  });
}

/** A typed rate as an amount; a rate that is never free is refused at zero and when empty. */
function readRate(field: HardwareRateField, text: string): LeiInputReading {
  const reading = readLeiInput(text);
  return isRateNeverZero(field) ? refusingZero(reading) : reading;
}

/** What is sent, or nothing while any value is one that is not. */
function creationOf(
  name: TextEntry,
  description: TextEntry,
  rates: readonly RateEntry[],
):
  | {
      readonly value: { readonly name: string; readonly description: string };
      readonly rates: HardwareRatesWire;
    }
  | undefined {
  if (!name.judgement.ok || !description.judgement.ok) return undefined;
  const amounts = amountsOf(rates);
  if (amounts === undefined) return undefined;
  return {
    value: {
      name: name.judgement.text,
      description: description.judgement.text,
    },
    rates: amounts,
  };
}

/** The amount of every rate, or nothing while one is not an amount. */
function amountsOf(rates: readonly RateEntry[]): HardwareRatesWire | undefined {
  const amounts: Partial<Record<HardwareRateField, number>> = {};
  for (const field of HARDWARE_RATE_FIELDS) {
    const entry = rates.find((rate) => rate.field === field);
    if (entry?.reading.kind !== "amount") return undefined;
    amounts[field] = entry.reading.minor;
  }
  // The loop has set every field of the list, which is the whole record.
  return amounts as HardwareRatesWire;
}
