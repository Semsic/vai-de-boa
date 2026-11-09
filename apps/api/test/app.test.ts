import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { StorageError } from "../src/repositories/supabase.js";
import { createTestDependencies } from "./support/fakes.js";

describe("API do Vai de Boa", () => {
  it("isola visitantes e permite experimentar os dois lados de uma corrida", async () => {
    const { app, profiles } = createTestDependencies();
    const a = request.agent(app);
    const b = request.agent(app);
    const origin = "http://localhost:5173";
    const startA = await a
      .post("/api/auth/demo")
      .set("Origin", origin)
      .send({});
    const startB = await b
      .post("/api/auth/demo")
      .set("Origin", origin)
      .send({});
    expect(startA.status).toBe(200);
    expect(startB.status).toBe(200);
    expect(startA.body.user.isDemo).toBe(true);
    expect(profiles).toHaveLength(0);
    let csrf = String(startA.headers["set-cookie"]).match(
      /csrf=([a-f0-9]+)/,
    )![1]!;
    const created = await a
      .post("/api/rides")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .send({ origin: "Rua Um", destination: "Rua Dois" });
    expect(created.status).toBe(201);
    expect((await b.get("/api/rides")).body.rides).toHaveLength(0);
    const switched = await a
      .post("/api/auth/demo/switch")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .send({ role: "driver" });
    expect(switched.status).toBe(200);
    csrf = String(switched.headers["set-cookie"]).match(
      /csrf=([a-f0-9]+)/,
    )![1]!;
    expect((await a.get("/api/rides")).body.rides).toHaveLength(1);
    for (const action of ["accept", "start", "complete"]) {
      const result = await a
        .patch(`/api/rides/${created.body.ride.id}/status`)
        .set("Origin", origin)
        .set("X-CSRF-Token", csrf)
        .send({ action });
      expect(result.status).toBe(200);
    }
    expect((await b.get("/api/rides")).body.rides).toHaveLength(0);
    const back = await a
      .post("/api/auth/demo/switch")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .send({ role: "rider" });
    expect(back.body.user.balanceCents).toBe(8200);
    expect((await a.get("/api/rides")).body.rides[0].status).toBe("completed");
  });
  it("limita a criação de sessões de demonstração", async () => {
    const { app, repo } = createTestDependencies();
    repo.consumeLimit = async () => false;
    expect(
      (
        await request(app)
          .post("/api/auth/demo")
          .set("Origin", "http://localhost:5173")
          .send({})
      ).status,
    ).toBe(429);
  });
  it("bloqueia cadastro se o limite for atingido ou o banco do limite falhar", async () => {
    const { app, repo, profiles } = createTestDependencies();
    const input = {
      name: "Ana Silva",
      email: "ana@example.com",
      password: "senha-segura-123",
      role: "rider",
    };
    repo.consumeLimit = async () => false;
    const limited = await request(app)
      .post("/api/auth/register")
      .set("Origin", "http://localhost:5173")
      .send(input);
    expect(limited.status).toBe(429);
    repo.consumeLimit = async () => {
      throw new StorageError("STORAGE_ERROR");
    };
    const unavailable = await request(app)
      .post("/api/auth/register")
      .set("Origin", "http://localhost:5173")
      .send(input);
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

  it("responde igualmente para cadastro novo e repetido e autentica sem expor hash", async () => {
    const { app, profiles } = createTestDependencies();
    const agent = request.agent(app);
    const data = {
      name: "Ana Silva",
      email: "ana@example.com",
      password: "senha-segura-123",
      role: "rider",
    };
    const first = await agent
      .post("/api/auth/register")
      .set("Origin", "http://localhost:5173")
      .send(data);
    const duplicate = await agent
      .post("/api/auth/register")
      .set("Origin", "http://localhost:5173")
      .send(data);
    expect(first.status).toBe(202);
    expect(duplicate.status).toBe(202);
    expect(duplicate.body).toEqual(first.body);
    expect(first.headers["set-cookie"]).toBeUndefined();
    expect(duplicate.headers["set-cookie"]).toBeUndefined();
    expect(profiles[0]?.password_hash).not.toBe(data.password);
    const login = await agent
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .send({ email: data.email, password: data.password });
    expect(login.status).toBe(200);
    expect(JSON.stringify(login.body)).not.toContain("password");
    expect(String(login.headers["set-cookie"])).toContain("HttpOnly");
    expect((await agent.get("/api/auth/me")).body.user.email).toBe(data.email);
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
    expect(registered.status).toBe(202);
    const login = await agent
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .send({ email: "ana@example.com", password: "senha-segura-123" });
    const token = String(login.headers["set-cookie"]).match(
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
