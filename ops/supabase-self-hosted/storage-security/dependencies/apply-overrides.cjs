const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (manifest.name !== "supa-storage" || manifest.dependencies.fastify !== "^5.11.2") {
  throw new Error("Unexpected Storage dependency baseline");
}
manifest.dependencies.fastify = "5.12.2";
manifest.dependencies.undici = "7.29.1";
// npm also validates omitted development dependencies against overrides.
// Keep direct declarations aligned, never force a different major line.
const fixes = {
  "@fastify/busboy": { 3: "3.2.1" },
  "@grpc/grpc-js": { 1: "1.14.5" },
  "@opentelemetry/propagator-jaeger": { 2: "2.9.0" },
  "brace-expansion": { 2: "2.1.6", 5: "5.0.11" },
  "fast-uri": { 3: "3.1.7", 4: "4.1.4" },
  "ip-address": { 10: "10.3.1" },
  "js-yaml": { 4: "4.3.2" },
  "protobufjs": { 7: "7.6.1" },
  "undici": { 7: "7.29.1" },
};
for (const group of ["dependencies", "devDependencies", "optionalDependencies"]) {
  for (const [name, range] of Object.entries(manifest[group] ?? {})) {
    if (!fixes[name]) continue;
    const major = range.match(/\d+/)?.[0];
    const fixed = fixes[name][major];
    if (!fixed) throw new Error(`Unsupported direct dependency line: ${name}`);
    manifest[group][name] = fixed;
  }
}
manifest.overrides = {
  ...manifest.overrides,
  "@fastify/busboy": "3.2.1",
  "@grpc/grpc-js": "1.14.5",
  "@opentelemetry/propagator-jaeger": "2.9.0",
  "brace-expansion@^2": "2.1.6",
  "brace-expansion@^5": "5.0.11",
  "fast-uri@^3": "3.1.7",
  "fast-uri@^4": "4.1.4",
  "ip-address": "10.3.1",
  "js-yaml@^4": "4.3.2",
  "protobufjs@^7": "7.6.1",
  "undici@^7": "7.29.1",
};
fs.writeFileSync("package.json", JSON.stringify(manifest, null, 2) + "\n");
