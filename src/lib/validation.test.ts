import { describe, expect, it } from "vitest";
import { credentialsSchema, fieldErrors, itemInputSchema } from "@/lib/validation";

describe("itemInputSchema", () => {
  it("accepteert een normale omschrijving en haalt spaties weg", () => {
    const result = itemInputSchema.parse({ title: "  Twee dozen potgrond  " });
    expect(result.title).toBe("Twee dozen potgrond");
  });

  it("weigert een lege omschrijving", () => {
    const result = itemInputSchema.safeParse({ title: "   " });
    expect(result.success).toBe(false);
  });

  it("weigert meer dan 120 tekens", () => {
    const result = itemInputSchema.safeParse({ title: "a".repeat(121) });
    expect(result.success).toBe(false);
  });
});

describe("credentialsSchema", () => {
  it("weigert een adres zonder @", () => {
    const result = credentialsSchema.safeParse({ email: "geen-adres", password: "geheim123" });
    expect(result.success).toBe(false);
  });

  it("weigert een te kort wachtwoord", () => {
    const result = credentialsSchema.safeParse({ email: "a@b.nl", password: "kort" });
    expect(result.success).toBe(false);
  });
});

describe("fieldErrors", () => {
  it("geeft per veld de eerste melding terug", () => {
    const result = credentialsSchema.safeParse({ email: "fout", password: "x" });
    if (result.success) throw new Error("verwachtte een validatiefout");
    const errors = fieldErrors(result.error);
    expect(Object.keys(errors).sort()).toEqual(["email", "password"]);
  });
});
