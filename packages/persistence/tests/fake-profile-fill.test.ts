import {
  FakeAccountStore,
  type HeldProfileColumns,
} from "../src/fake-account-store.js";
import {
  describeProfileFillContract,
  type ProfileFillWorld,
  type ProfileSeed,
} from "./support/profile-fill-contract.js";

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;

function aFakeWorld(): ProfileFillWorld {
  const store = new FakeAccountStore();
  let accountCount = 0;

  async function anAccount(seed: ProfileSeed): Promise<string> {
    accountCount += 1;
    const email = `fill.${String(accountCount)}@example.invalid`;
    const created = await store.createUnverified({
      email,
      emailNormalForm: email,
      phone: seed.phone ?? undefined,
      locale: "ro",
      privacyNoticeVersion: "2026-10-draft",
      passwordHash: PASSWORD_HASH,
    });
    if (created.kind !== "created") throw new Error("the address was taken");
    await store.updateProfile({
      accountId: created.accountId,
      changes: {
        ...(seed.name === null ? {} : { name: seed.name }),
        ...(seed.address === null ? {} : { address: seed.address }),
      },
    });
    return created.accountId;
  }

  function columnsOf(accountId: string): Promise<HeldProfileColumns> {
    const held = store.heldProfileOf(accountId);
    if (held === undefined) throw new Error("no such account");
    return Promise.resolve(held);
  }

  return { store, anAccount, columnsOf };
}

describeProfileFillContract("FakeAccountStore.fillProfileBlanks", aFakeWorld);
