import { readFileSync } from "node:fs";

/**
 * De databasestand uit stack.config.json, zoals de browsertests hem nodig hebben.
 * Dezelfde drie standen als scripts/lib/stack-config.mjs; hier apart in TypeScript
 * omdat Playwright dit bestand laadt en het klein moet blijven.
 */
export type DatabaseModus = "eigen" | "gedeeld" | "geen";

export function databaseModus(): DatabaseModus {
  try {
    const config: unknown = JSON.parse(readFileSync("stack.config.json", "utf8"));
    const database = (config as { database?: unknown }).database;
    if (database === false) return "geen";
    if (database === "gedeeld") return "gedeeld";
    return "eigen";
  } catch {
    return "eigen";
  }
}
