#!/usr/bin/env node
/* Merge an exported dragonwilds-edits.json into the dataset and open a pull
   request for it — CONTRIBUTOR-DATA.md's Path A, steps 7–12, in one command.

     node scripts/open-edits-pr.mjs dragonwilds-edits.json [options]

   Options
     --title <text>    commit subject + PR title (default: derived from the edits)
     --branch <name>   branch to create (default: data/<slug of the change>)
     --base <branch>   PR base (default: main)
     --no-exports      don't regenerate the desktop exports
     --no-pr           commit and push, then print the compare URL (no `gh`)
     --dry-run         report what would change and exit — writes nothing
     --yes             don't ask before pushing

   The merge itself is apply-edits-core.mjs (shared with apply-edits.mjs), the
   data files are written by dataset-io.mjs, and this script only does the git
   and gh steps. It refuses to run on a dirty tree, never force-pushes and never
   commits to the branch you are on: a new branch, then a push, then a PR — and
   if any step fails before the push it rolls the branch back. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { applyDatasetExport, mergeEditsOverlay, validateDatasetExport } from "./apply-edits-core.mjs";
import { PATHS, ensureWorkingCopy, readWorkingDataset, writeDatasetFiles } from "./dataset-io.mjs";
import {
  branchName,
  changeCount,
  changeLines,
  commitMessage,
  graphChanged,
  prBody,
  summarizeDataset,
  summarizeOverlay,
} from "./open-edits-pr-core.mjs";

// ── arguments ───────────────────────────────────────────────────────────────
const VALUE_FLAGS = ["--title", "--branch", "--base"];
const argv = process.argv.slice(2);
const opts = { title: null, branch: null, base: "main" };
const flags = new Set();
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (VALUE_FLAGS.includes(a)) { opts[a.slice(2)] = argv[++i]; continue; }
  if (a.startsWith("--")) { flags.add(a); continue; }
  positional.push(a);
}
const dryRun = flags.has("--dry-run");
const file = positional[0];

const die = (msg, code = 2) => { console.error(msg); process.exit(code); };
if (!file) {
  die("usage: node scripts/open-edits-pr.mjs <dragonwilds-edits.json> [--title t] [--branch b] [--base main] [--dry-run] [--no-pr] [--yes]");
}
if (!fs.existsSync(file)) die(`no such file: ${file}`);
if (!opts.base) die("--base needs a branch name");

// ── git helpers ─────────────────────────────────────────────────────────────
const git = (args, opts = {}) => execFileSync("git", args, { encoding: "utf8", ...opts }).trim();
const gitInherit = (args) => execFileSync("git", args, { stdio: "inherit" });
const say = (msg) => console.log(msg);

/* Where to open the PR by hand — the `gh`-less path (--no-pr, or no gh auth).
   Only a GitHub remote can be turned into a compare URL; anything else (a local
   path, a different host) prints the branch to push instead of a broken link. */
const sayCompare = (branch) => {
  const remote = git(["remote", "get-url", "origin"]);
  const slug = remote.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1];
  say(slug
    ? `  https://github.com/${slug}/compare/${opts.base}...${branch}?expand=1`
    : `  origin is not a GitHub remote (${remote}) — open the PR for branch \`${branch}\` from the repo page`);
};

const insideRepo = (() => { try { return git(["rev-parse", "--is-inside-work-tree"]) === "true"; } catch { return false; } })();
if (!insideRepo) die("not inside a git repository — clone the atlas first (CONTRIBUTOR-DATA.md, step 8)");

const originBranch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (originBranch === "HEAD") die("detached HEAD — check out a branch first");

// ── read the export and merge it in memory ──────────────────────────────────
const input = JSON.parse(fs.readFileSync(file, "utf8"));
const isFullDataset = Array.isArray(input?.nodes);
if (!isFullDataset && !(input?.nodes && typeof input.nodes === "object")) {
  die("unrecognised file: expected a dragonwilds-edits overlay or a dragonwilds-data dataset export");
}

// merge onto the pipeline's working copy when there is one, else onto the
// tracked dataset — writeDatasetFiles() re-emits both either way
const dataset = fs.existsSync(PATHS.cache)
  ? readWorkingDataset()
  : JSON.parse(fs.readFileSync(PATHS.json, "utf8"));
const currentGeneratedAt = dataset.generatedAt;

let summary;
if (isFullDataset) {
  const v = validateDatasetExport(input);
  if (!v.ok) die(`invalid dataset export — ${v.error}`);
  summary = summarizeDataset(dataset, input);
  applyDatasetExport(dataset, input);
  if (v.dangling.length) say(`warning: ${v.dangling.length} edge(s) reference an unknown node id`);
} else {
  summary = summarizeOverlay(dataset, input);
  const { missed, missedLinks, addedCount, removedCount } = mergeEditsOverlay(dataset, input);
  if (missed.length) say(`skipped ${missed.length} unknown node id(s): ${missed.slice(0, 10).join(", ")}${missed.length > 10 ? " …" : ""}`);
  if (missedLinks.length) say(`skipped ${missedLinks.length} unknown link(s)`);
  summary.added = summary.added.slice(0, addedCount || summary.added.length);
  summary.removed = summary.removed.slice(0, removedCount || summary.removed.length);
}

const total = changeCount(summary);
if (!total) die("nothing to apply — the dataset already matches this export", 1);

const branch = opts.branch || branchName(summary, opts.title);
const message = commitMessage(summary, { title: opts.title });
const needsExports = graphChanged(summary) && !flags.has("--no-exports");
const EXPORT_FILES = ["public/data.cyjs", "public/data.graphml", "public/atlas-style.xml"];

// ── plan ────────────────────────────────────────────────────────────────────
say(`\n${total} change(s) to apply:`);
for (const line of changeLines(summary)) say(`  - ${line}`);
say(`  branch:  ${branch}  (from ${originBranch})`);
say(`  commit:  ${message.subject}`);
say(`  exports: ${needsExports ? "regenerate (nodes/edges changed)" : "unchanged"}`);

if (dryRun) {
  say("\ndry run — nothing written, no branch, no commit, no push");
  process.exit(0);
}

/* This script commits, so it insists on a clean tree — meaning the tracked data
   files, not the untracked export you just downloaded (only the paths listed
   above are ever staged). A --dry-run preview is allowed either way. */
const dirty = git(["status", "--porcelain", "--untracked-files=no"]);
if (dirty) {
  console.error("working tree is not clean — commit or stash first:");
  console.error(dirty);
  process.exit(2);
}

if (process.stdin.isTTY && !flags.has("--yes")) {
  process.stdout.write(`\nMerge and open a PR against ${opts.base}? [y/N] `);
  const answer = fs.readFileSync(0, "utf8").trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") die("aborted — nothing written", 1);
}

// ── write, branch, commit, push, PR ─────────────────────────────────────────
let created = false;
let pushed = false;
const rollback = () => {
  try {
    gitInherit(["checkout", originBranch]);
    gitInherit(["checkout", "--", "public/data.json", "public/data.js"]);
    if (created) gitInherit(["branch", "-D", branch]);
    say(created
      ? `\nrolled back: back on ${originBranch}, branch ${branch} deleted, dataset files restored`
      : `\nrolled back: still on ${originBranch}, dataset files restored (no branch was created)`);
  } catch {
    say(`\ncould not roll back cleanly — check \`git status\` (branch: ${branch})`);
  }
};

say("");
try {
  ensureWorkingCopy({ log: say });
  writeDatasetFiles(dataset);
  say("wrote cache/final-dataset.json + public/data.json + public/data.js");

  if (needsExports) {
    say("regenerating desktop exports (scripts/build-exports.mjs)…");
    execFileSync("node", ["scripts/build-exports.mjs"], { stdio: "inherit" });
  }

  gitInherit(["checkout", "-b", branch]);
  created = true;

  const candidates = ["public/data.json", "public/data.js", ...(needsExports ? EXPORT_FILES : [])];
  gitInherit(["add", ...candidates]);
  const files = git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
  if (!files.length) die("nothing staged — the export changed no tracked file", 1);

  gitInherit(["commit", "-m", message.subject, "-m", message.body]);
  say(`committed ${git(["rev-parse", "--short", "HEAD"])} on ${branch}: ${files.length} file(s)`);

  gitInherit(["push", "-u", "origin", branch]);
  pushed = true;
} catch (err) {
  say(`\nstep failed: ${err?.message || err}`);
  if (pushed) {
    say(`the branch is already pushed — clean up with:`);
    say(`  git push origin --delete ${branch}`);
    say(`  git checkout ${originBranch} && git branch -D ${branch}`);
  } else {
    rollback();
  }
  process.exit(1);
}

if (flags.has("--no-pr")) {
  say(`\npushed ${branch} — open the PR:`);
  sayCompare(branch);
  process.exit(0);
}

try {
  execFileSync("gh", ["auth", "status"], { stdio: "ignore", shell: false });
} catch {
  say("`gh` is not installed or not authenticated — the branch is pushed, so open the PR from here:");
  sayCompare(branch);
  process.exit(0);
}

const bodyFile = path.join(os.tmpdir(), `dw-pr-body-${process.pid}.md`);
fs.writeFileSync(bodyFile, prBody({
  summary, base: opts.base, baseGeneratedAt: input.baseGeneratedAt, currentGeneratedAt,
  files: git(["diff", "--name-only", `${opts.base}...${branch}`]).split("\n").filter(Boolean),
  checks: { vitest: false, exports: needsExports },
}));
try {
  execFileSync("gh", ["pr", "create", "--base", opts.base, "--title", message.subject, "--body-file", bodyFile], { stdio: "inherit" });
} catch {
  say("\n`gh pr create` failed — nothing was rolled back (the branch is already pushed). Open the PR by hand:");
  sayCompare(branch);
  process.exit(1);
} finally {
  fs.unlinkSync(bodyFile);
}
say(`\ndone. the edit file (${path.basename(file)}) is your input, not part of the change — keep it out of the branch.`);
