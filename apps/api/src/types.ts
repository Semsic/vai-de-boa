export type Role = "rider" | "driver";
export type RideStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";
export interface Profile {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  balance_cents: number;
}
export interface Ride {
  id: string;
  rider_id: string;
  driver_id: string | null;
  origin: string;
  destination: string;
  fare_cents: number;
  status: RideStatus;
  created_at: string;
  updated_at: string;
}
export interface Repository {
  consumeLimit(key: string, limit: number, seconds: number): Promise<boolean>;
  findByEmail(email: string): Promise<Profile | null>;
  findById(id: string): Promise<Profile | null>;
  createProfile(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: Role;
  }): Promise<Profile>;
  credit(userId: string): Promise<number>;
  createRide(
    userId: string,
    origin: string,
    destination: string,
  ): Promise<Ride>;
  listRides(userId: string, role: Role): Promise<Ride[]>;
  transition(userId: string, rideId: string, action: string): Promise<Ride>;
}
export interface Config {
  origin: string;
  jwtSecret: string;
  rateSecret: string;
  secureCookie: boolean;
  proxySecret?: string;
}
