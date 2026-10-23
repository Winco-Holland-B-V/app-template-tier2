import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * guard:secrets draait op alles wat in git staat. Deze test zet een los git-repo neer
 * met één bestand en draait de guard daarin, zoals CI dat doet.
 */
const GUARD = resolve(__dirname, "../../scripts/guard-secrets.mjs");

let map: string;

beforeEach(() => {
  map = mkdtempSync(join(tmpdir(), "guard-secrets-"));
  execFileSync("git", ["init", "-q"], { cwd: map });
});

afterEach(() => {
  rmSync(map, { recursive: true, force: true });
});

function metBestand(naam: string, inhoud: string): { code: number | null; uitvoer: string } {
  writeFileSync(join(map, naam), inhoud);
  execFileSync("git", ["add", naam], { cwd: map });
  const r = spawnSync("node", [GUARD], { cwd: map, encoding: "utf8" });
  return { code: r.status, uitvoer: `${r.stdout}${r.stderr}` };
}

describe("guard:secrets en Cloudflare-sleutels", () => {
  it("vindt een Cloudflare-API-sleutel met waarde", () => {
    const r = metBestand("uitrol.sh", `CLOUDFLARE_API_TOKEN=${"a1B2c3D4e5".repeat(4)}\n`);
    expect(r.code).not.toBe(0);
    expect(r.uitvoer).toContain("Cloudflare-API-sleutel");
  });

  it("laat een verwijzing naar een secret staan", () => {
    const r = metBestand(
      "uitrollen.yml",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub-expressie, geen JS-template
      "env:\n  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n",
    );
    expect(r.code).toBe(0);
  });
});
