import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

/**
 * Bepaalt waartegen we vergelijken. In een pull request is dat de basisbranch;
 * lokaal is dat origin/main (of main). Lukt dat niet, dan geven we null terug en
 * slaan de aanroeper de controle over: een guard die niet weet wat er gewijzigd
 * is, moet niet gaan gokken.
 */
export function resolveBase() {
  const candidates = [];
  if (process.env.GITHUB_BASE_REF) {
    candidates.push(`origin/${process.env.GITHUB_BASE_REF}`, process.env.GITHUB_BASE_REF);
  }
  candidates.push("origin/main", "main", "origin/master", "master");

  for (const candidate of candidates) {
    if (tryGit(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`])) {
      const mergeBase = tryGit(["merge-base", candidate, "HEAD"]);
      const head = tryGit(["rev-parse", "HEAD"]);
      if (mergeBase && mergeBase !== head) return mergeBase;
    }
  }
  return null;
}

/** Gewijzigde, toegevoegde of hernoemde bestanden ten opzichte van de basis. */
export function changedFiles() {
  const base = resolveBase();
  if (!base) return null;
  const output = tryGit(["diff", "--name-only", "--diff-filter=ACMR", base, "HEAD"]);
  if (output === null) return null;
  return output.split("\n").filter(Boolean);
}

/** De tekst van de pull request, voor guards met een expliciete ontsnappingsregel. */
export function pullRequestBody() {
  return process.env.PR_BODY ?? "";
}

export function skip(reason) {
  console.log(`overgeslagen: ${reason}`);
  process.exit(0);
}

export function fail(title, lines) {
  console.error(`\n✗ ${title}\n`);
  for (const line of lines) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

export function pass(message) {
  console.log(`✓ ${message}`);
  process.exit(0);
}
