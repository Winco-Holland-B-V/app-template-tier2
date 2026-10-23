import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";

/**
 * De belangrijkste test van deze stack.
 *
 * In een browser-app is er geen server die controleert of iemand mag wat hij
 * opvraagt. Als de RLS-policies fout staan, kan een ingelogde gebruiker met een
 * beetje kennis álle gegevens van álle klanten ophalen, terwijl de app er van
 * buiten volstrekt normaal uitziet. Er is geen enkele andere test die dat vangt.
 *
 * Het patroon: log in als A, probeer bij de gegevens van B te komen, verwacht leeg.
 * Herhaal dit voor élke nieuwe tabel.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} ontbreekt. Draai \`pnpm db:start\` en daarna \`pnpm env:local\` voordat je de RLS-tests draait.`,
    );
  }
  return value;
}

const url = required("SUPABASE_URL", import.meta.env.SUPABASE_URL);
const anonKey = required("SUPABASE_ANON_KEY", import.meta.env.SUPABASE_ANON_KEY);
const serviceRoleKey = required(
  "SUPABASE_SERVICE_ROLE_KEY",
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
);

const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Client = ReturnType<typeof createClient<Database>>;

type Actor = {
  id: string;
  email: string;
  client: Client;
};

async function createActor(label: string): Promise<Actor> {
  const email = `rls-${label}-${Date.now()}@voorbeeld.nl`;
  const password = "rls-test-wachtwoord-123";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Kon testgebruiker niet aanmaken: ${error?.message}`);

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`Kon niet inloggen als testgebruiker: ${signIn.error.message}`);

  return { id: data.user.id, email, client };
}

let alice: Actor;
let bob: Actor;

beforeAll(async () => {
  alice = await createActor("alice");
  bob = await createActor("bob");

  const { error } = await alice.client
    .from("items")
    .insert({ title: "Geheim van Alice", owner_id: alice.id });
  if (error) throw new Error(`Alice kon haar eigen item niet aanmaken: ${error.message}`);
});

afterAll(async () => {
  for (const actor of [alice, bob]) {
    if (actor) await admin.auth.admin.deleteUser(actor.id);
  }
});

describe("items: row level security", () => {
  it("laat de eigenaar het eigen item zien", async () => {
    const { data, error } = await alice.client.from("items").select("id, title");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.title).toBe("Geheim van Alice");
  });

  it("laat een andere gebruiker niets zien", async () => {
    const { data, error } = await bob.client.from("items").select("id, title");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("staat niet toe dat je een item op naam van een ander zet", async () => {
    const { error } = await bob.client
      .from("items")
      .insert({ title: "Namens Alice", owner_id: alice.id });
    expect(error).not.toBeNull();
  });

  it("staat niet toe dat een ander jouw item wijzigt", async () => {
    const { data: mine } = await alice.client.from("items").select("id").limit(1);
    const id = mine?.[0]?.id;
    expect(id).toBeDefined();
    if (!id) return;

    const { data: updated } = await bob.client
      .from("items")
      .update({ title: "Gekaapt" })
      .eq("id", id)
      .select();
    expect(updated).toEqual([]);
  });

  it("staat niet toe dat een ander jouw item verwijdert", async () => {
    const { data: mine } = await alice.client.from("items").select("id").limit(1);
    const id = mine?.[0]?.id;
    expect(id).toBeDefined();
    if (!id) return;

    await bob.client.from("items").delete().eq("id", id);
    const { data: stillThere } = await alice.client.from("items").select("id").eq("id", id);
    expect(stillThere).toHaveLength(1);
  });

  it("laat een uitgelogde bezoeker helemaal niets zien", async () => {
    const anonymous = createClient<Database>(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await anonymous.from("items").select("id");
    expect(data ?? []).toEqual([]);
  });
});
