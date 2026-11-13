"use client";

import type { KitchenViewed3dVersion } from "@lemnaria/configurator-domain";

import { useReloadOnPageRestore } from "@/account/use-claim";
import { SharedDesignView } from "@/app/s/[token]/shared-design-view";
import type { AppLocale } from "@/i18n/routing";
import { useStaffKitchenCopy } from "@/i18n/use-content";

import { FailedKitchens } from "./staff-kitchens-states";
import {
  CannotShowNotice,
  KitchenHeader,
  KitchenNotAvailable,
  LoadingKitchen,
} from "./staff-kitchen-states";
import {
  StaffForbiddenScreen,
  StaffShell,
  type StaffShellContext,
} from "./staff-shell";
import styles from "./staff-kitchen.module.css";
import {
  useStaffKitchen3d,
  type StaffKitchen3dState,
} from "./use-staff-kitchen-3d";

// The scene fills the viewport; every other state is drawn in the staff frame, whose language links keep the 3D view.

export function StaffKitchen3dScreen({
  locale,
  context,
  designId,
  version,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly designId: string;
  readonly version: KitchenViewed3dVersion | undefined;
}) {
  useReloadOnPageRestore();
  const { state, retry } = useStaffKitchen3d({ designId, version });
  if (state.phase === "ready") {
    return (
      <SharedDesignView
        design={state.shown.design}
        localeQuery={version === undefined ? undefined : { version }}
      />
    );
  }
  if (state.phase === "forbidden") {
    return (
      <StaffForbiddenScreen
        locale={locale}
        page="kitchens"
        kitchenId={designId}
        kitchen3d={{ version }}
        context={context}
      />
    );
  }
  return (
    <StaffShell
      locale={locale}
      page="kitchens"
      kitchenId={designId}
      kitchen3d={{ version }}
      context={context}
    >
      <section className={styles.page} data-testid="staff-kitchen-3d-page">
        <NoSceneStates locale={locale} state={state} onRetry={retry} />
      </section>
    </StaffShell>
  );
}

function NoSceneStates({
  locale,
  state,
  onRetry,
}: {
  readonly locale: AppLocale;
  readonly state: Exclude<
    StaffKitchen3dState,
    { phase: "ready" | "forbidden" }
  >;
  readonly onRetry: () => void;
}) {
  const copy = useStaffKitchenCopy();
  switch (state.phase) {
    case "loading":
      return (
        <>
          <KitchenHeader
            locale={locale}
            title={copy.title}
            sub={copy.loadingSub}
          />
          <LoadingKitchen />
        </>
      );
    case "failed":
      return (
        <>
          <KitchenHeader locale={locale} title={copy.title} />
          <FailedKitchens failure={state.failure} onRetry={onRetry} />
        </>
      );
    case "not-found":
      return <KitchenNotAvailable locale={locale} />;
    case "unreadable":
      return (
        <>
          <KitchenHeader locale={locale} title={copy.title} />
          <CannotShowNotice />
        </>
      );
  }
}
