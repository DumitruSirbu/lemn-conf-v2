"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { AccessoryCreation } from "@lemnaria/configurator-domain";

import {
  NO_FEEDBACK,
  textEntryOf,
  type CreationFeedback,
  type TextEntry,
} from "./creation-entries";
import { readLeiInput, type LeiInputReading } from "./price-field-input";
import { useLateAnswerGuard } from "./use-late-answer-guard";
import type { PriceDraft } from "./use-price-draft";

// Typing and creating a new linked accessory: its Romanian name and description, the cabinet type it follows and its
// price per unit, each read before anything is sent. The accessory goes to "De publicat" in one write, inactive. The
// description may be left empty; the cabinet type may not, since an accessory without a link earns nothing. A refusal
// or a failure is shown only while the values it was about are still on screen, but an accessory that was created is
// told at once whatever has been typed since: it is in the draft.

export interface PriceEntry {
  readonly text: string;
  readonly reading: LeiInputReading;
  /** The person has typed in it, so a refusal of it is shown. */
  readonly isTouched: boolean;
}

export interface LinkEntry {
  /** The build id of the chosen cabinet type; empty while none is. */
  readonly buildId: string;
  /** The person has opened the choice and left it empty, so its absence is shown. */
  readonly isTouched: boolean;
}

export interface AccessoryCreationForm {
  readonly name: TextEntry;
  readonly description: TextEntry;
  readonly link: LinkEntry;
  readonly price: PriceEntry;
  readonly feedback: CreationFeedback;
  readonly canCreate: boolean;
  /** Everything else is ready and only the cabinet type is not chosen: what keeps Create off, which the form says. */
  readonly isWaitingForLink: boolean;
  /** Whether the client can create an accessory at all; where it cannot, the form says so and sends nothing. */
  readonly canWrite: boolean;
  readonly isCreating: boolean;
  readonly typeName: (text: string) => void;
  readonly typeDescription: (text: string) => void;
  readonly chooseLink: (buildId: string) => void;
  readonly typePrice: (text: string) => void;
  readonly create: () => Promise<void>;
}

type TouchedKey = "name" | "description" | "link" | "price";

export function useAccessoryCreation({
  draft,
}: {
  readonly draft: Pick<
    PriceDraft,
    "createAccessory" | "canCreateAccessory" | "isBusy"
  >;
}): AccessoryCreationForm {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [buildId, setBuildId] = useState("");
  const [priceText, setPriceText] = useState("");
  const [touched, setTouched] = useState<ReadonlySet<TouchedKey>>(new Set());
  const [feedback, setFeedback] = useState<CreationFeedback>(NO_FEEDBACK);
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const { moveOn: markMoved, begin } = useLateAnswerGuard();
  const { createAccessory, canCreateAccessory: canWrite, isBusy } = draft;

  const nameEntry = useMemo(
    () =>
      textEntryOf({
        text: name,
        field: "name",
        isTouched: touched.has("name"),
      }),
    [name, touched],
  );
  const descriptionEntry = useMemo(
    () => optionalDescriptionOf(description, touched.has("description")),
    [description, touched],
  );
  const price = useMemo<PriceEntry>(
    () => ({
      text: priceText,
      reading: readLeiInput(priceText),
      isTouched: touched.has("price"),
    }),
    [priceText, touched],
  );
  const link = useMemo<LinkEntry>(
    () => ({ buildId, isTouched: touched.has("link") }),
    [buildId, touched],
  );
  const isReadyBesidesLink =
    canWrite &&
    nameEntry.judgement.ok &&
    descriptionEntry.judgement.ok &&
    price.reading.kind === "amount" &&
    feedback.kind !== "created" &&
    !isCreating &&
    !isBusy;
  const canCreate = isReadyBesidesLink && buildId !== "";
  const isWaitingForLink = isReadyBesidesLink && buildId === "";

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
  const chooseLink = useCallback(
    (chosen: string) => {
      moveOn("link");
      setBuildId(chosen);
    },
    [moveOn],
  );
  const typePrice = useCallback(
    (text: string) => {
      moveOn("price");
      setPriceText(text);
    },
    [moveOn],
  );

  const create = useCallback(async () => {
    const value = creationOf({
      name: nameEntry,
      description: descriptionEntry,
      buildId,
      price,
    });
    if (!canCreate || isCreatingRef.current || value === undefined) return;
    const hasMoved = begin();
    isCreatingRef.current = true;
    setIsCreating(true);
    try {
      const result = await createAccessory(value);
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
    buildId,
    price,
    begin,
    createAccessory,
  ]);

  return {
    name: nameEntry,
    description: descriptionEntry,
    link,
    price,
    feedback,
    canCreate,
    isWaitingForLink,
    canWrite,
    isCreating,
    typeName,
    typeDescription,
    chooseLink,
    typePrice,
    create,
  };
}

/** A description that is empty (or only blanks) is left out; any other must read as the domain's text rule asks. */
function optionalDescriptionOf(text: string, isTouched: boolean): TextEntry {
  if (text.trim() === "") {
    return { text, judgement: { ok: true, text: "" }, isTouched };
  }
  return textEntryOf({ text, field: "description", isTouched });
}

/** What is sent, or nothing while any value is one that is not. */
function creationOf({
  name,
  description,
  buildId,
  price,
}: {
  readonly name: TextEntry;
  readonly description: TextEntry;
  readonly buildId: string;
  readonly price: PriceEntry;
}): AccessoryCreation | undefined {
  if (!name.judgement.ok || !description.judgement.ok) return undefined;
  if (buildId === "" || price.reading.kind !== "amount") return undefined;
  return {
    linkedBuildId: buildId,
    perUnitMinor: price.reading.minor,
    name: name.judgement.text,
    ...(description.judgement.text === ""
      ? {}
      : { description: description.judgement.text }),
  };
}
