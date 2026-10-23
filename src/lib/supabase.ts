import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env, heeftDatabase } from "@/lib/env";

/**
 * De enige Supabase-client van de app. Importeer deze; maak nergens anders een
 * tweede client aan, anders raakt de ingelogde sessie versnipperd.
 *
 * Zonder database (zie `heeftDatabase` in env.ts) hoort dit bestand nooit geladen
 * te worden: App.tsx laadt het databasedeel van de app alleen als de waarden er zijn.
 * Wordt het toch geladen, dan is dat een programmeerfout en zeggen we dat meteen.
 */
if (!heeftDatabase) {
  throw new Error(
    "Deze app heeft geen database (VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY ontbreken). Importeer @/lib/supabase alleen in schermen die achter `heeftDatabase` staan.",
  );
}

/**
 * Het schema waar deze app mee praat: `public` bij een eigen database, `api` bij een
 * gedeelde. Welk van de twee het is, staat in stack.config.json en komt via
 * `VITE_SUPABASE_SCHEMA` binnen; `database.types.ts` is voor precies dát ene schema
 * gegenereerd. Die koppeling kan TypeScript niet zelf zien, vandaar deze ene bewuste
 * vernauwing, en geen enkele andere in dit bestand.
 *
 * `SchemaName` leidt hetzelfde af als supabase-js zelf doet: heeft de gegenereerde
 * `Database` een `public`, dan is dat het schema; anders is het het enige andere
 * schema dat erin zit, en dat is bij een gedeelde app per definitie `api`.
 */
type SchemaName = "public" extends keyof Database
  ? "public"
  : Exclude<keyof Database, "__InternalSupabase"> & string;

const SCHEMA = env.VITE_SUPABASE_SCHEMA as SchemaName;

export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL as string,
  env.VITE_SUPABASE_ANON_KEY as string,
  {
    db: { schema: SCHEMA },
    // PKCE: na inloggen bij een externe dienst komt er een eenmalige code terug in het
    // adres, geen token. Een token in een adres kan in logboeken of verkeerde handen
    // belanden; de code is zonder de geheime helft in deze browser waardeloos.
    auth: { flowType: "pkce" },
  },
);

export type Item = Database["public"]["Tables"]["items"]["Row"];
