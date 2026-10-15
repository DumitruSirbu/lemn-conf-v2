import type { SentReferenceAnswer } from "@/done/result-to-show";

/** What the design contact page draws in place of nothing yet decided: the request already sent, or the form. */
export type ContactPageView =
  | { readonly kind: "already-sent"; readonly reference: string }
  | { readonly kind: "form" };

export interface ContactPageViewInput {
  /** What the server said of this design at the revision the page was loaded at. */
  readonly server: SentReferenceAnswer;
  /** The design and the stored revision the page was loaded at. */
  readonly page: { readonly designId: string; readonly revision: string };
  /** What the browser's store holds now. */
  readonly held: {
    readonly designId: string | null;
    readonly revision: string | null;
    readonly hasUnsavedEdit: boolean;
  };
}

const FORM: ContactPageView = { kind: "form" };

/**
 * Already sent only when the server answered `sent` and the store holds this design, clean, at the page's own revision.
 * Anything else, a kind this function does not know included, is the form: a failed read must not cost a lead. The
 * switch is exhaustive over the type, so a new kind is a compile error here and not a silent block.
 */
export function contactPageViewOf(
  input: ContactPageViewInput,
): ContactPageView {
  const { server, page, held } = input;
  switch (server.kind) {
    case "sent":
      return isHeldAsLoaded(page, held)
        ? { kind: "already-sent", reference: server.reference }
        : FORM;
    case "none":
    case "unknown":
      return FORM;
    default:
      server satisfies never;
      return FORM;
  }
}

function isHeldAsLoaded(
  page: ContactPageViewInput["page"],
  held: ContactPageViewInput["held"],
): boolean {
  return (
    held.designId === page.designId &&
    held.revision === page.revision &&
    !held.hasUnsavedEdit
  );
}

/**
 * The view for this render, given the one before it: once the form is decided it stays for the mount, whatever the store
 * does next, a reload of the sent revision included. `undefined` is the first render.
 */
export function nextContactPageView(
  previous: ContactPageView | undefined,
  input: ContactPageViewInput,
): ContactPageView {
  return previous?.kind === "form" ? previous : contactPageViewOf(input);
}
