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
});
