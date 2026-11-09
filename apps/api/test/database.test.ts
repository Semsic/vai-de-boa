import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Um Postgres de bolso para pegar erro de SQL antes de incomodar o Supabase de verdade.
describe("migração e transações demonstrativas", () => {
  const db = new PGlite();
  let rider: string;
  let driver: string;
  beforeAll(async () => {
    await db.exec(
      "create role anon; create role authenticated; create role service_role;",
    );
    await db.exec(
      await readFile(
        new URL("../../../supabase/migrations/001_demo.sql", import.meta.url),
        "utf8",
      ),
    );
    const one = await db.query<{ id: string }>(
      "select id from create_demo_profile('Ana Silva','ana@example.com','hash','rider')",
    );
    const two = await db.query<{ id: string }>(
      "select id from create_demo_profile('Beto Silva','beto@example.com','hash','driver')",
    );
    rider = one.rows[0]!.id;
    driver = two.rows[0]!.id;
  }, 30000);
  afterAll(async () => db.close());
  it("fecha o acesso direto às tabelas para visitantes", async () => {
    const result = await db.query<{ allowed: boolean }>(
      "select has_table_privilege('anon', 'public.profiles', 'select') as allowed",
    );
    expect(result.rows[0]?.allowed).toBe(false);
  });
  it("debita uma vez e devolve apenas uma vez ao cancelar", async () => {
    const created = await db.query<{ id: string }>(
      "select id from create_demo_ride($1,$2,$3)",
      [rider, "Rua da partida", "Rua do destino"],
    );
    const rideId = created.rows[0]!.id;
    const balance = async () =>
      (
        await db.query<{ balance_cents: number }>(
          "select balance_cents from profiles where id=$1",
          [rider],
        )
      ).rows[0]!.balance_cents;
    expect(await balance()).toBe(8200);
    await db.query("select * from transition_demo_ride($1,$2,$3)", [
      driver,
      rideId,
      "accept",
    ]);
    await expect(
      db.query("select * from transition_demo_ride($1,$2,$3)", [
        driver,
        rideId,
        "accept",
      ]),
    ).rejects.toThrow("INVALID_TRANSITION");
    await db.query("select * from transition_demo_ride($1,$2,$3)", [
      rider,
      rideId,
      "cancel",
    ]);
    expect(await balance()).toBe(10000);
    await expect(
      db.query("select * from transition_demo_ride($1,$2,$3)", [
        rider,
        rideId,
        "cancel",
      ]),
    ).rejects.toThrow("INVALID_TRANSITION");
    expect(await balance()).toBe(10000);
  });
  it("guarda espaço no teto para devolver uma reserva", async () => {
    const created = await db.query<{ id: string }>(
      "select id from create_demo_ride($1,$2,$3)",
      [rider, "Rua da partida", "Rua do destino"],
    );
    for (let i = 0; i < 8; i++)
      await db.query("select credit_demo_wallet($1)", [rider]);
    await expect(
      db.query("select credit_demo_wallet($1)", [rider]),
    ).rejects.toThrow("BALANCE_CAP");
    await db.query("select * from transition_demo_ride($1,$2,$3)", [
      rider,
      created.rows[0]!.id,
      "cancel",
    ]);
    const result = await db.query<{ balance_cents: number }>(
      "select balance_cents from profiles where id=$1",
      [rider],
    );
    expect(result.rows[0]?.balance_cents).toBe(50000);
  });
});
