import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("tela inicial", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
  });
  it("abre a demonstração e troca de perfil sem cadastro", async () => {
    const rider = {
      id: "rider",
      name: "Visitante",
      role: "rider",
      balanceCents: 10000,
      isDemo: true,
    };
    const driver = {
      ...rider,
      id: "driver",
      name: "Motorista de teste",
      role: "driver",
    };
    let current = rider;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/auth/demo/switch")) current = driver;
        const body = url.endsWith("/auth/session")
          ? { user: null }
          : url.endsWith("/rides")
            ? { rides: [] }
            : { user: current };
        return { ok: true, status: 200, json: async () => body };
      }),
    );
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: /experimentar sem cadastro/i }),
    );
    expect(await screen.findByText(/sessão de visitante/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /trocar para motorista/i }),
    );
    expect(await screen.findByText("ÁREA DO MOTORISTA")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /trocar para passageiro/i }),
    ).toBeInTheDocument();
  });
  it("explica a demonstração e abre o cadastro", async () => {
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Vai de Boa" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/saldo e tarifas são fictícios/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));
    expect(screen.getByLabelText("Seu nome")).toBeInTheDocument();
    expect(screen.getByText("Motorista")).toBeInTheDocument();
  });
  it("após cadastro orienta a pessoa a entrar na conta", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ user: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 202,
          json: async () => ({
            message: "Confira seus dados e entre com seu e-mail e senha.",
          }),
        }),
    );
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: /criar conta/i }),
    );
    fireEvent.change(screen.getByLabelText("Seu nome"), {
      target: { value: "Ana Teste" },
    });
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ana@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "senha-segura-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(
      await screen.findByRole("heading", { name: "Entre na sua conta" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Confira seus dados");
  });
});
