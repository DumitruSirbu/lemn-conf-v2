import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";

import { resolveTestDatabaseUrl } from "@lemnaria/persistence";

import { DIGEST_SECRET_VARIABLE } from "../../../src/lib/server/digest/digest-secret-variable";
import { E2E_RATE_LIMIT_POLICY_FLAG } from "../../../src/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "../../../src/lib/server/rate-limit/network-source";

import { RUN_SECRET_VARIABLE, makeRunSecret } from "./e2e-rate-limit-run";

// Every port a spec's own server listens on, here and nowhere else, each with what it is for. The suite's own server is
// on 4320 (`playwright.config.ts`). Two specs of one run start their servers at once, so each names a port of its own.

/** 4322: the spec that proves the production policy's real figure. */
export const PRODUCTION_POLICY_SERVER_PORT = 4322;

/** 4323: the live spec of the refused mint, which is QA's and imports this name. */
export const REFUSED_MINT_LIVE_SERVER_PORT = 4323;

/** 4324: the spec that proves a page read is counted, whose server is given a network source the owner names. */
export const PAGE_READ_PROOF_SERVER_PORT = 4324;

/** 4325: the sweep of a page's address written with percent-escapes, whose server is given a network source too. */
export const ESCAPED_LOCALE_SERVER_PORT = 4325;

/** 4326: the spec that proves the contact pages say so, and draw no form, where the server cannot take a request: a
 *  server with no fake sender, so no mail variable of any kind is usable (8L criterion 7). */
export const CONTACT_UNAVAILABLE_SERVER_PORT = 4326;

/** 4327: the spec that proves what a browser is sent for an address no route answers, and for the capture pages when
 *  their flag is off: a server that is not given `LEMNARIA_ENABLE_SCENE_SHOT_ROUTE` (8Q criterion 1). */
export const UNMATCHED_ADDRESSES_SERVER_PORT = 4327;

/** A developer whose 4322 is taken sets this; a spec that names its own port ignores it. Read when a server starts,
 *  never when the module loads. */
const PORT_OVERRIDE_VARIABLE = "E2E_PRODUCTION_POLICY_PORT";

const READINESS_PATH = "/ro/d/e2e-readiness-probe";
const READY_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const STOP_TIMEOUT_MS = 10_000;

/** Variables the second server must never inherit: they would choose its secret, policy or network source. */
const NOT_INHERITED = [
  DIGEST_SECRET_VARIABLE,
  CLIENT_NETWORK_SOURCE_VARIABLE,
  E2E_RATE_LIMIT_POLICY_FLAG,
  RUN_SECRET_VARIABLE,
];

export interface ProductionPolicyServerOptions {
  /** The one variable a second server may be given that the suite's never is: the network source the owner names. */
  readonly networkSource?: string;
}

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
export async function startProductionPolicyServer(
  port: number = portOfThisRun(),
  options: ProductionPolicyServerOptions = {},
): Promise<ProductionPolicyServer> {
  if (process.env.CI === undefined) {
    throw new Error(
      "The second server shares the first server's production build, which only a CI run has",
    );
  }
  await requirePortFree(port);
  const secret = makeRunSecret();
  const child = spawnNextStart(port, environmentOfTheServer(secret, options));
  const exited = new Promise<never>((_resolve, reject) => {
    child.once("exit", () => {
      reject(
        new Error("The production-policy server stopped before it was ready"),
      );
    });
  });
  const origin = `http://localhost:${String(port)}`;
  await Promise.race([waitUntilReady(origin), exited]);
  return { origin, secret, stop: () => stopProcess(child) };
}

function portOfThisRun(): number {
  return Number(
    process.env[PORT_OVERRIDE_VARIABLE] ?? PRODUCTION_POLICY_SERVER_PORT,
  );
}

function spawnNextStart(
  port: number,
  environment: NodeJS.ProcessEnv,
): ChildProcess {
  const directory = process.cwd();
  return spawn(
    process.execPath,
    [nextBinaryOf(directory), "start", "--port", String(port)],
    { cwd: directory, env: environment, stdio: "ignore" },
  );
}

function environmentOfTheServer(
  secret: string,
  { networkSource }: ProductionPolicyServerOptions,
): NodeJS.ProcessEnv {
  const environment: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !NOT_INHERITED.includes(name),
    ),
  );
  // The guarded resolver refuses anything but an allowlisted test database, as the suite's own server's does.
  environment.DATABASE_URL = resolveTestDatabaseUrl();
  environment[DIGEST_SECRET_VARIABLE] = secret;
  if (networkSource !== undefined) {
    environment[CLIENT_NETWORK_SOURCE_VARIABLE] = networkSource;
  }
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
async function requirePortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => {
      reject(
        new Error(
          `Port ${String(port)} is in use; the second server needs it free`,
        ),
      );
    });
    probe.listen(port, () => {
      probe.close(() => {
        resolve();
      });
    });
  });
}

async function waitUntilReady(origin: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isAnswering(origin)) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("The production-policy server was not ready in time");
}

async function isAnswering(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}${READINESS_PATH}`);
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
