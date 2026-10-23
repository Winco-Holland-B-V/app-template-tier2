import type { Session } from "@supabase/supabase-js";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Item, supabase } from "@/lib/supabase";
import { itemInputSchema } from "@/lib/validation";

type ItemsPageProps = {
  session: Session;
};

export function ItemsPage({ session }: ItemsPageProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("items")
      .select("id, title, owner_id, created_at")
      .order("created_at", { ascending: false });

    if (loadError) {
      setError("De lijst kon niet geladen worden.");
    } else {
      setItems(data);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = itemInputSchema.safeParse({ title });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Deze invoer klopt niet.");
      return;
    }

    const { error: insertError } = await supabase
      .from("items")
      .insert({ title: parsed.data.title, owner_id: session.user.id });

    if (insertError) {
      setError("Toevoegen is niet gelukt.");
      return;
    }

    setTitle("");
    setError(null);
    await load();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mijn lijst</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{session.user.email}</span>
          <Button variant="outline" size="sm" onClick={() => void supabase.auth.signOut()}>
            Uitloggen
          </Button>
        </div>
      </header>

      <form className="flex items-end gap-3" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="title">Nieuw item</Label>
          <Input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Waar gaat het over?"
          />
        </div>
        <Button type="submit">Toevoegen</Button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Bezig met laden…</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Items">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border bg-card p-3 text-sm">
              {item.title}
            </li>
          ))}
          {items.length === 0 ? (
            <li className="text-sm text-muted-foreground">Nog niets toegevoegd.</li>
          ) : null}
        </ul>
      )}
    </main>
  );
}
