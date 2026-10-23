import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, pass, skip } from "./lib/changed-files.mjs";
import { bezitDatabase } from "./lib/stack-config.mjs";

/**
 * In een browser-app is de database je beveiliging: er is geen tussenlaag die
 * controleert of iemand mag wat hij opvraagt. Een tabel zonder row level security
 * is dus geen slordigheid maar een datalek, en het is er een die je van buiten
 * niet ziet, want de app werkt gewoon.
 *
 * Deze guard leest álle migraties (niet alleen de gewijzigde) en eist dat elke
 * tabel in het schema `public` RLS aan heeft staan én minstens één policy heeft.
 */
if (!bezitDatabase()) {
  skip("deze app bezit geen database, dus ook geen tabellen om te beveiligen");
}

const MIGRATIONS_DIR = "supabase/migrations";

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function readAllMigrations() {
  let names;
  try {
    names = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();
  } catch {
    return null;
  }
  return names
    .map((name) => stripComments(readFileSync(join(MIGRATIONS_DIR, name), "utf8")))
    .join("\n");
}

const sql = readAllMigrations();
if (sql === null) pass("nog geen migraties");

const tables = new Set();

const createTable = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)/gi;
for (const match of sql.matchAll(createTable)) {
  const raw = (match[1] ?? "").replaceAll('"', "");
  const parts = raw.split(".");
  const schema = parts.length > 1 ? parts[0] : "public";
  const table = parts.at(-1);
  if (schema === "public" && table) tables.add(table);
}

const dropTable = /\bdrop\s+table\s+(?:if\s+exists\s+)?("?[\w.]+"?)/gi;
for (const match of sql.matchAll(dropTable)) {
  const raw = (match[1] ?? "").replaceAll('"', "");
  const table = raw.split(".").at(-1);
  if (table) tables.delete(table);
}

if (tables.size === 0) pass("geen tabellen in het schema public");

const problems = [];
for (const table of tables) {
  const enabled = new RegExp(
    `alter\\s+table\\s+(?:only\\s+)?(?:public\\.)?"?${table}"?\\s+enable\\s+row\\s+level\\s+security`,
    "i",
  ).test(sql);
  const hasPolicy = new RegExp(
    `create\\s+policy[\\s\\S]{0,200}?\\bon\\s+(?:public\\.)?"?${table}"?[\\s(]`,
    "i",
  ).test(sql);

  if (!enabled) problems.push(`${table}: row level security staat niet aan`);
  else if (!hasPolicy) problems.push(`${table}: RLS staat aan maar er is geen enkele policy`);
}

if (problems.length === 0) {
  pass(`${tables.size} tabel(len) gecontroleerd, allemaal met RLS en policies`);
}

fail("Er is een tabel zonder werkende beveiliging.", [
  ...problems.map((problem) => `- ${problem}`),
  "",
  "Voeg aan de migratie toe:",
  "",
  "  alter table public.<tabel> enable row level security;",
  '  create policy "<tabel>_select_own" on public.<tabel>',
  "    for select using (auth.uid() = owner_id);",
  "",
  "Let op: RLS aanzetten zonder policy betekent dat niemand er meer bij kan.",
  "Een policy zonder RLS betekent dat iedereen er bij kan. Je hebt ze allebei nodig.",
  "En schrijf er een test bij in tests/rls/ die controleert dat gebruiker A",
  "niet bij de gegevens van gebruiker B komt.",
]);
