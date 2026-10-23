import { expect, test } from "@playwright/test";
import { databaseModus } from "./stack-config";

/**
 * De happy path van een app zonder database: de gebouwde app komt op en toont de
 * startpagina. Meer is er in die stand niet te testen, en dat is genoeg om te weten
 * dat build, hosting-instellingen en omgevingsvariabelen kloppen. Zodra de app een
 * database krijgt, geldt e2e/happy-path.spec.ts en slaat deze test zichzelf over.
 */
test.skip(databaseModus() !== "geen", "deze app heeft een database; zie e2e/happy-path.spec.ts");

test("de app komt op en toont de startpagina", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welkom" })).toBeVisible();
});
