// Wave 8M criterion 11, attacked at the place the shipped scan is weakest: can a second way off the page hide?
//
// `contact-source-names-no-browser-storage.test.ts` names the router in code by a pattern over the text (`router.push`,
// `router.replace`, `useRouter`) and lets one file, `done/use-replace-with-done.ts`, name it, whose own check is that the
// text `router.<word>(` occurs once. A pattern over text sees a call spelled as the pattern is. This reads the syntax
// tree instead, so the forms a pattern misses are followed: the method taken off the router and called by another name,
// the method named by a string, the router destructured, a second `replace`, `back`, `redirect` from either navigation
// module, a window opened, a synthetic click or a form submitted by script. Over every file the contact flow is made of,
// the only navigation by script is the one `router.replace(doneHref(designId))`, in the one hook that is called once.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(import.meta.dirname, "../../src");

const CONTACT_ROUTE_FILES = [
  "app/[locale]/d/[id]/contact/page.tsx",
  "app/[locale]/d/[id]/done/page.tsx",
  "app/[locale]/configurator/contact/page.tsx",
  "app/d/[id]/contact/hydrate-and-contact.tsx",
  "app/d/[id]/done/hydrate-and-done.tsx",
  "app/d/[id]/hydrate-stored-design.tsx",
] as const;

const THE_ONE_HOOK = "done/use-replace-with-done.ts";

/** The card's address hook lives outside `done/` and reads the page's own address: it is scanned with the flow, and
 *  may take the path builder, which only writes a path, from the navigation module. */
const THE_ADDRESS_HOOK = "review/use-absolute-editor-address.ts";
const THE_ADDRESS_HOOKS_IMPORT = "import of getPathname from @/i18n/navigation";

/** What a module may take from the navigation modules: the link, which a customer's own tap follows. Nothing that moves
 *  the page by itself. */
const NAVIGATION_MODULES = new Set([
  "next/navigation",
  "next/router",
  "@/i18n/navigation",
]);
const NAVIGATION_NAMES_ALLOWED_TO_IMPORT = new Set(["Link"]);

/** Properties whose call moves the page, or makes a window or a navigation, whatever the object is called. */
const MOVING_WHEREVER_CALLED = new Set([
  "pushState",
  "replaceState",
  "assign",
  "open",
  "submit",
  "requestSubmit",
  "click",
]);
/** Names that are as often an array's or a string's: they move the page only on the router, the history or the address. */
const MOVING_ON_A_NAVIGATOR = new Set([
  "push",
  "replace",
  "back",
  "forward",
  "go",
  "refresh",
  "prefetch",
]);
const A_NAVIGATOR =
  /^(router|history|location|navigation|nav|window\.history|window\.location|globalThis\.history|globalThis\.location)$/i;
/** Calls of a bare name that move the page. */
const MOVING_FUNCTIONS = new Set(["redirect", "permanentRedirect", "open"]);

function isAMovingProperty(name: string, object: string): boolean {
  return (
    MOVING_WHEREVER_CALLED.has(name) ||
    (MOVING_ON_A_NAVIGATOR.has(name) && A_NAVIGATOR.test(object))
  );
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesUnder(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

function filesOfTheFlow(): string[] {
  return [
    ...sourceFilesUnder(join(SOURCE_ROOT, "contact")),
    ...sourceFilesUnder(join(SOURCE_ROOT, "done")),
    ...sourceFilesUnder(join(SOURCE_ROOT, "result")),
    ...CONTACT_ROUTE_FILES.map((file) => join(SOURCE_ROOT, file)),
    join(SOURCE_ROOT, THE_ADDRESS_HOOK),
  ].map((file) => relative(SOURCE_ROOT, file));
}

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** Every place the source moves the page, or could: named, so that a failure says which. */
function waysOffThePage(source: string, fileName = "a.ts"): string[] {
  const found: string[] = [];
  const file = parse(source, fileName);

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) noteNavigationImports(node);
    if (ts.isCallExpression(node)) noteMovingCall(node);
    if (ts.isElementAccessExpression(node)) noteIndexedAccess(node);
    if (ts.isBindingElement(node)) noteDestructuredMethod(node);
    if (ts.isPropertyAccessExpression(node))
      noteMethodTakenWithoutCalling(node);
    ts.forEachChild(node, visit);
  }

  function noteNavigationImports(node: ts.ImportDeclaration): void {
    if (!ts.isStringLiteral(node.moduleSpecifier)) return;
    if (!NAVIGATION_MODULES.has(node.moduleSpecifier.text)) return;
    const bindings = node.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) {
      found.push(`import of ${node.moduleSpecifier.text} as a whole`);
      return;
    }
    for (const element of bindings.elements) {
      const name = (element.propertyName ?? element.name).text;
      if (!NAVIGATION_NAMES_ALLOWED_TO_IMPORT.has(name)) {
        found.push(`import of ${name} from ${node.moduleSpecifier.text}`);
      }
    }
  }

  function noteMovingCall(node: ts.CallExpression): void {
    const callee = node.expression;
    if (ts.isIdentifier(callee) && MOVING_FUNCTIONS.has(callee.text)) {
      found.push(`call of ${callee.text}()`);
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text;
      const object = callee.expression.getText(file);
      if (isAMovingProperty(name, object)) {
        found.push(`call of ${object}.${name}()`);
      }
    }
  }

  function noteIndexedAccess(node: ts.ElementAccessExpression): void {
    const object = node.expression.getText(file);
    if (/^(router|history|location|window|document|globalThis)$/.test(object)) {
      found.push(
        `indexed access to ${object}[${node.argumentExpression.getText(file)}]`,
      );
    }
  }

  function noteDestructuredMethod(node: ts.BindingElement): void {
    const name = (node.propertyName ?? node.name).getText(file);
    const isOfARouterShapedObject = isDestructuredFromANavigator(node);
    const isMoving =
      MOVING_FUNCTIONS.has(name) ||
      MOVING_WHEREVER_CALLED.has(name) ||
      (MOVING_ON_A_NAVIGATOR.has(name) && isOfARouterShapedObject);
    if (isMoving) found.push(`destructured ${name}`);
  }

  /** `const { push } = router` takes a method off a navigator by name. */
  function isDestructuredFromANavigator(node: ts.BindingElement): boolean {
    const declaration = node.parent.parent;
    if (!ts.isVariableDeclaration(declaration)) return false;
    const initializer = declaration.initializer?.getText(file) ?? "";
    return (
      A_NAVIGATOR.test(initializer) || initializer.startsWith("useRouter(")
    );
  }

  /** `const go = router.push` and `useEffect(router.replace)` name a moving method without calling it. */
  function noteMethodTakenWithoutCalling(
    node: ts.PropertyAccessExpression,
  ): void {
    const object = node.expression.getText(file);
    const name = node.name.text;
    const isOnANavigator =
      A_NAVIGATOR.test(object) &&
      (MOVING_ON_A_NAVIGATOR.has(name) || MOVING_WHEREVER_CALLED.has(name));
    const isWindowOpen =
      /^(window|globalThis)$/.test(object) && name === "open";
    if (!isOnANavigator && !isWindowOpen) return;
    const parent = node.parent;
    const isTheCallee =
      ts.isCallExpression(parent) && parent.expression === node;
    if (!isTheCallee) {
      found.push(
        `${node.expression.getText(file)}.${node.name.text} taken without a call`,
      );
    }
  }

  visit(file);
  return found;
}

/** Reads the one hook: what it may name is the router and the one call. Anything else about `router` is a finding. */
function whatTheOneHookDoesWithTheRouter(source: string): string[] {
  const file = parse(source, THE_ONE_HOOK);
  const found: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === "router") judge(node);
    ts.forEachChild(node, visit);
  }

  function judge(identifier: ts.Identifier): void {
    const parent = identifier.parent;
    const isTheDeclaredName =
      ts.isVariableDeclaration(parent) && parent.name === identifier;
    const isTheOneCall =
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === identifier &&
      parent.name.text === "replace" &&
      ts.isCallExpression(parent.parent) &&
      parent.parent.expression === parent &&
      parent.parent.arguments.length === 1 &&
      parent.parent.arguments[0]?.getText(file) === "doneHref(designId)";
    const isInTheEffectsDependencies =
      ts.isArrayLiteralExpression(parent) &&
      ts.isCallExpression(parent.parent) &&
      parent.parent.expression.getText(file) === "useEffect";
    if (!isTheDeclaredName && !isTheOneCall && !isInTheEffectsDependencies) {
      found.push(`router used as ${parent.getText(file)}`);
    }
  }

  visit(file);
  return found;
}

/** Reads the address hook: the page's address may be named only to read its origin. Anything else of it is a finding. */
function whatTheAddressHookDoesWithTheLocation(source: string): string[] {
  const file = parse(source, THE_ADDRESS_HOOK);
  const found: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === "location") judge(node);
    ts.forEachChild(node, visit);
  }

  function judge(identifier: ts.Identifier): void {
    const parent = identifier.parent;
    const isTheOriginRead =
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === identifier &&
      parent.name.text === "origin" &&
      !isAssignedTo(parent) &&
      !(
        ts.isCallExpression(parent.parent) &&
        parent.parent.expression === parent
      );
    if (!isTheOriginRead)
      found.push(`location used as ${parent.getText(file)}`);
  }

  function isAssignedTo(node: ts.Node): boolean {
    const parent = node.parent;
    return (
      ts.isBinaryExpression(parent) &&
      parent.left === node &&
      parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    );
  }

  visit(file);
  return found;
}

describe("the flow's source, read as syntax", () => {
  it("has files to read, so the loops below are not empty ones", () => {
    expect(filesOfTheFlow()).toEqual(
      expect.arrayContaining([
        "contact/contact-screen.tsx",
        "contact/use-contact-submission.ts",
        "done/done-screen.tsx",
        "done/send-on-whatsapp.tsx",
        THE_ONE_HOOK,
        THE_ADDRESS_HOOK,
        ...CONTACT_ROUTE_FILES,
      ]),
    );
  });

  it("the address hook names the page's address only to read its origin", () => {
    const source = readFileSync(join(SOURCE_ROOT, THE_ADDRESS_HOOK), "utf8");

    expect(source).toMatch(/\blocation\.origin\b/);
    expect(whatTheAddressHookDoesWithTheLocation(source)).toEqual([]);
  });

  it("moves the page by script nowhere but in the one hook", () => {
    const offenders = filesOfTheFlow()
      .filter((file) => file !== THE_ONE_HOOK)
      .flatMap((file) =>
        waysOffThePage(readFileSync(join(SOURCE_ROOT, file), "utf8"), file)
          .filter(
            (way) =>
              !(file === THE_ADDRESS_HOOK && way === THE_ADDRESS_HOOKS_IMPORT),
          )
          .map((way) => `${file}: ${way}`),
      );

    expect(offenders).toEqual([]);
  });

  it("the one hook has exactly one way off the page: `router.replace(doneHref(designId))`", () => {
    const source = readFileSync(join(SOURCE_ROOT, THE_ONE_HOOK), "utf8");
    const ways = waysOffThePage(source, THE_ONE_HOOK).filter(
      (way) => way !== "import of useRouter from @/i18n/navigation",
    );

    expect(ways).toEqual(["call of router.replace()"]);
    expect(whatTheOneHookDoesWithTheRouter(source)).toEqual([]);
  });

  it("the hook is called once in the whole flow, by the design form's sent branch, so one render path is one navigation", () => {
    const callers = filesOfTheFlow().flatMap((file) => {
      const source = readFileSync(join(SOURCE_ROOT, file), "utf8");
      const calls = source.match(/\buseReplaceWithDone\(/g) ?? [];
      const isTheDefinition = file === THE_ONE_HOOK;
      return isTheDefinition ? [] : calls.map(() => file);
    });

    expect(callers).toEqual(["contact/contact-screen.tsx"]);
  });
});

describe("the address hook's reading finds any use of the page's address but reading its origin", () => {
  it.each([
    ["an address assigned", `location.href = "/x";`],
    ["the origin assigned", `location.origin = "https://x";`],
    ["a reload", `location.reload();`],
    ["the address handed on", `const here = location; here.assign("/x");`],
    ["the address taken off the window", `const a = window.location.origin;`],
  ])("flags %s", (_name, source) => {
    expect(
      whatTheAddressHookDoesWithTheLocation(source).length,
    ).toBeGreaterThan(0);
  });

  it("says nothing of the origin read, as the hook reads it", () => {
    expect(
      whatTheAddressHookDoesWithTheLocation(
        "const address = `${location.origin}${path}`;",
      ),
    ).toEqual([]);
  });
});

describe("the scan finds a second way off the page where a pattern over the text would not", () => {
  const SECOND_WAYS: readonly (readonly [string, string])[] = [
    [
      "the method taken off the router and called by another name",
      `const router = useRouter(); const go = router.push; go("/x");`,
    ],
    [
      "the method named by a string",
      `const router = useRouter(); router["push"]("/x");`,
    ],
    [
      "the router destructured",
      `const router = useRouter(); const { push } = router; push("/x");`,
    ],
    [
      "a second replace",
      `const router = useRouter(); router.replace(doneHref(a)); router.replace("/elsewhere");`,
    ],
    ["a step back", `const router = useRouter(); router.back();`],
    [
      "a redirect from the application's own module",
      `import { redirect } from "@/i18n/navigation"; redirect("/x");`,
    ],
    [
      "a redirect from next",
      `import { permanentRedirect } from "next/navigation"; permanentRedirect("/x");`,
    ],
    ["a window opened", `window.open("https://wa.me/", "_blank");`],
    ["a synthetic click on a link", `link.click();`],
    ["a form submitted by script", `form.submit();`],
    ["an address assigned", `location.assign("/x");`],
    ["a history entry written", `history.pushState(null, "", "/x");`],
    [
      "the router as a whole handed on",
      `import * as navigation from "next/navigation";`,
    ],
  ];

  it.each(SECOND_WAYS)("%s", (_name, source) => {
    expect(waysOffThePage(source).length).toBeGreaterThan(0);
  });

  it("and says nothing of a link, a string's own replace, or the one call in the one hook", () => {
    expect(
      waysOffThePage(
        `import { Link } from "@/i18n/navigation"; const t = "a-b".replace("-", " "); const l = <Link href="/x" />;`,
        "a.tsx",
      ),
    ).toEqual([]);
  });

  it.each([
    [
      "an alias",
      `const router = useRouter(); const go = router.replace; go(doneHref(designId));`,
    ],
    [
      "a second call",
      `const router = useRouter(); useEffect(() => { router.replace(doneHref(designId)); router.replace(doneHref(designId)); }, [router]);`,
    ],
    [
      "a call with another address",
      `const router = useRouter(); useEffect(() => { router.replace("/ro/done"); }, [router]);`,
    ],
  ])(
    "the one hook, with %s, is no longer the one call that was ruled",
    (_name, source) => {
      const judged = [
        ...whatTheOneHookDoesWithTheRouter(source),
        ...waysOffThePage(source).filter(
          (way) => way !== "import of useRouter from @/i18n/navigation",
        ),
      ];
      const isTheOneCallOnly =
        judged.length === 1 && judged[0] === "call of router.replace()";
      expect(isTheOneCallOnly).toBe(false);
    },
  );
});
