const fs = require("node:fs");
const path = require("node:path");
const expected = {
  fastify: { 5: "5.12.2" },
  undici: { 7: "7.29.1" },
  "@fastify/busboy": { 3: "3.2.1" },
  "@grpc/grpc-js": { 1: "1.14.5" },
  "@opentelemetry/propagator-jaeger": { 2: "2.9.0" },
  "brace-expansion": { 2: "2.1.6", 5: "5.0.11" },
  "fast-uri": { 3: "3.1.7", 4: "4.1.4" },
  "ip-address": { 10: "10.3.1" },
  "js-yaml": { 4: "4.3.2" },
  protobufjs: { 7: "7.6.1" },
};
const found = [];
function modules(directory) {
  if (!fs.existsSync(directory)) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name.startsWith(".")) continue;
    const location = path.join(directory, item.name);
    if (item.name.startsWith("@")) { modules(location); continue; }
    const manifest = path.join(location, "package.json");
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
      const required = expected[pkg.name]?.[pkg.version.split(".")[0]];
      if (required) {
        if (pkg.version !== required) throw new Error(`Unpatched dependency: ${pkg.name} at ${location}`);
        found.push({ name: pkg.name, version: pkg.version, path: location });
      }
    }
    modules(path.join(location, "node_modules"));
  }
}
modules("/app/node_modules");
for (const name of Object.keys(expected)) {
  if (!found.some(item => item.name === name)) throw new Error(`Missing dependency evidence: ${name}`);
}
console.log(JSON.stringify({ node: process.version, undici: process.versions.undici, abi: process.versions.modules, found }));
