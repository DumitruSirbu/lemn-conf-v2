"use client";

// The one sentence under a preset dialog's content (`Presete.dc.html` `ST`): a toned box with a spinner or a glyph
// and the sentence, in a reserved 44 px area so the buttons below do not jump. The Preview pop-up and the save dialog
// both draw it.
import styles from "./preset-status-notice.module.css";

export type PresetStatusTone = "progress" | "error" | "warn" | "ok";

export interface PresetStatus {
  readonly tone: PresetStatusTone;
  readonly sentence: string;
}

/** Marks no locale has a say in: a tone is told by its glyph as well as its colour. */
const GLYPH_BY_TONE: Readonly<
  Record<Exclude<PresetStatusTone, "progress">, string>
> = {
  error: "!",
  warn: "!",
  ok: "✓",
};

/**
 * `status` is `undefined` while there is nothing to say. The live region is rendered anyway, so that it exists before
 * the sentence it will announce; its text is the sentence alone, with the mark outside it.
 */
export function PresetStatusNotice({
  status,
  testId,
}: {
  readonly status: PresetStatus | undefined;
  readonly testId: string;
}) {
  return (
    <div className={styles.area}>
      <div className={styles.notice} data-tone={status?.tone}>
        {status === undefined ? null : <Mark tone={status.tone} />}
        <p
          role="status"
          aria-live="polite"
          className={styles.sentence}
          data-testid={testId}
        >
          {status?.sentence}
        </p>
      </div>
    </div>
  );
}

function Mark({ tone }: { readonly tone: PresetStatusTone }) {
  if (tone === "progress") {
    return <span className={styles.spinner} aria-hidden="true" />;
  }
  return (
    <span className={styles.glyph} aria-hidden="true">
      {GLYPH_BY_TONE[tone]}
    </span>
  );
}
