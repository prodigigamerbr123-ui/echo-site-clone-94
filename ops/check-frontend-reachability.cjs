/* Find application modules disconnected from the entrypoint and test suites. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const config = ts.readConfigFile("tsconfig.app.json", ts.sys.readFile);
if (config.error) throw new Error("Cannot read the application TypeScript configuration");
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
if (parsed.errors.length) throw new Error("Invalid application TypeScript configuration");
const normalize = (file) => {
  const absolute = path.resolve(file).replaceAll("\\", "/");
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
};
const files = new Map(parsed.fileNames.map((file) => [normalize(file), file]));
const edges = new Map();
const computedImports = [];

for (const [key, file] of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const references = [];
  const visit = (node) => {
    let specifier;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      specifier = node.moduleSpecifier;
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      specifier = node.argument.literal;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      specifier = node.arguments[0];
      if (!specifier || !ts.isStringLiteral(specifier)) computedImports.push(path.relative(process.cwd(), file));
    }
    if (specifier && ts.isStringLiteral(specifier)) {
      const resolved = ts.resolveModuleName(specifier.text, file, parsed.options, ts.sys).resolvedModule;
      if (resolved && files.has(normalize(resolved.resolvedFileName))) references.push(normalize(resolved.resolvedFileName));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  edges.set(key, references);
}

const roots = [...files.keys()].filter((file) => file.endsWith("/src/main.tsx") ||
  /\.(test|spec)\.[tj]sx?$/.test(file) || file.endsWith("/src/test/setup.ts") || file.endsWith(".d.ts"));
if (!roots.some((file) => file.endsWith("/src/main.tsx"))) throw new Error("Application entrypoint missing");
const reached = new Set();
const walk = (key) => {
  if (reached.has(key)) return;
  reached.add(key);
  for (const reference of edges.get(key) || []) walk(reference);
};
roots.forEach(walk);
const unused = [...files].filter(([key]) => !reached.has(key))
  .map(([, file]) => path.relative(process.cwd(), file).replaceAll("\\", "/")).sort();
// shadcn primitives form an intentionally reusable UI library, not route modules.
const applicationModules = unused.filter((file) => !file.startsWith("src/components/ui/"));
console.log(JSON.stringify({ roots: roots.length, computedImports, unusedApplicationModules: applicationModules,
  unusedUIPrimitives: unused.length - applicationModules.length }, null, 2));
if (process.argv.includes("--check") && (computedImports.length || applicationModules.length)) process.exitCode = 1;
