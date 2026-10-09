import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";

import { resolveTestDatabaseUrl } from "@lemnaria/persistence";

import { RUN_SECRET_VARIABLE, makeRunSecret } from "./e2e-rate-limit-run";

const PORT = Number(process.env.E2E_PRODUCTION_POLICY_PORT ?? 4322);
const ORIGIN = `http://localhost:${String(PORT)}`;
const READINESS_PATH = "/ro/d/e2e-readiness-probe";
const READY_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const STOP_TIMEOUT_MS = 10_000;

/** Variables the second server must never inherit: they would choose its secret, policy or network source. */
const NOT_INHERITED = [
  "DIGEST_SECRET",
  "CLIENT_NETWORK_SOURCE",
  "LEMNARIA_E2E_RATE_LIMIT_POLICY",
  RUN_SECRET_VARIABLE,
];

export interface ProductionPolicyServer {
  readonly origin: string;
  /** This server's own secret, made for it alone; the keys it counts under are computed from it. */
  readonly secret: string;
  stop(): Promise<void>;
}

/**
 * A second server beside the suite's, under the production policy: no policy flag, no network source, and a secret of
 * its own, on the test database. It is `next start` of the production build the first server made, so it runs under
 * `CI` only and builds nothing: a build inside a developer's run would write where a running server reads. Only a
 * process it started is ever stopped.
 */
export async function startProductionPolicyServer(): Promise<ProductionPolicyServer> {
  if (process.env.CI === undefined) {
    throw new Error(
      "The second server shares the first server's production build, which only a CI run has",
    );
  }
  await requirePortFree();
  const directory = process.cwd();
  const next = nextBinaryOf(directory);
  const secret = makeRunSecret();
  const environment = environmentOfTheServer(secret);

  const child = spawn(
    process.execPath,
    [next, "start", "--port", String(PORT)],
    {
      cwd: directory,
      env: environment,
      stdio: "ignore",
    },
  );
  const exited = new Promise<never>((_resolve, reject) => {
    child.once("exit", () => {
      reject(
        new Error("The production-policy server stopped before it was ready"),
      );
    });
  });
  await Promise.race([waitUntilReady(), exited]);
  return { origin: ORIGIN, secret, stop: () => stopProcess(child) };
}

function environmentOfTheServer(secret: string): NodeJS.ProcessEnv {
  const environment: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !NOT_INHERITED.includes(name),
    ),
  );
  // The guarded resolver refuses anything but an allowlisted test database, as the suite's own server's does.
  environment.DATABASE_URL = resolveTestDatabaseUrl();
  environment.DIGEST_SECRET = secret;
  return environment as NodeJS.ProcessEnv;
}

function nextBinaryOf(directory: string): string {
  if (!existsSync(join(directory, "next.config.ts"))) {
    throw new Error(
      "The e2e suite must run from apps/web, where the application is",
    );
  }
  return createRequire(join(directory, "package.json")).resolve(
    "next/dist/bin/next",
  );
}

/** A port that something already answers on is not ours to use: a request there would be counted by another server. */
async function requirePortFree(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => {
      reject(
        new Error(
          `Port ${String(PORT)} is in use; the second server needs it free`,
        ),
      );
    });
    probe.listen(PORT, () => {
      probe.close(() => {
        resolve();
      });
    });
  });
}

async function waitUntilReady(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isAnswering()) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("The production-policy server was not ready in time");
}

async function isAnswering(): Promise<boolean> {
  try {
    const response = await fetch(`${ORIGIN}${READINESS_PATH}`);
    return response.status === 200;
  } catch {
    return false;
  }
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => {
      resolve();
    });
  });
  child.kill("SIGTERM");
  const forced = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
  await exited;
  clearTimeout(forced);
}
