import {
  FakeAccountKitchenStore,
  FakeSentMarkStore,
} from "@lemnaria/persistence";

/**
 * The module `@/lib/server/contact/sent-mark-store-instance` for a test that drives the contact route through its
 * production ports: the persistence package's own fake over rows of its own, so no test opens a connection from a
 * `DATABASE_URL` in the shell to run `update designs set sent_at`. Used as
 * `vi.mock(".../sent-mark-store-instance", () => import("<here>").then((fake) => fake.fakeSentMarkStoreModule()))`.
 */
export function fakeSentMarkStoreModule() {
  return {
    getSentMarkStore: () =>
      new FakeSentMarkStore(new FakeAccountKitchenStore()),
  };
}
