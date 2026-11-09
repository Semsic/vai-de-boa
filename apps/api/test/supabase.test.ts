import { afterEach, expect, it, vi } from "vitest";
import { supabaseRepository } from "../src/repositories/supabase.js";

afterEach(() => vi.unstubAllGlobals());
it("pede um único registro ao PostgREST ao criar uma corrida", async () => {
  let accept = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      accept = new Headers(init.headers).get("accept") ?? "";
      return new Response(
        JSON.stringify({ id: "ride-id", status: "pending" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
  const repo = supabaseRepository("https://demo.supabase.co", "chave-de-teste");
  const ride = await repo.createRide("user-id", "Rua A", "Rua B");
  expect(accept).toBe("application/vnd.pgrst.object+json");
  expect(ride.id).toBe("ride-id");
});
