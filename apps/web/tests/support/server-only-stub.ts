// Test-only stand-in for the `server-only` package, aliased in `vitest.config.ts`. The real
// package throws unless Next's RSC bundler condition is set, which vitest never sets — modules
// under test that import `server-only` (e.g. `lib/server/*.ts`) are exercised as plain Node
// modules here, so this import must be a no-op rather than the exception it would normally throw.
export {};
