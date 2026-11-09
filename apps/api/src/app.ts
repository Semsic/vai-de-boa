import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { StorageError } from "./repositories/supabase.js";
import type { Config, Profile, Repository } from "./types.js";

// Bcrypt só considera 72 bytes. Emoji também ocupa espaço, infelizmente sem desconto.
const password = z
  .string()
  .max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72);
const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    password: password.refine((value) => value.length >= 10),
    role: z.enum(["rider", "driver"]),
  })
  .strict();
const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: password.refine((value) => value.length >= 1),
  })
  .strict();
const rideSchema = z
  .object({
    origin: z.string().trim().min(3).max(120),
    destination: z.string().trim().min(3).max(120),
  })
  .strict();
const actionSchema = z
  .object({ action: z.enum(["accept", "start", "complete", "cancel"]) })
  .strict();
const publicProfile = ({ id, name, email, role, balance_cents }: Profile) => ({
  id,
  name,
  email,
  role,
  balanceCents: balance_cents,
});
class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const errors: Record<string, [number, string]> = {
  FORBIDDEN: [403, "Esta ação não está disponível para sua conta."],
  BALANCE_CAP: [409, "Você já tem o máximo de créditos fictícios."],
  INSUFFICIENT_DEMO_BALANCE: [
    409,
    "Adicione crédito fictício antes de solicitar a corrida.",
  ],
  ACTIVE_RIDE_EXISTS: [409, "Você já tem uma corrida em andamento."],
  INVALID_TRANSITION: [
    409,
    "A corrida mudou de estado. Atualize a tela e tente novamente.",
  ],
  NOT_FOUND: [404, "Corrida não encontrada."],
  DUPLICATE: [409, "Não foi possível criar a conta com estes dados."],
  STORAGE_ERROR: [503, "Serviço indisponível. Tente novamente em instantes."],
};
export function createApp(config: Config, repo: Repository) {
  const app = express();
  app.disable("x-powered-by");
  // O Render encerra o TLS no proxy. Confiar na internet inteira seria otimismo demais.
  if (config.secureCookie) app.set("trust proxy", 1);
  app.use(helmet());
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "8kb" }));
  app.use(cookieParser());
  const cookieOptions = {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 2 * 60 * 60 * 1000,
  };
  const key = new TextEncoder().encode(config.jwtSecret);
  const session = async (req: Request): Promise<Profile> => {
    try {
      const token = req.cookies?.session;
      if (typeof token !== "string") throw new Error("missing");
      const { payload } = await jwtVerify(token, key, {
        issuer: "vai-de-boa",
        audience: "vai-de-boa-web",
      });
      if (!payload.sub) throw new Error("missing subject");
      const profile = await repo.findById(payload.sub);
      if (!profile) throw new Error("missing profile");
      return profile;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new ApiError(
        401,
        "UNAUTHENTICATED",
        "Entre na sua conta para continuar.",
      );
    }
  };
  const rate = async (identity: string, limit: number, seconds: number) => {
    const hashed = crypto
      .createHmac("sha256", config.rateSecret)
      .update(identity)
      .digest("hex");
    if (!(await repo.consumeLimit(hashed, limit, seconds)))
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Muitas tentativas. Aguarde um pouco e tente novamente.",
      );
  };
  const issue = async (res: Response, profile: Profile) => {
    const token = await new SignJWT({ role: profile.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(profile.id)
      .setIssuer("vai-de-boa")
      .setAudience("vai-de-boa-web")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(key);
    res.cookie("session", token, cookieOptions);
    const csrf = crypto.randomBytes(24).toString("hex");
    res.cookie("csrf", csrf, { ...cookieOptions, httpOnly: false });
  };
  app.use("/api", (req, _res, next) => {
    if (!config.secureCookie || req.path === "/health") return next();
    const received = Buffer.from(req.get("x-vdb-proxy-secret") ?? "");
    const expected = Buffer.from(config.proxySecret ?? "");
    if (
      expected.length < 32 ||
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    )
      return next(new ApiError(403, "PROXY_REQUIRED", "Acesso indisponível."));
    next();
  });
  // Só aceitamos o IP informado pela função que conhece o segredo entre servidores.
  const clientIp = (req: Request) =>
    config.secureCookie
      ? (req.get("x-vdb-client-ip") ?? "unknown")
      : (req.ip ?? "unknown");
  app.use("/api", (req, _res, next) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      if (req.get("origin") !== config.origin)
        return next(
          new ApiError(403, "ORIGIN_NOT_ALLOWED", "Origem não autorizada."),
        );
      if (
        req.cookies?.session &&
        (typeof req.cookies.csrf !== "string" ||
          req.get("x-csrf-token") !== req.cookies.csrf)
      )
        return next(
          new ApiError(
            403,
            "CSRF_INVALID",
            "Atualize a página e tente novamente.",
          ),
        );
    }
    next();
  });
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.post("/api/auth/register", async (req, res) => {
    const input = registerSchema.parse(req.body);
    await rate(`register:ip:${clientIp(req)}`, 8, 3600);
    await rate(`register:email:${input.email}`, 4, 3600);
    const hash = await bcrypt.hash(input.password, 12);
    try {
      await repo.createProfile({ ...input, passwordHash: hash });
    } catch (error) {
      if (!(error instanceof StorageError) || error.code !== "DUPLICATE")
        throw error;
    }
    // Mesma resposta para e-mail novo ou já usado: curiosidade tem limite.
    res
      .status(202)
      .json({ message: "Confira seus dados e entre com seu e-mail e senha." });
  });
  app.post("/api/auth/login", async (req, res) => {
    const input = loginSchema.parse(req.body);
    await rate(`login:ip:${clientIp(req)}`, 30, 900);
    await rate(`login:email:${input.email}`, 8, 900);
    const profile = await repo.findByEmail(input.email);
    const valid = await bcrypt.compare(
      input.password,
      profile?.password_hash ??
        "$2b$12$sHsMZzRfJhVVrIo4K2ONEOGrw2f2mjSOb0uYGpC1CXmMoxwVq324i",
    );
    if (!profile || !valid)
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "E-mail ou senha inválidos.",
      );
    await issue(res, profile);
    res.json({ user: publicProfile(profile) });
  });
  app.get("/api/auth/session", async (req, res) => {
    if (!req.cookies?.session) return res.json({ user: null });
    try {
      return res.json({ user: publicProfile(await session(req)) });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const clearOptions = {
        secure: config.secureCookie,
        sameSite: "lax" as const,
        path: "/",
      };
      res.clearCookie("session", { ...clearOptions, httpOnly: true });
      res.clearCookie("csrf", clearOptions);
      return res.json({ user: null });
    }
  });
  app.get(["/api/auth/me", "/api/me"], async (req, res) => {
    res.json({ user: publicProfile(await session(req)) });
  });
  app.post("/api/auth/logout", async (req, res) => {
    await session(req);
    const clearOptions = {
      httpOnly: true,
      secure: config.secureCookie,
      sameSite: "lax" as const,
      path: "/",
    };
    res.clearCookie("session", clearOptions);
    res.clearCookie("csrf", { ...clearOptions, httpOnly: false });
    res.status(204).end();
  });
  app.get("/api/rides", async (req, res) => {
    const user = await session(req);
    res.json({ rides: await repo.listRides(user.id, user.role) });
  });
  app.get("/api/rides/:id", async (req, res) => {
    const user = await session(req);
    const id = z.uuid().parse(req.params.id);
    const ride = (await repo.listRides(user.id, user.role)).find(
      (item) =>
        item.id === id &&
        (item.rider_id === user.id || item.driver_id === user.id),
    );
    if (!ride) throw new ApiError(404, "NOT_FOUND", "Corrida não encontrada.");
    res.json({ ride });
  });
  app.post("/api/wallet/demo-credit", async (req, res) => {
    const user = await session(req);
    if (user.role !== "rider")
      throw new ApiError(403, "FORBIDDEN", errors.FORBIDDEN![1]);
    await rate(`credit:user:${user.id}`, 10, 3600);
    await rate(`credit:ip:${clientIp(req)}`, 30, 3600);
    res.json({ balanceCents: await repo.credit(user.id) });
  });
  app.post("/api/rides", async (req, res) => {
    const user = await session(req);
    if (user.role !== "rider")
      throw new ApiError(403, "FORBIDDEN", errors.FORBIDDEN![1]);
    const input = rideSchema.parse(req.body);
    await rate(`ride:user:${user.id}`, 20, 3600);
    await rate(`ride:ip:${clientIp(req)}`, 80, 3600);
    res.status(201).json({
      ride: await repo.createRide(user.id, input.origin, input.destination),
    });
  });
  app.patch("/api/rides/:id/status", async (req, res) => {
    const user = await session(req);
    const id = z.uuid().parse(req.params.id);
    const { action } = actionSchema.parse(req.body);
    await rate(`transition:user:${user.id}`, 60, 3600);
    await rate(`transition:ip:${clientIp(req)}`, 150, 3600);
    res.json({ ride: await repo.transition(user.id, id, action) });
  });
  app.use((_req, _res, next) =>
    next(new ApiError(404, "NOT_FOUND", "Caminho não encontrado.")),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      void _next;
      if (error instanceof z.ZodError)
        return res.status(400).json({
          error: {
            code: "INVALID_INPUT",
            message: "Confira os dados e tente novamente.",
          },
        });
      if (error instanceof ApiError)
        return res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message } });
      if (error instanceof StorageError) {
        const [status, message] = errors[error.code] ?? errors.STORAGE_ERROR!;
        return res
          .status(status)
          .json({ error: { code: error.code, message } });
      }
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        (error.status === 400 || error.status === 413)
      )
        return res.status(error.status).json({
          error: {
            code: "INVALID_INPUT",
            message: "Não foi possível ler os dados enviados.",
          },
        });
      console.error("Erro inesperado na API");
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Não foi possível concluir a operação.",
        },
      });
    },
  );
  return app;
}
