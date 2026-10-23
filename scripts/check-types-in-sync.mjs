import { readFileSync } from "node:fs";
import { generate, HEADER, kanGenereren, stripHeader, TARGET } from "./lib/db-types.mjs";
import { databaseModus } from "./lib/stack-config.mjs";

/**
 * De gegenereerde databasetypes zijn de brug tussen je database en je code.
 * Lopen ze uit de pas, dan denkt TypeScript dat een kolom bestaat die er niet
 * meer is, en faalt je app pas in productie in plaats van in de CI.
 *
 * De Supabase CLI zit als devDependency in package.json, dus iedereen (en de CI)
 * genereert met exact dezelfde versie. Dat is geen detail: een andere CLI-versie
 * geeft een andere opmaak en dus een valse mismatch.
 */
if (databaseModus() === "geen") {
  console.log("overgeslagen: deze app heeft geen database");
  process.exit(0);
}

/**
 * Bij een gedeelde database komen de types uit het project van de eigenaar, en dat
 * vraagt een token. Staat dat er niet (een kloon zonder secrets), dan controleren
 * we niets in plaats van vals alarm te slaan.
 */
if (!kanGenereren()) {
  console.log(
    "overgeslagen: SUPABASE_ACCESS_TOKEN ontbreekt, dus het contract is niet op te halen",
  );
  process.exit(0);
}

let generated;
try {
  generated = generate();
} catch (error) {
  console.error("✗ De types konden niet gegenereerd worden.");
  console.error("  Draait de lokale database? Start hem met `pnpm db:start`.");
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}

const committed = readFileSync(TARGET, "utf8");

if (stripHeader(generated) === stripHeader(committed)) {
  console.log(`✓ ${TARGET} loopt gelijk met het databaseschema`);
  process.exit(0);
}

console.error(`\n✗ ${TARGET} loopt niet gelijk met het databaseschema.\n`);
console.error("  Draai `pnpm db:types` en commit het resultaat.\n");
console.error("  Dit is wat er gegenereerd wordt:\n");
console.error("----- BEGIN GEGENEREERDE TYPES -----");
console.error(`${HEADER}\n${generated}`);
console.error("----- EINDE GEGENEREERDE TYPES -----");
process.exit(1);
