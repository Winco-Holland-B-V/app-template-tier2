import { expect, test } from "@playwright/test";
import { databaseModus } from "./stack-config";
import { TEST_USER } from "./test-user";

// Zonder database is er niets om in te loggen; dan geldt e2e/start.spec.ts.
test.skip(databaseModus() === "geen", "deze app heeft geen database; zie e2e/start.spec.ts");

/**
 * De happy path: de route door de app waarop niets misgaat.
 *
 * Waarom juist deze test, en waarom als eerste: breekt de happy path, dan is de
 * app waardeloos. Hij raakt in één keer de hele keten (build, inloggen, database,
 * RLS, UI) en kost je één keer een half uur.
 *
 * Uitbreiden doe je reactief: elke keer dat er in productie iets stukgaat, komt
 * daar een test bij die precies dát geval afdekt.
 */
test("inloggen, item toevoegen, item terugzien", async ({ page }) => {
  await page.goto("/");

  // Niet ingelogd: je hoort op het inlogscherm te belanden.
  await expect(page.getByRole("heading", { name: "Inloggen" })).toBeVisible();

  await page.getByLabel("E-mailadres").fill(TEST_USER.email);
  await page.getByLabel("Wachtwoord").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Inloggen" }).click();

  await expect(page.getByRole("heading", { name: "Mijn lijst" })).toBeVisible();

  const omschrijving = `Testitem ${Date.now()}`;
  await page.getByLabel("Nieuw item").fill(omschrijving);
  await page.getByRole("button", { name: "Toevoegen" }).click();

  await expect(page.getByRole("listitem").filter({ hasText: omschrijving })).toBeVisible();

  // En na verversen staat het er nog steeds: het is echt opgeslagen.
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: omschrijving })).toBeVisible();
});

test("een verkeerd wachtwoord geeft een nette melding en geen toegang", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("E-mailadres").fill(TEST_USER.email);
  await page.getByLabel("Wachtwoord").fill("dit-is-niet-het-wachtwoord");
  await page.getByRole("button", { name: "Inloggen" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mijn lijst" })).toBeHidden();
});
