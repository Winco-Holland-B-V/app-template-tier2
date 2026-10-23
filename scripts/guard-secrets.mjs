import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fail, pass } from "./lib/changed-files.mjs";

/**
 * Twee vragen tegelijk:
 *   1. Staat er een geheime sleutel in de repo?
 *   2. Staat er een geheime sleutel in de gebouwde bundel, dus in het bestand dat
 *      iedere bezoeker downloadt?
 *
 * De tweede is de gevaarlijkste van de hele stack. Eén `VITE_`-variabele te veel
 * en de service role key van je klant staat op straat, terwijl de app er van
 * buiten volstrekt normaal uitziet.
 *
 * Een regel bewust vrijgeven kan met de markering `guard-secrets:allow` op die regel.
 */
const JWT = /\beyJ[\w-]{10,}\.(eyJ[\w-]{10,})\.[\w-]{5,}/;

/**
 * De anon key is óók een JWT en hoort wél in de bundel: hij is expres publiek en
 * wordt door RLS beschermd. Elke andere rol, en met name service_role, is een
 * datalek. Daarom kijken we naar de inhoud van het token in plaats van naar de vorm.
 */
function jwtRole(match) {
  try {
    const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : "onbekend";
  } catch {
    return "onleesbaar";
  }
}

const PATTERNS = [
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  {
    name: "privésleutel",
    re: /-{5}BEGIN (?:[A-Z]+ )?PRIVATE KEY-{5}/,
    // In de bundel is de kale header niet genoeg: cryptobibliotheken (zoals de
    // sleutel-parser in @vercel/blob) bevatten die tekst in hun eigen code. Een
    // gelekte sleutel herken je aan wat erna komt: de base64-inhoud, eventueel
    // met letterlijke "\n"-tekens omdat de bundel geminificeerd is.
    reBundel: /-{5}BEGIN (?:[A-Z]+ )?PRIVATE KEY-{5}(?:\\r?\\?n|\s)*[A-Za-z0-9+/]{40}/,
  },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Stripe live key", re: /\b[rs]k_live_[A-Za-z0-9]{10,}/ },
  { name: "GitHub token", re: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { name: "OpenAI/Anthropic-achtige key", re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/ },
  { name: "service role key met waarde", re: /SERVICE_ROLE_KEY\s*[:=]\s*["']?\S{10,}/ },
  // Een Cloudflare-API-sleutel heeft geen herkenbaar voorvoegsel; hij valt op aan de
  // naam waaronder hij wordt toegekend. Een verwijzing als ${{ secrets.X }} is prima.
  {
    name: "Cloudflare-API-sleutel met waarde",
    re: /CLOUDFLARE_[A-Z_]*TOKEN\s*[:=]\s*["']?[A-Za-z0-9_-]{30,}/,
  },
];

const SKIP_FILES = new Set(["pnpm-lock.yaml", "scripts/guard-secrets.mjs"]);
const SKIP_EXT = /\.(png|jpe?g|gif|ico|webp|avif|woff2?|ttf|otf|pdf|zip|mp4)$/i;
const ENV_FILE = /^\.env(\..+)?$/;

const problems = [];

function scan(file, content, origin) {
  const isBundle = origin === "[bundel]";
  const lines = content.split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.includes("guard-secrets:allow")) continue;

    const token = JWT.exec(line);
    if (token) {
      const role = jwtRole(token);
      // In de bundel is alleen de anon key acceptabel; in git hoort geen enkel token.
      if (!isBundle || role !== "anon") {
        problems.push(`${origin} ${file}:${index + 1}: JSON Web Token met rol "${role}"`);
      }
    }

    for (const pattern of PATTERNS) {
      const re = isBundle && pattern.reBundel ? pattern.reBundel : pattern.re;
      if (re.test(line)) {
        problems.push(`${origin} ${file}:${index + 1}: ${pattern.name}`);
      }
    }
  }
}

// 1. Alles wat in git zit.
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);

for (const file of tracked) {
  const base = file.split("/").at(-1) ?? file;
  if (ENV_FILE.test(base) && base !== ".env.example") {
    problems.push(`[git] ${file}: een .env-bestand hoort nooit in git`);
    continue;
  }
  if (SKIP_FILES.has(file) || SKIP_EXT.test(file)) continue;
  try {
    scan(file, readFileSync(file, "utf8"), "[git]");
  } catch {
    // onleesbaar of binair: overslaan
  }
}

// 2. De gebouwde bundel, als die er is.
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

if (existsSync("dist")) {
  for (const file of walk("dist")) {
    if (SKIP_EXT.test(file)) continue;
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    scan(file, content, "[bundel]");
    if (/service_role/.test(content)) {
      problems.push(`[bundel] ${file}: de tekst "service_role" staat in de bundel`);
    }
  }
} else {
  console.log(
    "i dist/ bestaat niet, alleen de repo gecontroleerd (draai `pnpm build` voor de bundelcheck)",
  );
}

if (problems.length === 0) pass("geen geheimen gevonden in de repo of de bundel");

fail("Er staat mogelijk een geheime sleutel in de repo of in de bundel.", [
  ...problems.map((problem) => `- ${problem}`),
  "",
  "Wat nu:",
  "  - Staat het in de bundel? Dan hoort die sleutel niet in een VITE_-variabele.",
  "    Verplaats de aanroep naar een Supabase Edge Function.",
  "  - Staat het in git? Verwijder hem én draai de sleutel om. Wat één keer",
  "    gepusht is, is gelekt, ook na een revert.",
  "  - Vals alarm? Zet `guard-secrets:allow` als commentaar op die regel.",
]);
