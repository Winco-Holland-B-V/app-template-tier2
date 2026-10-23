import { changedFiles, fail, pass, pullRequestBody, skip } from "./lib/changed-files.mjs";

/**
 * Wie code wijzigt, wijzigt ook een test. Niet omdat elke regel getest moet zijn,
 * maar omdat "ik doe de test later" in de praktijk "nooit" betekent, en omdat de
 * tests bij deze werkwijze de enige verplichte reviewer zijn.
 *
 * Ontsnappingsluik: zet een regel `Geen tests nodig: <reden>` in de PR-tekst.
 * Dat is expres zichtbaar werk, zodat het een keuze is en geen gewoonte.
 */
const PRODUCTION = [/^src\/.*\.(ts|tsx)$/, /^supabase\/functions\/.*\.ts$/];
const NOT_PRODUCTION = [
  /\.test\.(ts|tsx)$/,
  /^src\/lib\/database\.types\.ts$/,
  /^src\/vite-env\.d\.ts$/,
];
const TESTS = [/^tests\//, /^e2e\//, /\.test\.(ts|tsx)$/];

const files = changedFiles();
if (files === null) skip("geen basis om mee te vergelijken");

const production = files.filter(
  (file) => PRODUCTION.some((re) => re.test(file)) && !NOT_PRODUCTION.some((re) => re.test(file)),
);

if (production.length === 0) pass("geen productiecode gewijzigd, tests niet vereist");

const tests = files.filter((file) => TESTS.some((re) => re.test(file)));
if (tests.length > 0) pass(`productiecode én tests gewijzigd (${tests.length} testbestand(en))`);

const excuse = /^\s*Geen tests nodig:\s*\S.*$/im.exec(pullRequestBody());
if (excuse) pass(`tests overgeslagen met expliciete reden: "${excuse[0].trim()}"`);

fail("Deze PR wijzigt productiecode maar geen enkele test.", [
  "Gewijzigde productiecode:",
  ...production.map((file) => `  - ${file}`),
  "",
  "Doe één van beide:",
  "  1. Voeg een test toe die het nieuwe gedrag vastlegt (voorkeur), of",
  "  2. zet een regel in de PR-tekst: `Geen tests nodig: <reden>`",
  "",
  "Is dit een bugfix? Dan hoort er per definitie een test bij die de bug",
  "reproduceert, anders komt hij terug.",
]);
