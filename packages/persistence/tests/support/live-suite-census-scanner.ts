import { globSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import ts from "typescript";

import vitestConfig from "../../vitest.config.js";

/**
 * The scanner behind `tests/live-suite-census.test.ts` (M7 wave 7T, T-J7): it reads the test tree
 * from disk, decides which files reach a database, and classifies each one's gate and lock mode.
 * The census file holds the literal table and the assertions; this module holds only how a file is
 * read. Split out on review finding C1.1, 2026-09-22 — nothing about what it reports changed.
 *
 * **It opens no connection and names no database URL of its own**, so the census's own classifier
 * does not count it as connecting and the sweep stays accurate. `live-suite-census-scanner.test.ts`
 * asserts that, because a scanner that reached a database would quietly make every file that
 * imports it database-reaching.
 *
 * **How it reads a file.** Sources are parsed with the TypeScript compiler, not matched as text, so
 * a commented-out registration counts for nothing and an aliased import is read as the function it
 * really names. Pattern checks (URL sources, gates, the destructive pattern) run over the source
 * reprinted without comments. Module links followed: static imports, `export … from` re-exports and
 * `import("…")` with a literal path.
 *
 * **Limits, stated so nobody trusts more than this proves:**
 * - **URL through a constant.** A file "reaches a database" if it names a database-URL source, or
 *   imports (by the links above) a module under `tests/` that opens a connection. A URL copied into
 *   a constant, a literal or another module's export that is not a connecting module escapes.
 * - **Opener names outside the list.** "Opens a connection" means calling or constructing a name in
 *   `CONNECTION_OPENERS`, bare or as a namespace member (`driver.neon(…)`, `new driver.Client(…)`).
 *   An opener outside that list, or reached under a renamed binding, escapes. A local function
 *   sharing a listed name is a false alarm, which fails loudly rather than quietly.
 * - **Dynamic paths.** An `import()` whose argument is not a string literal is not followed.
 * - **Collection-time code.** The lock is taken in a `beforeAll`, so it covers hooks and tests only;
 *   nothing here checks database work at collection time.
 * - A registration hidden inside a wrapper function counts as no registration, which is red, never
 *   green.
 */

const TESTS_DIRECTORY_NAME = "tests";

export type Gate = "live test database" | "DATABASE_URL" | "both" | "none";
export type LockDeclaration = "exclusive" | "shared" | "none" | "more than one";

/** Every `.ts` module under `tests/`, keyed by its POSIX path relative to `tests/`. */
export type TestTree = ReadonlyMap<string, string>;

export interface LockRegistration {
  readonly mode: LockDeclaration;
  readonly isFirstCodeAtModuleScope: boolean;
}

interface ImportBinding {
  readonly localName: string;
  readonly importedName: string;
  readonly moduleSpecifier: string;
}

/** A file that names any of these can reach a database. */
const DATABASE_URL_SOURCE =
  /liveTestDatabaseUrl|isLiveTestDatabaseConfigured|resolveTestDatabaseUrl|readDatabaseUrl|readMigrationDatabaseUrl|process\.env\["(?:TEST_|MIGRATION_)?DATABASE_URL"\]/;
const APPLICATION_DATABASE_GATE = 'Boolean(process.env["DATABASE_URL"])';
/** T-J7's destructive pattern: schema mutation, ledger surgery, or a whole-table aggregate. */
const DESTRUCTIVE_PATTERN =
  /alter table|drop |forgetAppliedMigrations|dropMigrationLedger|dropSynthesisedMigrationArtefacts|count\(\*\)/i;
/** Calling or constructing any of these opens a database connection: the driver's entry points and
 *  the package's own connecting entry points. */
const CONNECTION_OPENERS: ReadonlySet<string> = new Set([
  "neon",
  "Client",
  "Pool",
  "NeonConfigurationRepository",
  "runMigrations",
  "applyMigrations",
  "createNeonDesignRowSource",
]);
const LOCK_HELPER_MODULE = /(?:^|\/)support\/test-schema-lock\.js$/;
const LIVE_GATE_MODULE = /(?:^|\/)support\/live-test-database\.js$/;
const LIVE_GATE_EXPORT = "isLiveTestDatabaseConfigured";
const REGISTRATION_MODES: Readonly<Record<string, LockDeclaration>> = {
  holdExclusiveTestSchemaLock: "exclusive",
  holdSharedTestSchemaLock: "shared",
};

// ---------------------------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------------------------

/** Exactly the files vitest's `include` resolves, as paths under `tests/`. */
export function discoverTestFiles(packageDirectory: string): string[] {
  const include = vitestConfig.test?.include;
  if (include === undefined)
    throw new Error("vitest.config.ts declares no test include");
  return namesUnderTests(
    packageDirectory,
    globSync(include, { cwd: packageDirectory }),
  );
}

export function readTestTree(packageDirectory: string): TestTree {
  const names = namesUnderTests(
    packageDirectory,
    globSync(`${TESTS_DIRECTORY_NAME}/**/*.ts`, { cwd: packageDirectory }),
  );
  const testsDirectory = join(packageDirectory, TESTS_DIRECTORY_NAME);
  return new Map(
    names.map((name) => [
      name,
      readFileSync(join(testsDirectory, name), "utf8"),
    ]),
  );
}

function namesUnderTests(
  packageDirectory: string,
  packageRelativePaths: readonly string[],
): string[] {
  const testsDirectory = join(packageDirectory, TESTS_DIRECTORY_NAME);
  return packageRelativePaths
    .map((path) =>
      relative(testsDirectory, join(packageDirectory, path))
        .split(sep)
        .join("/"),
    )
    .sort();
}

export function sourceOf(tree: TestTree, name: string): string {
  const source = tree.get(name);
  if (source === undefined)
    throw new Error(`The census has no source for ${name}`);
  return source;
}

// ---------------------------------------------------------------------------------------------
// Which files reach a database, and which open a connection
// ---------------------------------------------------------------------------------------------

export function databaseReachingFiles(
  tree: TestTree,
  testFiles: readonly string[],
): string[] {
  const connectingModules = connectingSupportModules(tree);
  return testFiles.filter(
    (name) =>
      DATABASE_URL_SOURCE.test(withoutComments(sourceOf(tree, name))) ||
      relativeImportsOf(tree, name).some((imported) =>
        connectingModules.has(imported),
      ),
  );
}

export function opensConnection(tree: TestTree, name: string): boolean {
  const connectingModules = connectingSupportModules(tree);
  return (
    callsConnectionOpener(parse(sourceOf(tree, name))) ||
    relativeImportsOf(tree, name).some((imported) =>
      connectingModules.has(imported),
    )
  );
}

/** The non-test modules under `tests/` that open a connection, directly or through one another. */
function connectingSupportModules(tree: TestTree): Set<string> {
  const supportModules = [...tree.keys()].filter(
    (name) => !name.endsWith(".test.ts"),
  );
  const connecting = new Set(
    supportModules.filter((name) =>
      callsConnectionOpener(parse(sourceOf(tree, name))),
    ),
  );
  let hasGrown = true;
  while (hasGrown) {
    const reached = supportModules.filter(
      (name) =>
        !connecting.has(name) &&
        relativeImportsOf(tree, name).some((imported) =>
          connecting.has(imported),
        ),
    );
    reached.forEach((name) => connecting.add(name));
    hasGrown = reached.length > 0;
  }
  return connecting;
}

function callsConnectionOpener(sourceFile: ts.SourceFile): boolean {
  return someNode(sourceFile, (node) => {
    const callee =
      ts.isCallExpression(node) || ts.isNewExpression(node)
        ? node.expression
        : undefined;
    const calleeName =
      callee === undefined
        ? undefined
        : ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee)
            ? callee.name.text
            : undefined;
    return calleeName !== undefined && CONNECTION_OPENERS.has(calleeName);
  });
}

/** Relative imports that stay inside `tests/`, resolved to tree keys. */
function relativeImportsOf(tree: TestTree, name: string): string[] {
  return moduleLinksOf(parse(sourceOf(tree, name)))
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) =>
      posix
        .normalize(posix.join(posix.dirname(name), specifier))
        .replace(/\.js$/, ".ts"),
    )
    .filter((resolved) => tree.has(resolved));
}

/** Static imports, `export … from` re-exports, and `import("…")` calls with a literal path. */
function moduleLinksOf(sourceFile: ts.SourceFile): string[] {
  const staticLinks = sourceFile.statements.flatMap((statement) =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
  const dynamicLinks = allNodes(sourceFile).flatMap((node) => {
    if (
      !ts.isCallExpression(node) ||
      node.expression.kind !== ts.SyntaxKind.ImportKeyword
    )
      return [];
    const [argument] = node.arguments;
    return argument !== undefined && ts.isStringLiteral(argument)
      ? [argument.text]
      : [];
  });
  return [...staticLinks, ...dynamicLinks];
}

/** `setupFiles` as vitest accepts it — absent, one path or a list — as package-relative paths. */
export function setupFilesOf(
  setupFiles: string | readonly string[] | undefined,
): string[] {
  const listed =
    setupFiles === undefined
      ? []
      : typeof setupFiles === "string"
        ? [setupFiles]
        : [...setupFiles];
  return listed.map((path) => posix.normalize(path));
}

/** Setup modules that open a connection. One outside `tests/` cannot be read from the tree, so it
 *  is reported rather than assumed harmless. */
export function setupFilesThatConnect(
  tree: TestTree,
  setupFiles: readonly string[],
): string[] {
  const testsPrefix = `${TESTS_DIRECTORY_NAME}/`;
  return setupFiles.filter((path) => {
    const name = path.startsWith(testsPrefix)
      ? path.slice(testsPrefix.length)
      : undefined;
    return name === undefined || !tree.has(name) || opensConnection(tree, name);
  });
}

// ---------------------------------------------------------------------------------------------
// Gates, registrations and the destructive pattern
// ---------------------------------------------------------------------------------------------

export function gateOf(source: string): Gate {
  const isLiveGated = isLiveGateUsed(parse(source));
  const isApplicationGated = withoutComments(source).includes(
    APPLICATION_DATABASE_GATE,
  );
  if (isLiveGated && isApplicationGated) return "both";
  if (isLiveGated) return "live test database";
  return isApplicationGated ? "DATABASE_URL" : "none";
}

function isLiveGateUsed(sourceFile: ts.SourceFile): boolean {
  const binding = importBindingsOf(sourceFile).find(
    (candidate) =>
      LIVE_GATE_MODULE.test(candidate.moduleSpecifier) &&
      candidate.importedName === LIVE_GATE_EXPORT,
  );
  if (binding === undefined) return false;
  return someNode(
    sourceFile,
    (node) =>
      ts.isIdentifier(node) &&
      node.text === binding.localName &&
      !isInsideImport(node),
  );
}

export function lockRegistrationOf(source: string): LockRegistration {
  const sourceFile = parse(source);
  const registrationNames = registrationBindingsOf(sourceFile);
  const calls = allNodes(sourceFile).filter(
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      registrationNames.has(node.expression.text),
  );
  const [only] = calls;
  if (only === undefined)
    return { mode: "none", isFirstCodeAtModuleScope: true };
  if (calls.length > 1)
    return { mode: "more than one", isFirstCodeAtModuleScope: false };
  return {
    mode:
      registrationNames.get((only.expression as ts.Identifier).text) ?? "none",
    isFirstCodeAtModuleScope: isFirstCodeAtModuleScope(sourceFile, only),
  };
}

/** Local name → mode, for every registration imported from the lock helper, aliases included. */
function registrationBindingsOf(
  sourceFile: ts.SourceFile,
): Map<string, LockDeclaration> {
  return new Map(
    importBindingsOf(sourceFile)
      .filter((binding) => LOCK_HELPER_MODULE.test(binding.moduleSpecifier))
      .flatMap((binding) => {
        const mode = REGISTRATION_MODES[binding.importedName];
        return mode === undefined ? [] : [[binding.localName, mode] as const];
      }),
  );
}

/** The registration is its own module-scope statement, and nothing above it can run code. */
function isFirstCodeAtModuleScope(
  sourceFile: ts.SourceFile,
  call: ts.CallExpression,
): boolean {
  const statement = call.parent;
  if (!ts.isExpressionStatement(statement) || statement.parent !== sourceFile)
    return false;
  const statementsAbove = sourceFile.statements.slice(
    0,
    sourceFile.statements.indexOf(statement),
  );
  return statementsAbove.every(isInertStatement);
}

function isInertStatement(statement: ts.Statement): boolean {
  if (
    ts.isImportDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isFunctionDeclaration(statement)
  ) {
    return true;
  }
  return ts.isVariableStatement(statement) && !runsCodeWhenEvaluated(statement);
}

/** A call, construction, tagged template or await — outside any function body, which does not run
 *  when the statement is evaluated. */
function runsCodeWhenEvaluated(node: ts.Node): boolean {
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) return true;
  if (ts.isTaggedTemplateExpression(node) || ts.isAwaitExpression(node))
    return true;
  if (ts.isFunctionLike(node)) return false;
  return (
    ts.forEachChild(node, (child) =>
      runsCodeWhenEvaluated(child) ? true : undefined,
    ) ?? false
  );
}

export function misplacedRegistrations(
  registrations: ReadonlyMap<string, LockRegistration>,
): string[] {
  return [...registrations]
    .filter(([, registration]) => !registration.isFirstCodeAtModuleScope)
    .map(([name]) => name);
}

/** Every database-reaching file not gated on the application database — so the test database — whose
 *  source matches the destructive pattern must hold the lock exclusively. */
export function destructiveFilesNotExclusive(
  tree: TestTree,
  registrations: ReadonlyMap<string, LockRegistration>,
): string[] {
  return [...registrations.keys()]
    .filter((name) => gateOf(sourceOf(tree, name)) !== "DATABASE_URL")
    .filter((name) =>
      DESTRUCTIVE_PATTERN.test(withoutComments(sourceOf(tree, name))),
    )
    .filter((name) => registrations.get(name)?.mode !== "exclusive");
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile(
    "census-input.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function withoutComments(source: string): string {
  return ts.createPrinter({ removeComments: true }).printFile(parse(source));
}

function importBindingsOf(sourceFile: ts.SourceFile): ImportBinding[] {
  return sourceFile.statements
    .filter(ts.isImportDeclaration)
    .flatMap((declaration) => {
      const moduleSpecifier = (declaration.moduleSpecifier as ts.StringLiteral)
        .text;
      const namedBindings = declaration.importClause?.namedBindings;
      if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
        return [{ localName: "", importedName: "", moduleSpecifier }];
      }
      return namedBindings.elements.map((element) => ({
        localName: element.name.text,
        importedName: (element.propertyName ?? element.name).text,
        moduleSpecifier,
      }));
    });
}

function isInsideImport(node: ts.Node): boolean {
  return ts.findAncestor(node, ts.isImportDeclaration) !== undefined;
}

function allNodes(root: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
}

function someNode(
  root: ts.Node,
  predicate: (node: ts.Node) => boolean,
): boolean {
  return allNodes(root).some(predicate);
}
