import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fail, pass } from "./lib/changed-files.mjs";

/**
 * De manieren waarop een agent een typefout wegmoffelt in plaats van oplost.
 * Een groene build met verstopte fouten is erger dan een rode, want je denkt
 * dat het vangnet gewerkt heeft.
 *
 * Alleen in src/: in tests is `@ts-expect-error` soms juist de bedoeling,
 * bijvoorbeeld om te controleren dat verkeerde invoer geweigerd wordt.
 */
const PATTERNS = [
  { name: "@ts-ignore", re: /@ts-ignore/ },
  { name: "@ts-expect-error", re: /@ts-expect-error/ },
  { name: "as unknown as", re: /\bas\s+unknown\s+as\b/ },
  { name: "as any", re: /\bas\s+any\b/ },
  { name: "expliciete any", re: /:\s*any\b/ },
  {
    name: "biome-ignore van een verboden regel",
    re: /biome-ignore\s+lint\/(suspicious\/noExplicitAny|style\/noNonNullAssertion)/,
  },
  { name: "eslint-disable", re: /eslint-disable/ },
];

const ROOT = "src";
const IGNORE = [/^src\/lib\/database\.types\.ts$/];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const problems = [];
for (const file of walk(ROOT)) {
  if (IGNORE.some((re) => re.test(file))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    for (const pattern of PATTERNS) {
      if (pattern.re.test(line)) problems.push(`${file}:${index + 1}: ${pattern.name}`);
    }
  }
}

if (problems.length === 0) pass("geen verstopte typefouten in src/");

fail("Er wordt een typefout weggemoffeld in plaats van opgelost.", [
  ...problems.map((problem) => `- ${problem}`),
  "",
  "Los de onderliggende fout op:",
  "  - Komt de data uit de database? Genereer de types opnieuw met `pnpm db:types`.",
  "  - Komt de data van buiten? Valideer hem met Zod, dan weet TypeScript de vorm.",
  "  - Kan een waarde er echt niet zijn? Schrijf een expliciete controle",
  "    (`if (!x) return ...`) in plaats van een uitroepteken.",
]);
