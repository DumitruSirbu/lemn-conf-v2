import { readdirSync } from "node:fs";
import { join } from "node:path";

const TYPESCRIPT_FILE = /\.tsx?$/;

/** Every file under `directory`, at any depth, whose name matches `namePattern` (TypeScript files by default). */
export function filesUnder(
  directory: string,
  namePattern: RegExp = TYPESCRIPT_FILE,
): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, namePattern);
    return namePattern.test(entry.name) ? [path] : [];
  });
}
