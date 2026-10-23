import { createClient } from "@supabase/supabase-js";
import { databaseModus } from "./stack-config";
import { TEST_USER } from "./test-user";

/**
 * Alleen een app met een eigen database heeft een eigen gebruikersadministratie om
 * een testgebruiker in aan te maken. Zonder database is er niets in te loggen, en bij
 * een gedeelde database staan de gebruikers in het project van een andere app en gaan
 * we daar niets aanmaken.
 */
function heeftEigenGebruikers(): boolean {
  return databaseModus() === "eigen";
}

/**
 * Maakt de testgebruiker aan voordat de end-to-end tests draaien. Zo heeft de test
 * geen handmatig aangemaakt account nodig en geen wachtwoord in de repo-secrets:
 * de omgeving maakt zichzelf.
 */
export default async function globalSetup(): Promise<void> {
  if (!heeftEigenGebruikers()) return;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt. Draai `pnpm db:start` en daarna `pnpm env:local`.",
    );
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users.find((user) => user.email === TEST_USER.email);
  if (found) {
    await admin.auth.admin.deleteUser(found.id);
  }

  const { error } = await admin.auth.admin.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    email_confirm: true,
  });
  if (error) throw new Error(`Kon de testgebruiker niet aanmaken: ${error.message}`);
}
