/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Publiek: zit in de bundel die de bezoeker downloadt. */
  readonly VITE_SUPABASE_URL: string;
  /** Publiek en dat mag: de anon key wordt door RLS beschermd. */
  readonly VITE_SUPABASE_ANON_KEY: string;

  /* Alleen beschikbaar in de RLS-tests (zie vitest.rls.config.ts), nooit in de app. */
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
