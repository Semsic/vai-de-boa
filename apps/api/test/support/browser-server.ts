// Servidor descartável para testar a interface sem usar as contas de ninguém.
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../../src/app.js";
import { StorageError } from "../../src/repositories/supabase.js";
import type { Profile, Repository, Ride } from "../../src/types.js";
const db = new PGlite();
await db.exec(
  "create role anon; create role authenticated; create role service_role;",
);
await db.exec(
  await readFile(
    new URL("../../../../supabase/migrations/001_demo.sql", import.meta.url),
    "utf8",
  ),
);
async function query<T extends { [key: string]: unknown }>(
  sql: string,
  values: unknown[] = [],
) {
  try {
    return (await db.query<T>(sql, values)).rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = [
      "FORBIDDEN",
      "BALANCE_CAP",
      "INSUFFICIENT_DEMO_BALANCE",
      "ACTIVE_RIDE_EXISTS",
      "INVALID_TRANSITION",
      "NOT_FOUND",
    ];
    throw new StorageError(
      known.find((code) => message.includes(code)) ??
        (message.includes("duplicate key") ? "DUPLICATE" : "STORAGE_ERROR"),
    );
  }
}
const repo: Repository = {
  async consumeLimit(key, limit, seconds) {
    return (
      await query<{ allowed: boolean }>(
        "select consume_rate_limit($1,$2,$3) as allowed",
        [key, limit, seconds],
      )
    )[0]!.allowed;
  },
  async findByEmail(email) {
    return (
      (
        await query<Profile & Record<string, unknown>>(
          "select * from profiles where email=$1",
          [email],
        )
      )[0] ?? null
    );
  },
  async findById(id) {
    return (
      (
        await query<Profile & Record<string, unknown>>(
          "select * from profiles where id=$1",
          [id],
        )
      )[0] ?? null
    );
  },
  async createProfile(input) {
    return (
      await query<Profile & Record<string, unknown>>(
        "select * from create_demo_profile($1,$2,$3,$4)",
        [input.name, input.email, input.passwordHash, input.role],
      )
    )[0]!;
  },
  async credit(id) {
    return (
      await query<{ balance: number }>(
        "select credit_demo_wallet($1) as balance",
        [id],
      )
    )[0]!.balance;
  },
  async createRide(id, origin, destination) {
    return (
      await query<Ride & Record<string, unknown>>(
        "select * from create_demo_ride($1,$2,$3)",
        [id, origin, destination],
      )
    )[0]!;
  },
  async listRides(id, role) {
    return query<Ride & Record<string, unknown>>(
      role === "rider"
        ? "select * from rides where rider_id=$1 order by created_at desc limit 50"
        : "select * from rides where status='pending' or driver_id=$1 order by created_at desc limit 50",
      [id],
    );
  },
  async transition(userId, rideId, action) {
    return (
      await query<Ride & Record<string, unknown>>(
        "select * from transition_demo_ride($1,$2,$3)",
        [userId, rideId, action],
      )
    )[0]!;
  },
};
createApp(
  {
    origin: "http://localhost:5173",
    jwtSecret: "chave-de-teste-com-mais-de-32-caracteres",
    rateSecret: "limite-de-teste-com-mais-de-32-caracteres",
    secureCookie: false,
  },
  repo,
).listen(4000, "127.0.0.1", () =>
  console.log("API de teste disponível na porta 4000"),
);
