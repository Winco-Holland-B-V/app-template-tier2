import { spawnSync } from "node:child_process";

/**
 * `pnpm dev` weigert, en dat is geen storing.
 *
 * Previews gaan via de Cloudflare-preview van de pull request: dat is de enige omgeving
 * die de klant kan openen, en het is wat er ook echt live gaat. Een dev-server op
 * localhost bewijst niets over de gebouwde versie en kan niemand anders zien.
 *
 * Dit staat hier, op scriptniveau, en niet alleen in de hook van de Stage Two-plugin
 * voor Claude Code: zo geldt de afspraak ook voor een andere agent en voor een mens,
 * zonder dat iemand iets hoeft te installeren. De hook maakt hem alleen eerder merkbaar.
 *
 * Voor jezelf kijken mag wél, en dat is een andere situatie: je wilt tijdens het
 * bouwen zien wat je gemaakt hebt, niet iemand iets laten zien. Dat gaat expliciet,
 * met STACK_ALLOW_DEV=1 ervoor, zodat het nooit per ongeluk het resultaat wordt.
 * In de Claude-app hoeft dat niet: daar start de preview via .claude/launch.json
 * (scripts/preview.mjs). De route docs/routes/lokaal-kijken.md beschrijft beide.
 */
if (process.env.STACK_ALLOW_DEV !== "1") {
  console.error(
    [
      "",
      "✗ Geen dev-server om werk te laten zien.",
      "",
      "  Previews gaan via de Cloudflare-preview van je pull request: dat is de enige",
      "  omgeving die de klant kan openen en die is wat er ook echt live gaat.",
      "  Zie docs/WERKWIJZE.md, hoofdstuk 5, en de route docs/routes/verder-werken.md.",
      "",
      "  Wil je iets controleren zonder browser? Draai `pnpm test` of `pnpm test:e2e`.",
      "  Wil je voor jezelf zien wat je gemaakt hebt? In de Claude-app: de preview",
      "  (die start vanzelf, via .claude/launch.json). Elders mag het expliciet:",
      "    STACK_ALLOW_DEV=1 pnpm dev",
      "  Volg dan de route docs/routes/lokaal-kijken.md (wat je nodig hebt, welke",
      "  database, en waarom dit nooit het opgeleverde resultaat is).",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const uit = spawnSync("pnpm", ["exec", "vite", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(uit.status ?? 1);
