"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { resolveAccountKitCopy, resolveContent } from "./content";

export function useContent() {
  const translate = useTranslations();
  return useMemo(() => resolveContent(translate), [translate]);
}

export function useAccountKitCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountKitCopy(translate), [translate]);
}
