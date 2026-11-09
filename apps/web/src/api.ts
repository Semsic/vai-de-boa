export interface User {
  id: string;
  name: string;
  email: string;
  role: "rider" | "driver";
  balanceCents: number;
  isDemo: boolean;
}
export interface Ride {
  id: string;
  rider_id: string;
  driver_id: string | null;
  origin: string;
  destination: string;
  fare_cents: number;
  status: "pending" | "accepted" | "in_progress" | "completed" | "cancelled";
  created_at: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function csrf() {
  return (
    document.cookie
      .split("; ")
      .find((part) => part.startsWith("csrf="))
      ?.slice(5) ?? ""
  );
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      signal: options.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.method
          ? { "X-CSRF-Token": decodeURIComponent(csrf()) }
          : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      0,
      "Não foi possível conectar. Tente novamente em instantes.",
    );
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new ApiError(
      response.status,
      data?.error?.message ?? "Não foi possível conectar. Tente novamente.",
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value / 100,
  );
