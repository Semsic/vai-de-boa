import { randomUUID } from "node:crypto";
import { StorageError } from "../repositories/supabase.js";
import type { Profile, Repository, Ride, Role } from "../types.js";

type DemoRepo = Pick<
  Repository,
  "credit" | "createRide" | "listRides" | "transition"
>;
type Demo = { expires: number; rider: Profile; driver: Profile; rides: Ride[] };

export class DemoStore {
  private sessions = new Map<string, Demo>();
  create(): string | null {
    for (const [id, demo] of this.sessions)
      if (demo.expires <= Date.now()) this.sessions.delete(id);
    if (this.sessions.size >= 500) return null;
    const profile = (role: Role): Profile => ({
      id: randomUUID(),
      name: role === "rider" ? "Visitante" : "Motorista de teste",
      email: "",
      password_hash: "",
      role,
      balance_cents: 10000,
    });
    const id = randomUUID();
    this.sessions.set(id, {
      expires: Date.now() + 2 * 60 * 60 * 1000,
      rider: profile("rider"),
      driver: profile("driver"),
      rides: [],
    });
    return id;
  }
  private get(id: string): Demo | null {
    const demo = this.sessions.get(id);
    if (demo && demo.expires <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    return demo ?? null;
  }
  profile(id: string, role: Role): Profile | null {
    return this.get(id)?.[role] ?? null;
  }
  remove(id: string) {
    this.sessions.delete(id);
  }
  repository(id: string): DemoRepo {
    const get = () => {
      const demo = this.get(id);
      if (!demo) throw new StorageError("FORBIDDEN");
      return demo;
    };
    return {
      async credit(userId) {
        const d = get();
        if (d.rider.id !== userId) throw new StorageError("FORBIDDEN");
        const reserved = d.rides
          .filter((r) => r.status === "pending" || r.status === "accepted")
          .reduce((n, r) => n + r.fare_cents, 0);
        const added = Math.min(5000, 50000 - d.rider.balance_cents - reserved);
        if (added <= 0) throw new StorageError("BALANCE_CAP");
        return (d.rider.balance_cents += added);
      },
      async createRide(userId, origin, destination) {
        const d = get();
        if (d.rider.id !== userId) throw new StorageError("FORBIDDEN");
        if (d.rider.balance_cents < 1800)
          throw new StorageError("INSUFFICIENT_DEMO_BALANCE");
        if (
          d.rides.some((r) =>
            ["pending", "accepted", "in_progress"].includes(r.status),
          )
        )
          throw new StorageError("ACTIVE_RIDE_EXISTS");
        const now = new Date().toISOString();
        const ride: Ride = {
          id: randomUUID(),
          rider_id: userId,
          driver_id: null,
          origin,
          destination,
          fare_cents: 1800,
          status: "pending",
          created_at: now,
          updated_at: now,
        };
        d.rider.balance_cents -= 1800;
        d.rides.unshift(ride);
        // A memória tem limite: a viagem pode ser longa, o histórico nem tanto.
        if (d.rides.length > 50) d.rides.pop();
        return ride;
      },
      async listRides(userId, role) {
        const d = get();
        if (d[role].id !== userId) throw new StorageError("FORBIDDEN");
        return d.rides.filter((r) =>
          role === "rider"
            ? r.rider_id === userId
            : r.status === "pending" || r.driver_id === userId,
        );
      },
      async transition(userId, rideId, action) {
        const d = get();
        const ride = d.rides.find((r) => r.id === rideId);
        if (!ride) throw new StorageError("NOT_FOUND");
        if (
          action === "accept" &&
          userId === d.driver.id &&
          ride.status === "pending"
        ) {
          ride.driver_id = userId;
          ride.status = "accepted";
        } else if (
          action === "start" &&
          ride.driver_id === userId &&
          ride.status === "accepted"
        )
          ride.status = "in_progress";
        else if (
          action === "complete" &&
          ride.driver_id === userId &&
          ride.status === "in_progress"
        )
          ride.status = "completed";
        else if (
          action === "cancel" &&
          ride.rider_id === userId &&
          ["pending", "accepted"].includes(ride.status)
        ) {
          ride.status = "cancelled";
          d.rider.balance_cents += ride.fare_cents;
        } else throw new StorageError("INVALID_TRANSITION");
        ride.updated_at = new Date().toISOString();
        return ride;
      },
    };
  }
}
