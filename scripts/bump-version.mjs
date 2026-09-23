#!/usr/bin/env node
// Bumps the app version in every file that carries it, choosing the level from what changed.
//
//   node scripts/bump-version.mjs --from <sha> --to <sha>   # level guessed from the commits and diff in that range
//   node scripts/bump-version.mjs --level minor             # force a level: major | minor | patch
//   add --dry-run to only print the result without touching any file
//
// Level rules (first match wins):
//   major  a commit says "BREAKING CHANGE" or uses the `type!:` form. While the major version is 0, this
//          only bumps the minor: 1.0.0 is a deliberate step (use --level major).
//   minor  a `feat` commit, a new #[tauri::command], a new page or a new theme.
//   patch  any other change to the app.
//   none   only docs, CI or tooling files changed: nothing is bumped.
//
// Prints `level=... / version=... / bumped=...` lines (also appended to $GITHUB_OUTPUT when set).
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (p) => resolve(root, p);

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const NON_APP = [/\.md$/i, /^\.github\//, /^scripts\//, /^\.gitignore$/, /^LICENSE/i, /^\.claude\//];
const RELEASE_COMMIT = /^chore\(release\)/;

function guessLevel(from, to) {
  const isNull = !from || /^0+$/.test(from);
  const base = isNull ? `${to}~1` : from;
  let range;
  try {
    git("rev-parse", "--verify", "--quiet", base);
    range = `${base}..${to}`;
  } catch {
    range = to; // first commit of the history: look at everything
  }

  const subjects = git("log", "--format=%s%x1f%b%x1e", range)
    .split("\x1e")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [subject, body = ""] = c.split("\x1f");
      return { subject: subject.trim(), body };
    })
    .filter((c) => !RELEASE_COMMIT.test(c.subject));

  const files = git("diff", "--name-only", range).split("\n").filter(Boolean);
  const appFiles = files.filter((f) => !NON_APP.some((re) => re.test(f)));
  if (subjects.length === 0 || appFiles.length === 0) return "none";

  const breaking = subjects.some((c) => /^\w+(\([^)]*\))?!:/.test(c.subject) || /BREAKING[ -]CHANGE/.test(c.body));
  if (breaking) return "major";

  const feature = subjects.some((c) => /^feat(\(|:|!)/i.test(c.subject));
  const diff = git("diff", "--unified=0", "--diff-filter=AM", range, "--", "src-tauri/src", "src/pages");
  const newCommand = /^\+\s*#\[tauri::command\]/m.test(diff);
  const newFile = git("diff", "--name-only", "--diff-filter=A", range).split("\n");
  const newPageOrTheme = newFile.some((f) => /^src\/pages\/[^/]+\.tsx$/.test(f) || /^src\/themes\/definitions\//.test(f));
  if (feature || newCommand || newPageOrTheme) return "minor";

  return "patch";
}

function bump(version, level) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (level === "major") return major === 0 && !args.includes("--level") ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Rewrites a JSON file with the same 2-space layout; `edit` receives the parsed object. */
function editJson(path, edit) {
  const text = readFileSync(file(path), "utf8");
  const data = JSON.parse(text);
  edit(data);
  writeFileSync(file(path), `${JSON.stringify(data, null, 2)}\n`);
}

function replaceOnce(path, pattern, replacement) {
  const text = readFileSync(file(path), "utf8");
  if (!pattern.test(text)) throw new Error(`Could not find the version in ${path}`);
  writeFileSync(file(path), text.replace(pattern, replacement));
}

const current = JSON.parse(readFileSync(file("package.json"), "utf8")).version;
const forced = opt("level");
if (forced && !["major", "minor", "patch"].includes(forced)) {
  console.error("--level must be major, minor or patch");
  process.exit(2);
}
const level = forced ?? guessLevel(opt("from"), opt("to") ?? "HEAD");
const next = level === "none" ? current : bump(current, level);

if (level !== "none" && !dryRun) {
  editJson("package.json", (d) => (d.version = next));
  editJson("package-lock.json", (d) => {
    d.version = next;
    if (d.packages?.[""]) d.packages[""].version = next;
  });
  editJson("src-tauri/tauri.conf.json", (d) => (d.version = next));
  replaceOnce("src-tauri/Cargo.toml", /^version = "[^"]+"/m, `version = "${next}"`);
  replaceOnce("src-tauri/Cargo.lock", /(name = "portus"\r?\nversion = )"[^"]+"/, `$1"${next}"`);
}

const lines = [`level=${level}`, `previous=${current}`, `version=${next}`, `bumped=${level !== "none"}`];
console.log(lines.join("\n"));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
