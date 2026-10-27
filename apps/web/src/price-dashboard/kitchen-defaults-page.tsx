"use client";

import { useTranslations } from "next-intl";
import type { FormEvent } from "react";

import { FormNotice } from "@/account/account-form-parts";
import type { AppLocale } from "@/i18n/routing";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { CatalogUnavailableNotice } from "./catalog-states";
import type { KitchenDefaultsClient } from "./kitchen-defaults-client";
import type { KitchenDefaultsPageInput } from "./kitchen-defaults-model";
import { KitchenDefaultsRows } from "./kitchen-defaults-rows";
import styles from "./kitchen-defaults.module.css";
import {
  useKitchenDefaults,
  type KitchenDefaultsDesk,
} from "./use-kitchen-defaults";

// The values a new kitchen starts with (frames D9A to D9C). A save applies at once to the kitchens created after it and to
// no saved one (A-9), so there is no publication and no price here.

export function KitchenDefaultsScreen({
  locale,
  context,
  input,
  client,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly input: KitchenDefaultsPageInput;
  /** Where a save goes and where the facts are read again; the screen's own stand-in when absent (see the client's note). */
  readonly client?: KitchenDefaultsClient | undefined;
}) {
  return (
    <StaffShell locale={locale} page="defaults" context={context}>
      <KitchenDefaults initialInput={input} client={client} />
    </StaffShell>
  );
}

/** The facts could not be read: the frame stays, and the notice stands in the page's place. */
export function KitchenDefaultsUnavailableScreen({
  locale,
  context,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
}) {
  return (
    <StaffShell locale={locale} page="defaults" context={context}>
      <CatalogUnavailableNotice />
    </StaffShell>
  );
}

function KitchenDefaults({
  initialInput,
  client,
}: {
  readonly initialInput: KitchenDefaultsPageInput;
  readonly client: KitchenDefaultsClient | undefined;
}) {
  const translate = useTranslations();
  const desk = useKitchenDefaults({ initialInput, client });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (desk.canSave) desk.save();
  };
  return (
    <section className={styles.page} data-testid="kitchen-defaults">
      <div className={styles.heading}>
        <h1 ref={desk.titleRef} tabIndex={-1} className={styles.title}>
          {translate("priceDashboard.defaults.title")}
        </h1>
        <p className={styles.subtitle}>
          {translate("priceDashboard.defaults.subtitle")}
        </p>
      </div>
      <DefaultsNoticeView desk={desk} />
      <form
        ref={desk.formRef}
        className={styles.form}
        aria-busy={desk.isSaving}
        noValidate
        onSubmit={submit}
      >
        <KitchenDefaultsRows desk={desk} />
        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.primaryAction}
            disabled={!desk.canSave}
          >
            {translate("priceDashboard.common.save")}
          </button>
          {desk.canCancel ? (
            <button
              type="button"
              className={styles.secondaryAction}
              disabled={desk.isSaving}
              onClick={desk.cancel}
            >
              {translate("priceDashboard.common.cancel")}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function DefaultsNoticeView({ desk }: { readonly desk: KitchenDefaultsDesk }) {
  const translate = useTranslations();
  switch (desk.notice) {
    case "applies":
      return (
        <FormNotice tone="info" ref={desk.noticeRef}>
          {translate("priceDashboard.defaults.appliesNote")}
        </FormNotice>
      );
    case "saved":
      return (
        <FormNotice
          tone="success"
          ref={desk.noticeRef}
          title={translate("priceDashboard.defaults.savedTitle")}
        >
          {translate("priceDashboard.defaults.savedBody")}
        </FormNotice>
      );
    case "changed-meanwhile":
      return (
        <FormNotice tone="error" ref={desk.noticeRef}>
          {translate("priceDashboard.errors.changedMeanwhile")}
        </FormNotice>
      );
    case "save-failed":
      return (
        <FormNotice tone="error" ref={desk.noticeRef}>
          {translate("priceDashboard.errors.saveFailed")}
        </FormNotice>
      );
  }
}
