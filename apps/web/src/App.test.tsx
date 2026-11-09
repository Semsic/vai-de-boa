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
