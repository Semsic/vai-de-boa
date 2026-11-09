import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app.js";
import { StorageError } from "../../src/repositories/supabase.js";
import type { Profile, Repository, Ride } from "../../src/types.js";

export function createTestDependencies() {
  const profiles: Profile[] = [];
  const rides: Ride[] = [];
  const repo: Repository = {
    async consumeLimit() {
      return true;
    },
    async findByEmail(email) {
      return profiles.find((p) => p.email === email) ?? null;
    },
    async findById(id) {
      return profiles.find((p) => p.id === id) ?? null;
    },
    async createProfile(input) {
      if (profiles.some((p) => p.email === input.email))
        throw new StorageError("DUPLICATE");
      const profile: Profile = {
        id: randomUUID(),
        name: input.name,
        email: input.email,
        password_hash: input.passwordHash,
        role: input.role,
        balance_cents: 10000,
      };
      profiles.push(profile);
      return profile;
    },
    async credit(id) {
      const profile = profiles.find((p) => p.id === id)!;
      profile.balance_cents += 5000;
      return profile.balance_cents;
    },
    async createRide(id, origin, destination) {
      const profile = profiles.find((p) => p.id === id)!;
      if (profile.balance_cents < 1800)
        throw new StorageError("INSUFFICIENT_DEMO_BALANCE");
      profile.balance_cents -= 1800;
      const ride: Ride = {
        id: randomUUID(),
        rider_id: id,
        driver_id: null,
        origin,
        destination,
        fare_cents: 1800,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      rides.push(ride);
      return ride;
    },
    async listRides(id, role) {
      return rides.filter((ride) =>
        role === "rider"
          ? ride.rider_id === id
          : ride.status === "pending" || ride.driver_id === id,
      );
    },
    async transition(id, rideId, action) {
      const ride = rides.find((r) => r.id === rideId);
      if (!ride) throw new StorageError("NOT_FOUND");
      if (action === "accept" && ride.status === "pending") {
        ride.status = "accepted";
        ride.driver_id = id;
      } else throw new StorageError("INVALID_TRANSITION");
      return ride;
    },
  };
  const app = createApp(
    {
      origin: "http://localhost:5173",
      jwtSecret: "jwt-test-secret-longer-than-32-characters",
      rateSecret: "rate-test-secret-longer-than-32-characters",
      secureCookie: false,
    },
    repo,
  );
  return { app, repo, profiles, rides };
}
