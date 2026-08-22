import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(path) {
  try {
    return JSON.parse(read(path));
  } catch (error) {
    fail(`${path} is not valid JSON: ${error.message}`);
    return {};
  }
}

const requiredFiles = [
  "manifest.json",
  "styles.css",
  "README.md",
  "LICENSE",
  "versions.json",
  "package.json",
  "tsconfig.json",
  "esbuild.config.mjs",
  "src/main.ts",
  "src/canvas.ts",
  "src/dom.ts",
  "src/constants.ts",
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) fail(`Missing required file: ${file}`);
}

const manifest = readJson("manifest.json");
const pkg = readJson("package.json");
const versions = readJson("versions.json");
const releaseVersion = /^\d+\.\d+\.\d+$/;

for (const key of ["id", "name", "version", "minAppVersion", "author", "description"]) {
  if (typeof manifest[key] !== "string" || !manifest[key].trim()) {
    fail(`manifest.json must define a non-empty ${key}`);
  }
}

if (manifest.id !== "lumen-stage") {
  fail(`manifest id must be lumen-stage; received ${manifest.id}`);
}
if (manifest.name !== "Lumen Stage") {
  fail(`manifest name must be Lumen Stage; received ${manifest.name}`);
}
if (!releaseVersion.test(manifest.version ?? "")) {
  fail(`manifest version must use the x.y.z release format: ${manifest.version}`);
}
if (!releaseVersion.test(manifest.minAppVersion ?? "")) {
  fail(`manifest minAppVersion must use the x.y.z format: ${manifest.minAppVersion}`);
}
if (pkg.version !== manifest.version) {
  fail(`package.json version ${pkg.version} does not match manifest ${manifest.version}`);
}
if (versions[manifest.version] !== manifest.minAppVersion) {
  fail(`versions.json must map ${manifest.version} to minAppVersion ${manifest.minAppVersion}`);
}
if (manifest.author !== "paddychenc75") {
  fail(`manifest author must be paddychenc75; received ${manifest.author}`);
}

const styles = existsSync(resolve(root, "styles.css")) ? read("styles.css") : "";
const stylesWithoutComments = styles.replace(/\/\*[\s\S]*?\*\//g, "");
const danglingLg = [...stylesWithoutComments.matchAll(/var\(\s*(--lg-[a-z0-9-]+)\s*\)/g)].map(
  (match) => match[1],
);
if (danglingLg.length > 0) {
  fail(`styles.css uses --lg-* tokens without fallback: ${[...new Set(danglingLg)].join(", ")}`);
}

const readme = existsSync(resolve(root, "README.md")) ? read("README.md") : "";
if (/\/Users\/|[A-Z]:\\Users\\/i.test(readme)) {
  fail("README.md contains a machine-specific absolute path");
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`Validated ${manifest.name} ${manifest.version}: ${requiredFiles.length} required files.`);
