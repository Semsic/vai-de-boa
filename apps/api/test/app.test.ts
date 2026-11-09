import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { StorageError } from "../src/repositories/supabase.js";
import { createTestDependencies } from "./support/fakes.js";

describe("API do Vai de Boa", () => {
  it("bloqueia cadastro se o limite for atingido ou o banco do limite falhar", async () => {
    const { app, repo, profiles } = createTestDependencies();
    const input = { name: "Ana Silva", email: "ana@example.com", password: "senha-segura-123", role: "rider" };
    repo.consumeLimit = async () => false;
    const limited = await request(app).post("/api/auth/register").set("Origin", "http://localhost:5173").send(input);
    expect(limited.status).toBe(429);
    repo.consumeLimit = async () => { throw new StorageError("STORAGE_ERROR"); };
    const unavailable = await request(app).post("/api/auth/register").set("Origin", "http://localhost:5173").send(input);
    expect(unavailable.status).toBe(503);
    expect(profiles).toHaveLength(0);
  });
  it("informa uma sessão vazia sem tratar visitante como erro", async () => {
    const { app } = createTestDependencies();
    const response = await request(app).get("/api/auth/session");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: null });
  });

  it("exige o segredo de servidor para usar a API em produção", async () => {
    const { repo } = createTestDependencies();
    const app = createApp(
      {
        origin: "https://example.netlify.app",
        jwtSecret: "a".repeat(32),
        rateSecret: "b".repeat(32),
        secureCookie: true,
        proxySecret: "c".repeat(32),
      },
      repo,
    );
    expect((await request(app).get("/api/auth/session")).status).toBe(403);
    expect(
      (
        await request(app)
          .get("/api/auth/session")
          .set("x-vdb-proxy-secret", "c".repeat(32))
      ).status,
    ).toBe(200);
  });
  it("expõe saúde sem revelar configuração", async () => {
    const { app } = createTestDependencies();
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });

  it("recusa mutação com origem diferente da configurada", async () => {
    const { app } = createTestDependencies();
    const response = await request(app)
      .post("/api/auth/register")
      .set("Origin", "https://site-aleatorio.example")
      .send({
        name: "Ana Silva",
        email: "ana@example.com",
        password: "senha-segura-123",
        role: "rider",
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("registra e autentica usuário sem retornar hash de senha", async () => {
    const { app } = createTestDependencies();
    const agent = request.agent(app);
    const registered = await agent
      .post("/api/auth/register")
      .set("Origin", "http://localhost:5173")
      .send({
        name: "Ana Silva",
        email: "ana@example.com",
        password: "senha-segura-123",
        role: "rider",
      });

    expect(registered.status).toBe(201);
    expect(registered.body.user).toMatchObject({
      name: "Ana Silva",
      role: "rider",
    });
    expect(JSON.stringify(registered.body)).not.toContain("password");
    expect(String(registered.headers["set-cookie"])).toContain("HttpOnly");

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("ana@example.com");
  });
  it("exige CSRF e não aceita tarifa escolhida pelo navegador", async () => {
    const { app } = createTestDependencies();
    const agent = request.agent(app);
    const registered = await agent
      .post("/api/auth/register")
      .set("Origin", "http://localhost:5173")
      .send({
        name: "Ana Silva",
        email: "ana@example.com",
        password: "senha-segura-123",
        role: "rider",
      });
    const token = String(registered.headers["set-cookie"]).match(
      /csrf=([a-f0-9]+)/,
    )?.[1];
    expect(token).toBeTruthy();
    const missing = await agent
      .post("/api/rides")
      .set("Origin", "http://localhost:5173")
      .send({ origin: "Rua A, 1", destination: "Rua B, 2" });
    expect(missing.status).toBe(403);
    const tampered = await agent
      .post("/api/rides")
      .set("Origin", "http://localhost:5173")
      .set("X-CSRF-Token", token!)
      .send({ origin: "Rua A, 1", destination: "Rua B, 2", fare_cents: 1 });
    expect(tampered.status).toBe(400);
    const correct = await agent
      .post("/api/rides")
      .set("Origin", "http://localhost:5173")
      .set("X-CSRF-Token", token!)
      .send({ origin: "Rua A, 1", destination: "Rua B, 2" });
    expect(correct.status).toBe(201);
    expect(correct.body.ride.fare_cents).toBe(1800);
  });
});
