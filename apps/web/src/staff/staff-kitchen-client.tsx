"use client";

import type { ReactNode } from "react";

import { useStaffKitchenCopy, useStaffKitchensCopy } from "@/i18n/use-content";

import { isolated } from "./bidi-isolate";
import { mailLinkOf, phoneLinkOf } from "./contact-links";
import { Card } from "./staff-kitchen-card";
import styles from "./staff-kitchen.module.css";
import type { StaffKitchenClientWire } from "./staff-kitchens-wire-contract";

/** The client's profile contact. The e-mail and the phone carry an action only when `contact-links.ts` accepts them;
 *  every value stays a text child. see ADR 0185 decision 7. */
export function ClientProfile({
  client,
}: {
  readonly client: StaffKitchenClientWire | null;
}) {
  const copy = useStaffKitchenCopy();
  const lists = useStaffKitchensCopy();
  return (
    <Card
      title={copy.profile.title}
      tag={copy.profile.tag}
      testId="staff-kitchen-profile"
    >
      {client === null ? (
        <p className={styles.muted}>{lists.noAccount}</p>
      ) : (
        <dl className={styles.facts}>
          <ProfileFact label={copy.profile.email} value={client.email}>
            <EmailAction email={client.email} />
          </ProfileFact>
          <ProfileFact
            label={copy.profile.name}
            value={client.name ?? lists.noValue}
          />
          <ProfileFact
            label={copy.profile.phone}
            value={client.phone ?? lists.noValue}
            sub={client.phone === null ? undefined : lists.phoneUnverified}
          >
            {client.phone === null ? null : (
              <PhoneAction phone={client.phone} />
            )}
          </ProfileFact>
          {client.address === null ? null : (
            <ProfileFact label={copy.profile.address} value={client.address} />
          )}
        </dl>
      )}
    </Card>
  );
}

function EmailAction({ email }: { readonly email: string }) {
  const { profile } = useStaffKitchenCopy();
  const link = mailLinkOf(email);
  if (link === null) {
    return null;
  }
  return (
    <a
      className={styles.factAction}
      href={link.href}
      aria-label={profile.writeTo(isolated(link.value))}
      data-testid="staff-kitchen-profile-write"
    >
      {profile.write}
    </a>
  );
}

function PhoneAction({ phone }: { readonly phone: string }) {
  const { profile } = useStaffKitchenCopy();
  const link = phoneLinkOf(phone);
  if (link === null) {
    return null;
  }
  return (
    <a
      className={styles.factAction}
      href={link.href}
      aria-label={profile.callTo(isolated(link.value))}
      data-testid="staff-kitchen-profile-call"
    >
      {profile.call}
    </a>
  );
}

function ProfileFact({
  label,
  value,
  sub,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly sub?: string | undefined;
  readonly children?: ReactNode;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>
        {value}
        {sub === undefined ? null : (
          <span className={styles.factSub}>{sub}</span>
        )}
        {children}
      </dd>
    </div>
  );
}
