import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/features/auth/login-page";
import { useSession } from "@/features/auth/use-session";
import { ItemsPage } from "@/features/items/items-page";

/**
 * Het deel van de app dat een database nodig heeft: inloggen en de voorbeeldlijst.
 * App.tsx laadt dit bestand alleen als de Supabase-waarden er zijn (zie
 * `heeftDatabase` in lib/env.ts), zodat een app zonder database nooit de
 * Supabase-client aanraakt.
 */
export default function AppMetDatabase() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <p className="p-6 text-sm text-muted-foreground" role="status">
        Bezig met laden…
      </p>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={session ? <ItemsPage session={session} /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
