import { z } from "zod";

/**
 * Alles wat van buiten komt (formulieren, webhooks, API's) gaat eerst door Zod.
 * Doe dat ook als het "maar" een formulier van jezelf is: de browser is geen
 * beveiliging, en de database ziet alleen wat er binnenkomt.
 */
export const itemInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Geef een omschrijving op.")
    .max(120, "Houd het bij maximaal 120 tekens."),
});

export type ItemInput = z.infer<typeof itemInputSchema>;

export const credentialsSchema = z.object({
  email: z.string().trim().email("Dit lijkt geen geldig e-mailadres."),
  password: z.string().min(8, "Een wachtwoord is minimaal 8 tekens."),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/** Zet een Zod-fout om in een map van veldnaam naar de eerste foutmelding. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && result[field] === undefined) {
      result[field] = issue.message;
    }
  }
  return result;
}
