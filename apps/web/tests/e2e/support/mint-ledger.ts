import { createHmac } from "node:crypto";
import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Mixed into the file's name, so the name is not the run secret and not another digest of it. */
const LEDGER_NAME_LABEL = "lemnaria-e2e-mint-ledger";

const NO_SUCH_FILE = "ENOENT";

/** What the run's workers say they minted, which the counters in the database cannot say: they are read through the
 *  one key the harness computes, and a wrong key would make them all look empty. */
export interface MintLedgerOfTheRun {
  /** Adds the designs a worker minted. A line per call, so workers writing together lose none. */
  record(designsMinted: number): void;
  /** Answers every design recorded and removes the ledger. A run whose workers recorded none has no file: it is zero. */
  takeCount(): number;
}

/** The ledger of the run with this secret, in `directory`: a file named from a keyed digest of the secret. */
export function mintLedgerOfTheRun(
  secretHex: string,
  directory: string = tmpdir(),
): MintLedgerOfTheRun {
  const path = join(directory, ledgerFileName(secretHex));
  return {
    record: (designsMinted) => {
      appendFileSync(path, `${String(designsMinted)}\n`);
    },
    takeCount: () => {
      const count = countRecordedIn(path);
      rmSync(path, { force: true });
      return count;
    },
  };
}

function ledgerFileName(secretHex: string): string {
  const digest = createHmac("sha256", Buffer.from(secretHex, "hex"))
    .update(LEDGER_NAME_LABEL)
    .digest("hex");
  return `${LEDGER_NAME_LABEL}-${digest}.txt`;
}

function countRecordedIn(path: string): number {
  return recordedLinesOf(path).reduce((sum, line) => sum + Number(line), 0);
}

function recordedLinesOf(path: string): readonly string[] {
  try {
    return readFileSync(path, "utf8").split("\n").filter(isNotBlank);
  } catch (failure) {
    if (isMissingFile(failure)) return [];
    throw failure;
  }
}

function isNotBlank(line: string): boolean {
  return line !== "";
}

function isMissingFile(failure: unknown): boolean {
  return (
    failure instanceof Error &&
    (failure as NodeJS.ErrnoException).code === NO_SUCH_FILE
  );
}
