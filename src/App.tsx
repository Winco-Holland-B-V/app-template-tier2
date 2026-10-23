import { lazy, Suspense } from "react";
import { StartPage } from "@/features/start/start-page";
import { env, heeftDatabase } from "@/lib/env";

// Alleen laden als er een database is: dit bestand importeert de Supabase-client.
const AppMetDatabase = lazy(() => import("@/features/auth/app-met-database"));

export function App() {
  return (
    <>
      {env.VITE_OMGEVING === "test" && (
        <p className="bg-amber-200 px-3 py-1 text-center text-xs text-amber-950" role="status">
          Testomgeving: dit is de testdatabase, niet de echte app.
        </p>
      )}
      {heeftDatabase ? (
        <Suspense
          fallback={
            <p className="p-6 text-sm text-muted-foreground" role="status">
              Bezig met laden…
            </p>
          }
        >
          <AppMetDatabase />
        </Suspense>
      ) : (
        <StartPage />
      )}
    </>
  );
}
