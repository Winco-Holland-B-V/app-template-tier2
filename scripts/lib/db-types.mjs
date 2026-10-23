import { execFileSync } from "node:child_process";
import { databaseModus, gedeeldeDatabase } from "./stack-config.mjs";

export const TARGET = "src/lib/database.types.ts";

export const HEADER = [
  "// GEGENEREERD BESTAND, niet met de hand aanpassen.",
  "// Opnieuw genereren na een migratie: `pnpm db:types` (met `pnpm db:start` actief).",
  "// De CI controleert of dit bestand nog gelijkloopt met het databaseschema.",
].join("\n");

/**
 * Een app met een gedeelde database heeft geen lokale Supabase om types uit te
 * halen: haar schema staat in het project van een andere app. De types komen dan
 * uit dát project, en uitsluitend uit het schema `api` — het contract. De rest van
 * die database bestaat voor deze app niet, en dat hoort ook zo.
 *
 * Daar is wel een SUPABASE_ACCESS_TOKEN voor nodig. Ontbreekt die, dan kan er niets
 * gegenereerd worden; de aanroeper beslist of dat een fout is of een reden om over
 * te slaan.
 */
export function kanGenereren() {
  if (databaseModus() !== "gedeeld") return true;
  return Boolean(process.env.SUPABASE_ACCESS_TOKEN);
}

function argumenten() {
  const basis = ["exec", "supabase", "gen", "types", "typescript"];
  if (databaseModus() === "gedeeld") {
    const gedeeld = gedeeldeDatabase();
    return [...basis, "--project-id", gedeeld.project_ref, "--schema", "api"];
  }
  return [...basis, "--local"];
}

/** Genereert de databasetypes: lokaal bij een eigen database, anders uit het contract. */
export function generate() {
  return execFileSync("pnpm", argumenten(), {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

/** Haalt de kop met commentaarregels weg, zodat we alleen de inhoud vergelijken. */
export function stripHeader(text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  let start = 0;
  while (start < lines.length) {
    const line = lines[start]?.trim() ?? "";
    if (line === "" || line.startsWith("//")) start += 1;
    else break;
  }
  return lines.slice(start).join("\n").trim();
}
