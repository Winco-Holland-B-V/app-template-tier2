import { describe, expect, it, vi } from "vitest";

const createClient = vi.fn().mockReturnValue({});
vi.mock("@supabase/supabase-js", () => ({ createClient }));

describe("supabase-client", () => {
  it("gebruikt de PKCE-flow, zodat er nooit een token in het adres staat", async () => {
    await import("./supabase");
    expect(createClient).toHaveBeenCalledTimes(1);
    const opties = createClient.mock.calls[0]?.[2];
    expect(opties.auth).toEqual(expect.objectContaining({ flowType: "pkce" }));
  });
});
