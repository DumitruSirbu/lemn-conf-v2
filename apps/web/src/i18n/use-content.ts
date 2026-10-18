"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  resolveAccountForgotCopy,
  resolveAccountKitCopy,
  resolveAccountShellCopy,
  resolveContent,
} from "./content";

export function useContent() {
  const translate = useTranslations();
  return useMemo(() => resolveContent(translate), [translate]);
}

export function useAccountKitCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountKitCopy(translate), [translate]);
}

export function useAccountShellCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountShellCopy(translate), [translate]);
}

export function useAccountForgotCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountForgotCopy(translate), [translate]);
}
