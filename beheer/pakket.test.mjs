import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * beheer/ moet op zichzelf kunnen draaien: gekopieerd naar een beheer-repo, samen met
 * dat ene bestand `scripts/lib/cloudflare-config.mjs` op hetzelfde relatieve pad. Deze
 * test draait zowel in de template als in zo'n kopie.
 */
const BEHEER = dirname(fileURLToPath(import.meta.url));
const TOEGESTAAN_BUITEN_BEHEER = resolve(BEHEER, "../scripts/lib/cloudflare-config.mjs");
const pakket = JSON.parse(readFileSync(join(BEHEER, "package.json"), "utf8"));

function bronbestanden(map) {
  return readdirSync(map, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules") return [];
    const pad = join(map, e.name);
    if (e.isDirectory()) return bronbestanden(pad);
    return e.name.endsWith(".mjs") ? [pad] : [];
  });
}

function imports(tekst) {
  return [...tekst.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+["']([^"']+)["']/gm)].map(
    (m) => m[1],
  );
}

test("pakket: eigen package.json met type module, node --test en supabase-js", () => {
  assert.equal(pakket.type, "module");
  assert.equal(pakket.private, true);
  assert.match(pakket.scripts?.test ?? "", /^node --test\b/);
  assert.ok(pakket.dependencies?.["@supabase/supabase-js"], "supabase-js staat erin");
});

test("pakket: supabase-js in dezelfde versie als de template (alleen in de template)", (t) => {
  const root = resolve(BEHEER, "../package.json");
  if (!existsSync(root)) return t.skip("geen template eromheen (kopie in een beheer-repo)");
  const template = JSON.parse(readFileSync(root, "utf8"));
  if (!template.dependencies?.["@supabase/supabase-js"]) return t.skip("geen template");
  assert.equal(
    pakket.dependencies["@supabase/supabase-js"],
    template.dependencies["@supabase/supabase-js"],
  );
});

test("pakket: imports blijven in beheer/, op de config-controle na, en pakketten staan in package.json", () => {
  const afhankelijk = new Set(Object.keys(pakket.dependencies ?? {}));
  const fouten = [];
  for (const bestand of bronbestanden(BEHEER)) {
    for (const bron of imports(readFileSync(bestand, "utf8"))) {
      const waar = relative(BEHEER, bestand);
      if (bron.startsWith("node:")) continue;
      if (bron.startsWith(".")) {
        const doel = resolve(dirname(bestand), bron);
        const binnen = !relative(BEHEER, doel).startsWith("..");
        if (!binnen && doel !== TOEGESTAAN_BUITEN_BEHEER) fouten.push(`${waar}: ${bron}`);
        continue;
      }
      const naam = bron.startsWith("@")
        ? bron.split("/").slice(0, 2).join("/")
        : bron.split("/")[0];
      if (!afhankelijk.has(naam)) fouten.push(`${waar}: pakket ${naam} staat niet in package.json`);
    }
  }
  assert.deepEqual(fouten, []);
});
