import {
  spawn,
  type ChildProcess,
  type StdioOptions,
} from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";

import { resolveTestDatabaseUrl } from "@lemnaria/persistence";

import { DIGEST_SECRET_VARIABLE } from "../../../src/lib/server/digest/digest-secret-variable";
import { PUBLIC_ORIGIN_VARIABLE } from "../../../src/lib/server/public-origin-variable";
import { E2E_RATE_LIMIT_POLICY_FLAG } from "../../../src/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "../../../src/lib/server/rate-limit/network-source";

import { makeSecondServerSecret } from "./csp-report-rows";
import { RUN_SECRET_VARIABLE } from "./e2e-rate-limit-run";
import {
  FAKE_MAIL_FLAG_NAME,
  MAIL_VARIABLES_THE_SUITE_REFUSES,
} from "./fake-mail-environment";
import { publicOriginEnvironmentOf } from "./public-origin-environment";

// Every port a spec's own server listens on, here and nowhere else, each with what it is for. The suite's own server is
// on 4320 (`playwright.config.ts`). Two specs of one run start their servers at once, so each names a port of its own.

/** 4322: the spec that proves the production policy's real figure. */
export const PRODUCTION_POLICY_SERVER_PORT = 4322;

/** 4323: the live spec of the refused mint. */
export const REFUSED_MINT_LIVE_SERVER_PORT = 4323;

/** 4324: the spec that proves a page read is counted, whose server is given a network source the owner names. */
export const PAGE_READ_PROOF_SERVER_PORT = 4324;

/** 4325: the sweep of a page's address written with percent-escapes, whose server is given a network source too. */
export const ESCAPED_LOCALE_SERVER_PORT = 4325;

/** 4326: the contact pages say so and draw no form where the server cannot take a request: no fake sender, so no mail
 *  variable of any kind is usable. */
export const CONTACT_UNAVAILABLE_SERVER_PORT = 4326;

/** 4327: what a browser is sent for an address no route answers, and for the capture pages when their flag is off: a
 *  server not given `LEMNARIA_ENABLE_SCENE_SHOT_ROUTE`. */
export const UNMATCHED_ADDRESSES_SERVER_PORT = 4327;

/** 4328: a report sent from a share view, on a server whose output the spec reads. */
export const CSP_SHARE_REPORT_SERVER_PORT = 4328;

/** 4329: the hostile-body set against the sink, on a server of its own so no report it sends is the suite's. */
export const CSP_SINK_SERVER_PORT = 4329;

/** 4330: a failed render: a server whose database cannot be reached. */
export const FAILED_RENDER_SERVER_PORT = 4330;

/** A developer whose 4322 is taken sets this; a spec that names its own port ignores it. Read when a server starts,
 *  never when the module loads. */
const PORT_OVERRIDE_VARIABLE = "E2E_PRODUCTION_POLICY_PORT";

const READINESS_PATH = "/ro/d/e2e-readiness-probe";
const READY_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const STOP_TIMEOUT_MS = 10_000;

/**
 * Variables the second server must never inherit: they would choose its secret, policy, network source or public
 * origin, or give it a mail sender. It runs under `CI`, where a Gmail name inherited from the runner would be a real one.
 */
const NOT_INHERITED: readonly string[] = [
  DIGEST_SECRET_VARIABLE,
  PUBLIC_ORIGIN_VARIABLE,
  CLIENT_NETWORK_SOURCE_VARIABLE,
  E2E_RATE_LIMIT_POLICY_FLAG,
  RUN_SECRET_VARIABLE,
  FAKE_MAIL_FLAG_NAME,
  ...MAIL_VARIABLES_THE_SUITE_REFUSES,
];

export interface ProductionPolicyServerOptions {
  /** The one variable a second server may be given that the suite's never is: the network source the owner names. */
  readonly networkSource?: string;
  /** Keep what the server writes to its standard output and error, for {@link ProductionPolicyServer.output}. */
  readonly captureOutput?: boolean;
  /** A `DATABASE_URL` that names no reachable host, so a render that reads a design fails. It is never the
   *  application's database and never printed. Absent, the server gets the guarded test database. */
  readonly unreachableDatabaseUrl?: string;
}

export interface ProductionPolicyServer {
  readonly origin: string;
  /** This server's own secret, made for it alone; the keys it counts under are computed from it. */
  readonly secret: string;
  /** Everything the server wrote to standard output and error since it started. Throws unless the server was started
   *  with `captureOutput: true`: an empty string there would let a negative assertion pass vacuously. */
  output(): string;
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
  const secret = makeSecondServerSecret();
  const origin = `http://localhost:${String(port)}`;
  const child = spawnNextStart({
    port,
    environment: environmentOfTheServer({ secret, origin }, options),
    stdio: stdioOf(options),
  });
  const written = keepOutputOf(child);
  const exited = new Promise<never>((_resolve, reject) => {
    child.once("exit", () => {
      reject(
        new Error("The production-policy server stopped before it was ready"),
      );
    });
  });
  await Promise.race([waitUntilReady(origin), exited]);
  return {
    origin,
    secret,
    output: () => outputOf(written, options),
    stop: () => stopProcess(child),
  };
}

function portOfThisRun(): number {
  return Number(
    process.env[PORT_OVERRIDE_VARIABLE] ?? PRODUCTION_POLICY_SERVER_PORT,
  );
}

interface NextStartLaunch {
  readonly port: number;
  readonly environment: NodeJS.ProcessEnv;
  readonly stdio: StdioOptions;
}

function stdioOf({
  captureOutput,
}: ProductionPolicyServerOptions): StdioOptions {
  return captureOutput === true ? ["ignore", "pipe", "pipe"] : "ignore";
}

function outputOf(
  written: readonly string[],
  { captureOutput }: ProductionPolicyServerOptions,
): string {
  if (captureOutput !== true) {
    throw new Error(
      "The server's output was not kept: start it with `captureOutput: true` to read it",
    );
  }
  return written.join("");
}

function spawnNextStart({
  port,
  environment,
  stdio,
}: NextStartLaunch): ChildProcess {
  const directory = process.cwd();
  return spawn(
    process.execPath,
    [nextBinaryOf(directory), "start", "--port", String(port)],
    { cwd: directory, env: environment, stdio },
  );
}

/** What a child wrote to either stream, in arrival order; the streams are drained so a full pipe never stalls it. */
function keepOutputOf(child: ChildProcess): string[] {
  const written: string[] = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding("utf8");
    stream?.on("data", (chunk: string) => {
      written.push(chunk);
    });
  }
  return written;
}

/** What is this server's alone: its secret, and the origin it listens on. */
interface OwnServerValues {
  readonly secret: string;
  readonly origin: string;
}

function environmentOfTheServer(
  { secret, origin }: OwnServerValues,
  { networkSource, unreachableDatabaseUrl }: ProductionPolicyServerOptions,
): NodeJS.ProcessEnv {
  const environment: Record<string, string | undefined> = {
    ...inheritedEnvironmentOf(process.env),
    ...publicOriginEnvironmentOf(origin),
  };
  // The guarded resolver refuses anything but an allowlisted test database, as the suite's own server's does.
  environment.DATABASE_URL = unreachableDatabaseUrl ?? resolveTestDatabaseUrl();
  environment[DIGEST_SECRET_VARIABLE] = secret;
  if (networkSource !== undefined) {
    environment[CLIENT_NETWORK_SOURCE_VARIABLE] = networkSource;
  }
  return environment as NodeJS.ProcessEnv;
}

/** What the second server inherits of the runner's environment: all of it, less what `NOT_INHERITED` names. */
export function inheritedEnvironmentOf(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) => !NOT_INHERITED.includes(name),
    ),
  );
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
