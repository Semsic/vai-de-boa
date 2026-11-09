import { z } from "zod";
const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  APP_ORIGIN: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  RATE_LIMIT_SECRET: z.string().min(32),
  PROXY_SECRET: z.string().min(32).optional(),
});
export function readEnv(input: NodeJS.ProcessEnv) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Configuração inválida: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  const value = result.data;
  if (value.NODE_ENV === "production" && !value.PROXY_SECRET)
    throw new Error("Configuração inválida: PROXY_SECRET");
  if (new URL(value.APP_ORIGIN).origin !== value.APP_ORIGIN)
    throw new Error(
      "APP_ORIGIN deve conter apenas a origem, sem caminho ou barra final",
    );
  return value;
}
