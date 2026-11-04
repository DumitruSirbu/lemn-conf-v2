"use client";

import { createContext, useCallback, useMemo, useState } from "react";

// A price field that holds text nobody sent tells the page, so the page can keep a publish from putting the old figure
// live. Each field reports under its own id; the page holds the ids that currently hold text. A field drawn where no
// page listens (the cabinet list) reports to nobody.

export type ReportUnsentAmount = (fieldId: string, isUnsent: boolean) => void;

export const UnsentAmountsContext = createContext<
  ReportUnsentAmount | undefined
>(undefined);

export interface UnsentAmounts {
  readonly hasUnsentAmount: boolean;
  readonly reportUnsentAmount: ReportUnsentAmount;
}

export function useUnsentAmounts(): UnsentAmounts {
  const [holdingFieldIds, setHoldingFieldIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const reportUnsentAmount = useCallback<ReportUnsentAmount>(
    (fieldId, isUnsent) => {
      setHoldingFieldIds((held) => {
        if (held.has(fieldId) === isUnsent) return held;
        const next = new Set(held);
        if (isUnsent) next.add(fieldId);
        else next.delete(fieldId);
        return next;
      });
    },
    [],
  );
  return useMemo(
    () => ({ hasUnsentAmount: holdingFieldIds.size > 0, reportUnsentAmount }),
    [holdingFieldIds, reportUnsentAmount],
  );
}
