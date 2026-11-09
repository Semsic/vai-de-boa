import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Repository, Ride, Role } from "../types.js";

export class StorageError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
function handle(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const known = [
    "FORBIDDEN",
    "BALANCE_CAP",
    "INSUFFICIENT_DEMO_BALANCE",
    "ACTIVE_RIDE_EXISTS",
    "INVALID_TRANSITION",
    "NOT_FOUND",
  ];
  const code =
    known.find((item) => error.message.includes(item)) ??
    (error.code === "23505" ? "DUPLICATE" : "STORAGE_ERROR");
  throw new StorageError(code);
}
export function supabaseRepository(url: string, secret: string): Repository {
  const db: SupabaseClient = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async consumeLimit(key, limit, seconds) {
      const { data, error } = await db.rpc("consume_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_seconds: seconds,
      });
      handle(error);
      return data === true;
    },
    async findByEmail(email) {
      const { data, error } = await db
        .from("profiles")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      handle(error);
      return data as Profile | null;
    },
    async findById(id) {
      const { data, error } = await db
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      handle(error);
      return data as Profile | null;
    },
    async createProfile(input) {
      const { data, error } = await db
        .rpc("create_demo_profile", {
          p_name: input.name,
          p_email: input.email,
          p_hash: input.passwordHash,
          p_role: input.role,
        })
        .single();
      handle(error);
      return data as Profile;
    },
    async credit(userId) {
      const { data, error } = await db.rpc("credit_demo_wallet", {
        p_user: userId,
      });
      handle(error);
      return data as number;
    },
    async createRide(userId, origin, destination) {
      const { data, error } = await db
        .rpc("create_demo_ride", {
          p_user: userId,
          p_origin: origin,
          p_destination: destination,
        })
        .single();
      handle(error);
      return data as Ride;
    },
    async listRides(userId: string, role: Role) {
      if (role === "rider") {
        const { data, error } = await db
          .from("rides")
          .select("*")
          .eq("rider_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        handle(error);
        return data as Ride[];
      }
      // A fila não pode empurrar a corrida do motorista para fora da tela.
      const [own, queue] = await Promise.all([
        db
          .from("rides")
          .select("*")
          .eq("driver_id", userId)
          .order("created_at", { ascending: false })
          .limit(25),
        db
          .from("rides")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      handle(own.error);
      handle(queue.error);
      return [...(own.data as Ride[]), ...(queue.data as Ride[])];
    },
    async transition(userId, rideId, action) {
      const { data, error } = await db
        .rpc("transition_demo_ride", {
          p_user: userId,
          p_ride: rideId,
          p_action: action,
        })
        .single();
      handle(error);
      return data as Ride;
    },
  };
}
