/**
 * Het toegangsmodel (KTD8): wie mag bij welke app, in één bestand, `beheer/toegang.json`.
 *
 *   {
 *     "groepen": { "<groep>": { "domeinen": [], "adressen": [], "idp_groepen": [], "uitsluiten": [] } },
 *     "apps":    { "<app>": ["<groep>", ...] }
 *   }
 *
 * Per groep maakt de inrichting één herbruikbare Access-policy; beide Access-apps van
 * een app (deur en inlogdienst) en de Access op de Worker krijgen dezelfde lijst. Wie
 * niet door de deur mag, krijgt dus ook geen token.
 *
 * Een policy laat toe wie past bij een van de include-regels en niet bij een van de
 * exclude-regels van díe policy. Meerdere policies op een app tellen als "of". De
 * beslissing hieronder (magAanmelden) en de SQL van het vangnet volgen precies dat.
 */
import { appNamen, metPolicies, policyIdsVanApp, valideerVoorvoegsel } from "./cloudflare.mjs";

const VELDEN = ["domeinen", "adressen", "idp_groepen", "uitsluiten"];
const GROEPNAAM = /^[a-z0-9][a-z0-9-]{0,40}$/;
const DOMEIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ADRES = /^[a-z0-9._%+-]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IDP_GROEP = /^[^'"\\\n]{1,200}$/;

function klein(lijst) {
  return (lijst ?? []).map((x) => String(x).toLowerCase());
}

/** Controleert het bestand en geeft het terug; bij fouten één melding met alles erin. */
export function valideerToegang(t) {
  const fouten = [];
  if (!t || typeof t !== "object" || Array.isArray(t)) throw new Error("toegang.json: geen object");
  for (const sleutel of Object.keys(t)) {
    if (!["groepen", "apps"].includes(sleutel) && !sleutel.startsWith("$")) {
      fouten.push(`onbekend veld "${sleutel}" bovenin (alleen groepen en apps)`);
    }
  }
  const groepen = t.groepen;
  const apps = t.apps;
  if (!groepen || typeof groepen !== "object" || Array.isArray(groepen))
    fouten.push('"groepen" ontbreekt of is geen object');
  if (!apps || typeof apps !== "object" || Array.isArray(apps))
    fouten.push('"apps" ontbreekt of is geen object');
  if (fouten.length) throw new Error(`toegang.json: ${fouten.join("; ")}`);

  for (const [naam, groep] of Object.entries(groepen)) {
    if (!GROEPNAAM.test(naam))
      fouten.push(`groep "${naam}": naam alleen kleine letters, cijfers en streepjes`);
    if (!groep || typeof groep !== "object" || Array.isArray(groep)) {
      fouten.push(`groep "${naam}": geen object`);
      continue;
    }
    for (const [veld, waarde] of Object.entries(groep)) {
      if (veld.startsWith("$")) continue;
      if (!VELDEN.includes(veld)) {
        fouten.push(`groep "${naam}", veld ${veld}: onbekend veld (wel: ${VELDEN.join(", ")})`);
        continue;
      }
      if (!Array.isArray(waarde) || waarde.some((x) => typeof x !== "string")) {
        fouten.push(`groep "${naam}", veld ${veld}: moet een lijst met tekst zijn`);
        continue;
      }
      const patroon = {
        domeinen: DOMEIN,
        adressen: ADRES,
        uitsluiten: ADRES,
        idp_groepen: IDP_GROEP,
      }[veld];
      for (const x of waarde) {
        const te = veld === "idp_groepen" ? x : x.toLowerCase();
        if (!patroon.test(te)) fouten.push(`groep "${naam}", veld ${veld}: "${x}" is ongeldig`);
      }
    }
    const aantal = ["domeinen", "adressen", "idp_groepen"].reduce(
      (n, v) => n + (groep[v]?.length ?? 0),
      0,
    );
    if (aantal === 0) {
      fouten.push(
        `groep "${naam}": geen domeinen, adressen of idp_groepen; een lege groep laat niemand toe`,
      );
    }
  }

  for (const [app, gekozen] of Object.entries(apps)) {
    if (!GROEPNAAM.test(app))
      fouten.push(`app "${app}": naam alleen kleine letters, cijfers en streepjes`);
    if (!Array.isArray(gekozen) || gekozen.length === 0) {
      fouten.push(`app "${app}": geen groepen gekozen; een app zonder groep laat niemand toe`);
      continue;
    }
    for (const g of gekozen) {
      if (!Object.hasOwn(groepen, g)) fouten.push(`app "${app}", groep "${g}": onbekende groep`);
    }
  }
  if (fouten.length) throw new Error(`toegang.json: ${fouten.join("; ")}`);
  return t;
}

/** De naam van de policy van een groep: het voorvoegsel plus de groepsnaam. */
export function policyNaam(groep, voorvoegsel) {
  return `${valideerVoorvoegsel(voorvoegsel)}${groep}`;
}

/**
 * Kan deze policy door dit script voor dit voorvoegsel gemaakt zijn? Dat is het
 * voorvoegsel plus een geldige groepsnaam. Een naam van een ander, genest voorvoegsel
 * kan hier niet tussen zitten: het voorvoegselpatroon (één streepje, aan het eind; zie
 * valideerVoorvoegsel) zorgt dat geen ander geldig voorvoegsel met dit voorvoegsel
 * begint.
 */
export function isEigenPolicy(naam, voorvoegsel) {
  const vv = valideerVoorvoegsel(voorvoegsel);
  return typeof naam === "string" && naam.startsWith(vv) && GROEPNAAM.test(naam.slice(vv.length));
}

/**
 * Een groep als herbruikbare Access-policy. NAGAAN (U7): de regelvormen
 * `email_domain.domain`, `email.email` en de IdP-groepsregels (`azureAD.id`,
 * `gsuite.email`, `okta.name`, elk met `identity_provider_id`).
 *
 * `groepenIdp` is de gekoppelde identiteitsdienst voor `idp_groepen`, als
 * `{ type: "azureAD" | "gsuite" | "okta", id }` (CLOUDFLARE_GROEPEN_IDP). De naam van de
 * policy is het voorvoegsel plus de groepsnaam.
 */
export function policyVoorGroep(naam, groep, { groepenIdp, voorvoegsel } = {}) {
  const vv = valideerVoorvoegsel(voorvoegsel);
  const include = [
    ...klein(groep.domeinen).map((domain) => ({ email_domain: { domain } })),
    ...klein(groep.adressen).map((email) => ({ email: { email } })),
  ];
  const idpGroepen = groep.idp_groepen ?? [];
  if (idpGroepen.length > 0) {
    if (!groepenIdp?.id || !groepenIdp?.type) {
      throw new Error(
        `groep "${naam}", veld idp_groepen: er is geen identiteitsdienst gekoppeld (zet CLOUDFLARE_GROEPEN_IDP als <type>:<id>, bijvoorbeeld azureAD:<id>)`,
      );
    }
    const regel = {
      azureAD: (g) => ({ azureAD: { id: g, identity_provider_id: groepenIdp.id } }),
      gsuite: (g) => ({ gsuite: { email: g, identity_provider_id: groepenIdp.id } }),
      okta: (g) => ({ okta: { name: g, identity_provider_id: groepenIdp.id } }),
    }[groepenIdp.type];
    if (!regel) {
      throw new Error(
        `groep "${naam}", veld idp_groepen: identiteitsdienst van type "${groepenIdp.type}" wordt niet ondersteund`,
      );
    }
    include.push(...idpGroepen.map(regel));
  }
  return {
    name: policyNaam(naam, vv),
    decision: "allow",
    include,
    exclude: klein(groep.uitsluiten).map((email) => ({ email: { email } })),
    require: [],
  };
}

/** Alle policies zoals het bestand ze wil; gooit vóór elke schrijfactie als er iets niet klopt. */
export function gewenstePolicies(toegang, opties) {
  const t = valideerToegang(toegang);
  return Object.entries(t.groepen).map(([naam, groep]) => ({
    groep: naam,
    body: policyVoorGroep(naam, groep, opties),
  }));
}

function vergelijkbaar(p) {
  return JSON.stringify({
    decision: p.decision,
    include: p.include ?? [],
    exclude: p.exclude ?? [],
    require: p.require ?? [],
  });
}

/** Een policy zonder voorvoegsel met de naam van een groep: van iemand anders, dus stoppen. */
export function kaleNaamConflicten(toegang, policies, voorvoegsel) {
  const vv = valideerVoorvoegsel(voorvoegsel);
  return Object.keys(toegang.groepen)
    .filter((g) => policies.some((p) => p.name === g))
    .map((g) => `Access-policy "${g}" bestaat al zonder voorvoegsel ${vv}`);
}

/**
 * Maakt de policies met voorvoegsel gelijk aan het bestand: aanmaken of bijwerken.
 * Verwijderen gebeurt apart (verwijderOverbodig), pas nadat de apps de oude policy
 * niet meer gebruiken; Cloudflare weigert een policy die nog gekoppeld is.
 */
export async function synchroniseerPolicies(
  cf,
  toegang,
  { groepenIdp, bestaand, voorvoegsel } = {},
) {
  const gewenst = gewenstePolicies(toegang, { groepenIdp, voorvoegsel });
  const huidig = bestaand ?? (await cf.policies());
  const conflicten = kaleNaamConflicten(toegang, huidig, voorvoegsel);
  if (conflicten.length) throw new Error(`gestopt zonder wijzigingen: ${conflicten.join("; ")}`);

  const ids = {};
  const acties = [];
  for (const { groep, body } of gewenst) {
    const er = huidig.find((p) => p.name === body.name);
    if (!er) {
      const nieuw = await cf.maakPolicy(body);
      ids[groep] = nieuw.id;
      acties.push(`policy ${body.name} aangemaakt`);
    } else {
      ids[groep] = er.id;
      if (vergelijkbaar(er) !== vergelijkbaar(body)) {
        await cf.werkPolicyBij(er.id, body);
        acties.push(`policy ${body.name} bijgewerkt`);
      }
    }
  }
  const namen = new Set(gewenst.map((g) => g.body.name));
  const overbodig = huidig.filter((p) => isEigenPolicy(p.name, voorvoegsel) && !namen.has(p.name));
  return { ids, acties, overbodig };
}

export async function verwijderOverbodig(cf, overbodig) {
  const weg = [];
  for (const p of overbodig) {
    await cf.verwijderPolicy(p.id);
    weg.push(p.name);
  }
  return weg;
}

/** De policy-ids van een app, in de volgorde van het bestand. */
export function policyIdsVoorApp(toegang, app, ids) {
  return toegang.apps[app].map((g) => ids[g]);
}

/**
 * Zet bij elke bestaande Access-app van elke app in het bestand de juiste policies.
 * Alleen waar de lijst anders is, wordt er geschreven.
 */
export async function koppelPolicies(cf, toegang, apps, ids, voorvoegsel) {
  const acties = [];
  for (const app of Object.keys(toegang.apps)) {
    const gewenst = policyIdsVoorApp(toegang, app, ids);
    const namen = appNamen(app, voorvoegsel);
    for (const naam of [namen.deur, namen.inlog, namen.worker]) {
      const er = apps.find((a) => a.name === naam);
      if (!er) continue;
      if (JSON.stringify(policyIdsVanApp(er)) === JSON.stringify(gewenst)) continue;
      await cf.werkAppBij(er.id, metPolicies(er, gewenst));
      acties.push(`policies van ${naam} bijgewerkt`);
    }
  }
  return acties;
}

// ---------------------------------------------------------------- de beslissing

function geldigAdres(adres) {
  return /^[^@\s]+@[^@\s]+$/.test(adres);
}

/**
 * Mag dit adres bij deze app? "ja", "nee", of "onbekend" als een gekozen groep op
 * IdP-groepen werkt: aan een e-mailadres alleen zie je niet of iemand in die groep zit.
 */
export function magAanmelden(email, toegang, app) {
  const adres = String(email ?? "").toLowerCase();
  if (!geldigAdres(adres)) return "nee";
  const domein = adres.split("@")[1];
  let onbekend = false;
  for (const g of toegang.apps[app] ?? []) {
    const groep = toegang.groepen[g];
    if (klein(groep.uitsluiten).includes(adres)) continue;
    if (klein(groep.domeinen).includes(domein) || klein(groep.adressen).includes(adres))
      return "ja";
    if ((groep.idp_groepen ?? []).length > 0) onbekend = true;
  }
  return onbekend ? "onbekend" : "nee";
}

/**
 * Trekt de toegang in van wie niet meer past: een ban (lang genoeg om "voorgoed" te
 * zijn) en afmelden van alle sessies. Zonder dat laatste loopt een bestaande sessie
 * gewoon door; refresh-tokens verlopen op het gratis plan niet. Wie al geband is,
 * blijft onaangeroerd; wie "onbekend" is (IdP-groep) wordt gemeld, niet geband.
 *
 * Wie past en nog een actieve ban heeft (eerder ingetrokken, nu weer op de lijst),
 * krijgt de ban opgeheven via `ontban`. Wie past zonder ban, blijft onaangeroerd.
 */
export async function trekIn({ gebruikers, toegang, app, ban, afmelden, ontban, nu = new Date() }) {
  const uit = {
    ingetrokken: [],
    toegelaten: [],
    onaangeroerd: 0,
    alIngetrokken: [],
    onbekend: [],
  };
  for (const g of gebruikers) {
    if (!g.email) continue;
    const oordeel = magAanmelden(g.email, toegang, app);
    const geband = Boolean(g.banned_until && new Date(g.banned_until) > nu);
    if (oordeel === "ja") {
      if (geband) {
        await ontban(g.id);
        uit.toegelaten.push(g.email);
      } else {
        uit.onaangeroerd += 1;
      }
      continue;
    }
    if (oordeel === "onbekend") {
      uit.onbekend.push(g.email);
      continue;
    }
    if (geband) {
      uit.alIngetrokken.push(g.email);
      continue;
    }
    await ban(g.id);
    await afmelden(g.id);
    uit.ingetrokken.push(g.email);
  }
  return uit;
}

export const BAN_DUUR = "876000h";

/** Zo heft Supabase een ban op (`updateUserById`). */
export const GEEN_BAN = "none";

// ---------------------------------------------------------------- vangnet (R18)

/**
 * De naam van de hookfunctie van het vangnet, afgeleid van het voorvoegsel:
 * `cf-proef-` wordt `cf_proef_voor_aanmelden`, `rp-` wordt `rp_voor_aanmelden`. Het
 * patroon van het voorvoegsel zorgt dat er alleen `[a-z0-9_]` in staat.
 */
export function hookFunctie(voorvoegsel) {
  return `${valideerVoorvoegsel(voorvoegsel).replaceAll("-", "_")}voor_aanmelden`;
}

/** Een tekst als SQL-literal: enkele aanhalingstekens verdubbeld. */
export function sqlTekst(waarde) {
  return `'${String(waarde).replaceAll("'", "''")}'`;
}

function sqlLijst(lijst) {
  return `array[${lijst.map(sqlTekst).join(", ")}]::text[]`;
}

/**
 * De before-user-created-hook van het vangnet: laat alleen aanmelden toe wie past bij
 * de domeinen en adressen van de gekozen groepen van deze app, met dezelfde
 * uitsluitingen als de Access-policies. IdP-groepen tellen hier niet mee: het vangnet
 * is juist voor inloggen zónder Cloudflare. De hook geldt voor elke aanmeldroute
 * (mailcode, wachtwoord, OAuth).
 */
export function vangnetSql(toegang, app, functie) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(functie))
    throw new Error(`ongeldige functienaam "${functie}"`);
  const t = valideerToegang(toegang);
  if (!t.apps[app]) throw new Error(`app "${app}" staat niet in toegang.json`);
  const regels = t.apps[app].map((g) => {
    const groep = t.groepen[g];
    return [
      `  -- groep ${g}`,
      `  if (domein = any (${sqlLijst(klein(groep.domeinen))}) or adres = any (${sqlLijst(klein(groep.adressen))}))`,
      `     and not (adres = any (${sqlLijst(klein(groep.uitsluiten))})) then`,
      `    return '{}'::jsonb;`,
      "  end if;",
    ].join("\n");
  });
  const naam = `public.${functie}`;
  return `create or replace function ${naam}(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $vangnet$
declare
  adres text := lower(coalesce(event->'user'->>'email', ''));
  domein text := split_part(adres, '@', 2);
begin
  if adres !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Dit adres heeft geen toegang tot deze app.'));
  end if;
${regels.join("\n")}
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Dit adres heeft geen toegang tot deze app.'));
end;
$vangnet$;

grant execute on function ${naam}(jsonb) to supabase_auth_admin;
revoke execute on function ${naam}(jsonb) from authenticated, anon, public;
`;
}
