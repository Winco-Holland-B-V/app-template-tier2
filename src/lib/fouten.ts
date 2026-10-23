import * as Sentry from "@sentry/react";

/**
 * Foutmelding naar Sentry. Staat alleen aan als er een DSN is (`VITE_SENTRY_DSN`);
 * zonder DSN gebeurt er niets. De omgeving komt uit `VITE_OMGEVING`, zodat de preview
 * (`test`) en productie los van elkaar in Sentry staan.
 */
type Opties = {
  dsn?: string;
  omgeving?: string;
};

const GEEN_PERSOONSGEGEVENS = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
} satisfies Sentry.BrowserOptions["dataCollection"];

let gestart = false;

/** Start Sentry één keer. Geeft terug of Sentry aan staat. */
export function startFoutmelding({ dsn, omgeving }: Opties): boolean {
  if (gestart) return true;
  if (!dsn) return false;
  try {
    Sentry.init({
      dsn,
      environment: omgeving ?? "productie",
      // Geen persoonsgegevens meesturen. Sentry 11 kent `sendDefaultPii` niet meer en
      // verzamelt zonder deze instelling standaard alles; dit is het strikte equivalent
      // van `sendDefaultPii: false`: geen gebruiker of IP-adres, geen cookies, headers,
      // bodies of queryparameters, en geen waarden van lokale variabelen.
      dataCollection: GEEN_PERSOONSGEGEVENS,
    });
    gestart = true;
  } catch (fout) {
    // Een verkeerde DSN mag de app nooit laten crashen; dan maar zonder foutmelding.
    console.warn("Sentry is niet gestart: VITE_SENTRY_DSN klopt niet.", fout);
  }
  return gestart;
}
