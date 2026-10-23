/**
 * Bouwt het adres van de Supabase-database voor `supabase db push --db-url`, voor
 * deploy-db.yml. Leest uit env:
 *   PROJECT_REF  de project-ref (verplicht)
 *   WACHTWOORD   het databasewachtwoord (verplicht)
 *   POOLER       de host van de session pooler (optioneel, bijvoorbeeld
 *                aws-0-eu-central-1.pooler.supabase.com)
 *
 * Met pooler:   postgresql://postgres.<ref>:<ww>@<pooler>:5432/postgres (IPv4)
 * Zonder:       postgresql://postgres:<ww>@db.<ref>.supabase.co:5432/postgres (alleen IPv6)
 * <ww> is het wachtwoord met encodeURIComponent, zodat tekens als @ / : het adres niet breken.
 *
 * Maskeren. GitHub maskeert het secret zelf, maar het gecodeerde wachtwoord is een
 * andere tekenreeks en zou in het log leesbaar kunnen worden. Daarom twee aanroepen:
 *
 *   node scripts/db-url.mjs --mask        # stdout: alleen ::add-mask::<gecodeerd ww>
 *   DB_URL=$(node scripts/db-url.mjs)     # stdout: alleen het adres
 *
 * De eerste aanroep schrijft rechtstreeks naar het log van de runner, dus het masker
 * staat er voordat het adres bestaat. De tweede vangt alleen het adres in `$()`; zou
 * het script daar ook het maskeercommando schrijven, dan kwam dat in de variabele
 * terecht in plaats van bij de runner. Beide aanroepen coderen op dezelfde manier,
 * dus het masker dekt precies wat er in het adres staat.
 *
 * Ontbreekt de ref of het wachtwoord, dan stopt het script met exitcode 1 en schrijft
 * het niets naar stdout. Met `set -e` (standaard in een run-stap) stopt de stap dan
 * ook, voordat er iets met een half adres gebeurt.
 */
const ref = process.env.PROJECT_REF ?? "";
const wachtwoord = process.env.WACHTWOORD ?? "";
const pooler = process.env.POOLER ?? "";

const ontbreekt = [];
if (!ref) ontbreekt.push("PROJECT_REF");
if (!wachtwoord) ontbreekt.push("WACHTWOORD");
if (ontbreekt.length > 0) {
  process.stderr.write(`db-url: ${ontbreekt.join(" en ")} ontbreekt in env.\n`);
  process.exit(1);
}

const ww = encodeURIComponent(wachtwoord);

if (process.argv.includes("--mask")) {
  process.stdout.write(`::add-mask::${ww}\n`);
} else if (pooler) {
  process.stdout.write(`postgresql://postgres.${ref}:${ww}@${pooler}:5432/postgres`);
} else {
  process.stdout.write(`postgresql://postgres:${ww}@db.${ref}.supabase.co:5432/postgres`);
}
