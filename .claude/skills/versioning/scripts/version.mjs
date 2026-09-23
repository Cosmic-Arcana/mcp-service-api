#!/usr/bin/env node
// Keeps package.json, package-lock.json and git tags on one semver line.
//
//   node version.mjs bump --message "<commit message>" [--type major|minor|patch | --set x.y.z] [--dry-run]
//   node version.mjs tag
//
// `bump` runs before `git commit`: it works out the release type from the commit message,
// writes the new version into package.json + package-lock.json and stages both files.
// `tag` runs after `git commit`: it puts an annotated `v<version>` tag on HEAD.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
// Repo convention: "[12-feature]: add x". A "!" after the type ("[12-feature!]") marks a breaking change.
const SUBJECT = /^\[(\d+)-([a-z]+)(!)?\]:\s+\S/;

const MINOR_TYPES = new Set(['feature', 'feat']);
const PATCH_TYPES = new Set([
  'fix', 'bug', 'bugfix', 'hotfix', 'perf', 'refactor', 'chore', 'docs', 'test', 'ci', 'build', 'style', 'revert',
]);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const fail = (message) => {
  console.error(`version: ${message}`);
  process.exit(1);
};

const parseArgs = (argv) => {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--message') flags.message = rest[++i];
    else if (arg === '--type') flags.type = rest[++i];
    else if (arg === '--set') flags.set = rest[++i];
    else fail(`unknown argument ${arg}`);
  }
  return { command, flags };
};

const parseVersion = (value) => {
  const match = SEMVER.exec(value ?? '');
  return match ? match.slice(1).map(Number) : null;
};

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const detectReleaseType = (message) => {
  const [subject = '', ...bodyLines] = message.split('\n');
  const match = SUBJECT.exec(subject.trim());
  if (!match) {
    fail(`commit subject "${subject}" does not follow "[<n>-<type>]: <description>"`);
  }
  const [, , type, bang] = match;
  if (bang || /^BREAKING[ -]CHANGE:/m.test(bodyLines.join('\n'))) return 'major';
  if (MINOR_TYPES.has(type)) return 'minor';
  if (PATCH_TYPES.has(type)) return 'patch';
  return fail(`unknown commit type "${type}"; pass --type explicitly`);
};

// Pre-1.0 a breaking change bumps minor: going to 1.0.0 is a product decision, not a side effect of a commit.
const bump = ([major, minor, patch], releaseType) => {
  if (releaseType === 'major') return major === 0 ? [0, minor + 1, 0] : [major + 1, 0, 0];
  if (releaseType === 'minor') return [major, minor + 1, 0];
  return [major, minor, patch + 1];
};

const highestTag = () => {
  try {
    git('fetch', '--tags', '--quiet', 'origin');
  } catch {
    console.error('version: could not fetch tags from origin, using local tags only');
  }
  return git('tag', '--list', 'v*')
    .split('\n')
    .map((tag) => parseVersion(tag.replace(/^v/, '')))
    .filter(Boolean)
    .sort(compare)
    .at(-1);
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const runBump = ({ message, type, set, dryRun }) => {
  if (!message && !type && !set) fail('bump needs --message, --type or --set');
  const releaseType = set ? 'set' : (type ?? detectReleaseType(message));
  if (!['major', 'minor', 'patch', 'set'].includes(releaseType)) fail(`invalid --type ${releaseType}`);

  const root = git('rev-parse', '--show-toplevel');
  const pkgPath = join(root, 'package.json');
  const lockPath = join(root, 'package-lock.json');
  const pkg = readJson(pkgPath);

  const current = parseVersion(pkg.version) ?? fail(`package.json version "${pkg.version}" is not x.y.z`);
  // Another branch may already have released past our package.json, so the base is whichever is higher.
  const tagged = highestTag();
  const base = tagged && compare(tagged, current) > 0 ? tagged : current;
  const explicit = set && (parseVersion(set) ?? fail(`--set ${set} is not x.y.z`));
  if (explicit && compare(explicit, base) <= 0) fail(`--set ${set} must be greater than ${base.join('.')}`);
  const next = (explicit || bump(base, releaseType)).join('.');

  if (git('tag', '--list', `v${next}`)) fail(`tag v${next} already exists`);

  if (!dryRun) {
    pkg.version = next;
    writeJson(pkgPath, pkg);
    const staged = ['package.json'];
    if (existsSync(lockPath)) {
      const lock = readJson(lockPath);
      lock.version = next;
      if (lock.packages?.['']) lock.packages[''].version = next;
      writeJson(lockPath, lock);
      staged.push('package-lock.json');
    }
    git('-C', root, 'add', ...staged);
  }

  console.log(JSON.stringify({ previous: base.join('.'), next, releaseType, dryRun: Boolean(dryRun) }));
};

const runTag = () => {
  const version = JSON.parse(git('show', 'HEAD:package.json')).version;
  const tag = `v${version}`;
  const existing = git('tag', '--list', tag);
  if (existing) {
    if (git('rev-list', '-n', '1', tag) === git('rev-parse', 'HEAD')) {
      console.log(JSON.stringify({ tag, created: false }));
      return;
    }
    fail(`tag ${tag} already points at another commit; run bump again before committing`);
  }
  git('tag', '-a', tag, '-m', git('log', '-1', '--format=%s'));
  console.log(JSON.stringify({ tag, created: true }));
};

const { command, flags } = parseArgs(process.argv.slice(2));
if (command === 'bump') runBump(flags);
else if (command === 'tag') runTag();
else fail('usage: version.mjs bump --message "<msg>" [--type t | --set x.y.z] [--dry-run] | version.mjs tag');
