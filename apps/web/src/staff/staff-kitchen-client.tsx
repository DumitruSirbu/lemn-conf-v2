"use client";

import { useStaffKitchenCopy, useStaffKitchensCopy } from "@/i18n/use-content";

import { Card } from "./staff-kitchen-card";
import styles from "./staff-kitchen.module.css";
import type { StaffClientWire } from "./staff-kitchens-wire-contract";

/** The client's profile contact, as text. Neither the phone nor the address is a link to dial or to write: a staff screen
 *  does not do either on a click. */
export function ClientProfile({
  client,
}: {
  readonly client: StaffClientWire | null;
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
          <ProfileFact label={copy.profile.email} value={client.email} />
          <ProfileFact
            label={copy.profile.name}
            value={client.name ?? lists.noValue}
          />
          <ProfileFact
            label={copy.profile.phone}
            value={client.phone ?? lists.noValue}
            sub={client.phone === null ? undefined : lists.phoneUnverified}
          />
        </dl>
      )}
    </Card>
  );
}

function ProfileFact({
  label,
  value,
  sub,
}: {
  readonly label: string;
  readonly value: string;
  readonly sub?: string | undefined;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>
        {value}
        {sub === undefined ? null : (
          <span className={styles.factSub}>{sub}</span>
        )}
      </dd>
    </div>
  );
}
