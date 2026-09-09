"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { resolveContent } from "./content";

export function useContent() {
  const translate = useTranslations();
  return useMemo(() => resolveContent(translate), [translate]);
}
