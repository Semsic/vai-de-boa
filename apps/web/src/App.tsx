import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CarFront,
  CircleHelp,
  LogOut,
  MapPin,
  Navigation,
  Plus,
  Route,
  ShieldCheck,
} from "lucide-react";
import { api, ApiError, money, type Ride, type User } from "./api";
import { MovingBorder } from "./components/MovingBorder";
import "./styles.css";

type Screen = "home" | "login" | "register";
const labels: Record<Ride["status"], string> = {
  pending: "Procurando motorista",
  accepted: "Motorista a caminho",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};
const active = (ride: Ride) =>
  ["pending", "accepted", "in_progress"].includes(ride.status);

function MapSketch() {
  return (
    <div
      className="map"
      aria-label="Mapa ilustrativo, sem localização real"
      role="img"
    >
      <div className="map-street street-one" />
      <div className="map-street street-two" />
      <div className="map-street street-three" />
      <div className="map-block block-one" />
      <div className="map-block block-two" />
      <div className="map-block block-three" />
      <span className="map-label label-one">CENTRO</span>
      <span className="map-label label-two">VILA NOVA</span>
      <svg
        className="map-route"
        viewBox="0 0 500 400"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M90 300 C155 285 140 210 215 210 S285 270 330 190 S385 95 430 105"
          fill="none"
          stroke="#f7f8ef"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          className="route-line"
          d="M90 300 C155 285 140 210 215 210 S285 270 330 190 S385 95 430 105"
          fill="none"
          stroke="#1d604c"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="650"
        />
        <circle
          cx="90"
          cy="300"
          r="9"
          fill="#1d604c"
          stroke="white"
          strokeWidth="4"
        />
        <circle
          cx="430"
          cy="105"
          r="10"
          fill="#e17a52"
          stroke="white"
          strokeWidth="4"
        />
      </svg>
      <span className="map-note">
        <Navigation size={13} /> Mapa ilustrativo
      </span>
    </div>
  );
}
function Brand() {
  return (
    <a className="brand" href="/" aria-label="Vai de Boa, início">
      <span className="brand-icon">
        <Route size={19} />
      </span>
      <span>
        vai de boa<span className="brand-dot">.</span>
      </span>
    </a>
  );
}
function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [rides, setRides] = useState<Ride[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"rider" | "driver">("rider");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const refresh = useCallback(async () => {
    const [profile, list] = await Promise.all([
      api<{ user: User }>("/auth/me"),
      api<{ rides: Ride[] }>("/rides"),
    ]);
    setUser(profile.user);
    setRides(list.rides);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<{ user: User | null }>("/auth/session", { signal: controller.signal })
      .then(({ user: current }) => setUser(current))
      .catch((err: unknown) => {
        if (
          !(err instanceof ApiError && err.status === 401) &&
          !(err instanceof DOMException && err.name === "AbortError")
        )
          setError(
            "A API está indisponível no momento. Tente novamente mais tarde.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSession(false);
      });
    return () => controller.abort();
  }, []);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    // A corrida muda do outro lado; a consulta para assim que a pessoa sai da tela.
    const update = async () => {
      try {
        const [profile, list] = await Promise.all([
          api<{ user: User }>("/auth/me"),
          api<{ rides: Ride[] }>("/rides"),
        ]);
        if (!stopped) {
          setUser(profile.user);
          setRides(list.rides);
        }
      } catch (err) {
        if (!stopped && err instanceof ApiError && err.status === 401) {
          setUser(null);
          setRides([]);
          setScreen("login");
          setError("Sua sessão expirou. Entre novamente.");
        } else if (!stopped)
          setError("Não foi possível atualizar as corridas.");
      }
    };
    void update();
    const timer = window.setInterval(() => void update(), 12000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [userId]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  function startDemo() {
    void run(async () => {
      const { user: visitor } = await api<{ user: User }>("/auth/demo", {
        method: "POST",
        body: {},
      });
      setRides([]);
      setUser(visitor);
    });
  }
  function switchDemoRole() {
    if (!user) return;
    void run(async () => {
      const { user: visitor } = await api<{ user: User }>("/auth/demo/switch", {
        method: "POST",
        body: { role: user.role === "rider" ? "driver" : "rider" },
      });
      setRides([]);
      setUser(visitor);
    });
  }
  function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      if (screen === "register") {
        const { message } = await api<{ message: string }>("/auth/register", {
          method: "POST",
          body: { name, email, password, role },
        });
        setPassword("");
        setScreen("login");
        setNotice(message);
      } else {
        const { user: current } = await api<{ user: User }>("/auth/login", {
          method: "POST",
          body: { email, password },
        });
        setPassword("");
        setUser(current);
      }
    });
  }
  function requestRide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      await api("/rides", { method: "POST", body: { origin, destination } });
      setOrigin("");
      setDestination("");
      await refresh();
    });
  }
  function transition(
    ride: Ride,
    action: "accept" | "start" | "complete" | "cancel",
  ) {
    if (
      action === "cancel" &&
      !window.confirm("Cancelar esta corrida demonstrativa?")
    )
      return;
    void run(async () => {
      await api(`/rides/${ride.id}/status`, {
        method: "PATCH",
        body: { action },
      });
      await refresh();
    });
  }
  const currentRide = rides.find((ride) =>
    user?.role === "rider"
      ? active(ride)
      : ride.driver_id === user?.id && active(ride),
  );
  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <div className="top-actions">
          <span className="demo-pill">
            <span /> Projeto demonstrativo
          </span>
          {user ? (
            <button
              className="text-button"
              onClick={() =>
                void run(async () => {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                  setRides([]);
                  setScreen("home");
                })
              }
              disabled={busy}
            >
              <LogOut size={16} /> Sair
            </button>
          ) : (
            <button
              className="text-button"
              onClick={() => {
                setError("");
                setScreen(screen === "login" ? "home" : "login");
              }}
            >
              {screen === "login" ? "Voltar" : "Entrar"}{" "}
              <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </header>
      {error && (
        <div className="alert" role="alert">
          {error}
          <button aria-label="Dispensar aviso" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {notice && !user && screen === "login" && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {loadingSession ? (
        <main className="loading" aria-live="polite">
          Preparando sua viagem…
        </main>
      ) : !user && screen === "home" ? (
        <main className="landing">
          <section className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" /> UM APP DE CORRIDAS PARA EXPLORAR
            </div>
            <h1>Vai de Boa</h1>
            <p className="hero-subtitle">
              Um jeito simples de sair do ponto A e chegar no B.
            </p>
            <p className="hero-description">
              Peça uma corrida ou entre como motorista e acompanhe cada etapa.
              Tudo aqui é uma demonstração feita para explorar o funcionamento
              do app.
            </p>
            <button
              className="primary hero-cta"
              onClick={startDemo}
              disabled={busy}
            >
              <MovingBorder />
              <span>
                {busy ? "Preparando…" : "Experimentar sem cadastro"}{" "}
                <ArrowRight size={19} />
              </span>
            </button>
            <button
              className="under-link"
              onClick={() => {
                setError("");
                setScreen("register");
              }}
            >
              Criar conta <ArrowUpRight size={15} />
            </button>
            <button
              className="under-link"
              onClick={() => {
                setError("");
                setScreen("login");
              }}
            >
              Já tenho uma conta <ArrowUpRight size={15} />
            </button>
            <div className="hero-foot">
              <ShieldCheck size={18} />
              <p>
                <strong>Uma viagem de faz de conta.</strong>
                <br />O saldo e tarifas são fictícios. Não há pagamentos reais.
              </p>
            </div>
          </section>
          <section
            className="hero-visual"
            aria-label="Demonstração do aplicativo"
          >
            <MapSketch />
            <div className="route-ticket">
              <div>
                <span className="mini-label">SUA PRÓXIMA VIAGEM</span>
                <strong>Quando quiser, por onde quiser.</strong>
              </div>
              <span className="ticket-arrow">
                <ArrowUpRight size={21} />
              </span>
              <div className="ticket-line">
                <span className="dot-from" /> Ponto de partida{" "}
                <span className="ticket-divider" />
                <MapPin size={14} /> Seu destino
              </div>
            </div>
            <div className="hero-index">01 / A CIDADE É SUA</div>
          </section>
        </main>
      ) : !user ? (
        <main className="auth-layout">
          <div className="auth-intro">
            <button
              className="back-link"
              onClick={() => {
                setError("");
                setScreen("home");
              }}
            >
              ← Voltar ao início
            </button>
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot" /> COMEÇAR É SIMPLES
              </div>
              <h1>
                {screen === "register"
                  ? "Seu próximo destino começa aqui."
                  : "Que bom ter você de volta."}
              </h1>
              <p>
                Escolha seu papel e conheça o caminho de uma corrida, do pedido
                à chegada.
              </p>
            </div>
            <p className="auth-caption">
              Projeto aberto de Semsic · Somente demonstração
            </p>
          </div>
          <section className="auth-panel">
            <div className="auth-form-wrap">
              <span className="mini-label">VAI DE BOA / CONTA</span>
              <h2>
                {screen === "register"
                  ? "Crie sua conta"
                  : "Entre na sua conta"}
              </h2>
              <p className="muted">
                {screen === "register"
                  ? "Leva só um instante para começar."
                  : "Use os dados que você cadastrou."}
              </p>
              <form className="form" onSubmit={submitAuth}>
                {screen === "register" && (
                  <>
                    <fieldset>
                      <legend>Quero experimentar como</legend>
                      <div className="role-switch">
                        <label className={role === "rider" ? "selected" : ""}>
                          <input
                            type="radio"
                            name="role"
                            checked={role === "rider"}
                            onChange={() => setRole("rider")}
                          />{" "}
                          Passageiro
                        </label>
                        <label className={role === "driver" ? "selected" : ""}>
                          <input
                            type="radio"
                            name="role"
                            checked={role === "driver"}
                            onChange={() => setRole("driver")}
                          />{" "}
                          Motorista
                        </label>
                      </div>
                    </fieldset>
                    <label>
                      Seu nome
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        minLength={2}
                        maxLength={80}
                        autoComplete="name"
                        placeholder="Como podemos chamar você?"
                      />
                    </label>
                  </>
                )}
                <label>
                  E-mail
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                    autoComplete="email"
                    placeholder="voce@email.com"
                  />
                </label>
                <label>
                  Senha
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={screen === "register" ? 10 : 1}
                    maxLength={72}
                    autoComplete={
                      screen === "register"
                        ? "new-password"
                        : "current-password"
                    }
                    placeholder={
                      screen === "register"
                        ? "Pelo menos 10 caracteres"
                        : "Sua senha"
                    }
                  />
                </label>
                <button className="primary full" disabled={busy}>
                  {busy
                    ? "Aguarde…"
                    : screen === "register"
                      ? "Criar conta"
                      : "Entrar"}{" "}
                  <ArrowRight size={18} />
                </button>
              </form>
              <p className="auth-switch">
                {screen === "register"
                  ? "Já tem conta?"
                  : "Ainda não tem conta?"}{" "}
                <button
                  onClick={() => {
                    setError("");
                    setScreen(screen === "register" ? "login" : "register");
                  }}
                >
                  {screen === "register" ? "Entrar" : "Criar conta"}
                </button>
              </p>
              <p className="privacy-note">
                <ShieldCheck size={15} /> Use uma senha exclusiva para esta
                demonstração.
              </p>
            </div>
          </section>
        </main>
      ) : (
        <main className="dashboard">
          <div className="dashboard-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot" />{" "}
                {user.role === "rider"
                  ? "ÁREA DO PASSAGEIRO"
                  : "ÁREA DO MOTORISTA"}
              </div>
              <h1>
                Olá, {user.name.split(" ")[0]}
                <span className="brand-dot">.</span>
              </h1>
              <p>
                {user.role === "rider"
                  ? "Para onde vamos hoje?"
                  : "Veja quem está precisando de uma carona."}
              </p>
            </div>
            <div className="dashboard-badge">
              <CarFront size={18} /> Modo demonstração
            </div>
          </div>
          {user.isDemo && (
            <div className="demo-session" role="status">
              <p>
                <strong>Sessão de visitante.</strong> Seus dados são isolados e
                temporários; podem ser apagados quando o servidor reiniciar ou a
                sessão expirar. Use endereços fictícios.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={switchDemoRole}
              >
                Trocar para {user.role === "rider" ? "motorista" : "passageiro"}
              </button>
            </div>
          )}
          <div className="dashboard-grid">
            <section className="dashboard-main">
              {user.role === "rider" ? (
                <>
                  {currentRide ? (
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <span className="mini-label">SUA CORRIDA</span>
                          <h2>{labels[currentRide.status]}</h2>
                        </div>
                        <span className="status-dot" />
                      </div>
                      <RideRoute ride={currentRide} />
                      <div className="ride-meta">
                        <span>Tarifa fictícia</span>
                        <strong>{money(currentRide.fare_cents)}</strong>
                      </div>
                      {["pending", "accepted"].includes(currentRide.status) && (
                        <button
                          className="secondary full"
                          disabled={busy}
                          onClick={() => transition(currentRide, "cancel")}
                        >
                          Cancelar corrida
                        </button>
                      )}
                    </section>
                  ) : (
                    <section className="panel">
                      <span className="mini-label">NOVA CORRIDA</span>
                      <h2>Onde você quer ir?</h2>
                      <p className="muted">
                        Informe dois pontos para simular sua viagem.
                      </p>
                      <form className="form route-form" onSubmit={requestRide}>
                        <label>
                          Partida
                          <input
                            value={origin}
                            onChange={(e) => setOrigin(e.target.value)}
                            minLength={3}
                            maxLength={120}
                            required
                            placeholder="Digite o ponto de partida"
                          />
                        </label>
                        <label>
                          Destino
                          <input
                            value={destination}
                            onChange={(e) => setDestination(e.target.value)}
                            minLength={3}
                            maxLength={120}
                            required
                            placeholder="Digite o destino"
                          />
                        </label>
                        <div className="ride-meta">
                          <span>Tarifa demonstrativa fixa</span>
                          <strong>{money(1800)}</strong>
                        </div>
                        <button className="primary full" disabled={busy}>
                          {busy ? "Solicitando…" : "Solicitar corrida"}{" "}
                          <ArrowRight size={18} />
                        </button>
                      </form>
                    </section>
                  )}
                  <section className="wallet">
                    <div>
                      <span className="mini-label">SALDO FICTÍCIO</span>
                      <strong>{money(user.balanceCents)}</strong>
                      <p>Créditos para testar o aplicativo.</p>
                    </div>
                    <button
                      onClick={() =>
                        void run(async () => {
                          await api("/wallet/demo-credit", { method: "POST" });
                          await refresh();
                        })
                      }
                      disabled={busy}
                    >
                      <Plus size={17} /> Adicionar crédito
                    </button>
                  </section>
                </>
              ) : (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="mini-label">PAINEL DO MOTORISTA</span>
                      <h2>
                        {currentRide
                          ? labels[currentRide.status]
                          : "Corridas disponíveis"}
                      </h2>
                    </div>
                    <span className="status-dot" />
                  </div>
                  {currentRide ? (
                    <>
                      <RideRoute ride={currentRide} />
                      <div className="ride-meta">
                        <span>Tarifa fictícia</span>
                        <strong>{money(currentRide.fare_cents)}</strong>
                      </div>
                      <button
                        className="primary full"
                        disabled={busy}
                        onClick={() =>
                          transition(
                            currentRide,
                            currentRide.status === "accepted"
                              ? "start"
                              : "complete",
                          )
                        }
                      >
                        {currentRide.status === "accepted"
                          ? "Iniciar corrida"
                          : "Concluir corrida"}{" "}
                        <ArrowRight size={18} />
                      </button>
                    </>
                  ) : rides.filter((ride) => ride.status === "pending")
                      .length ? (
                    rides
                      .filter((ride) => ride.status === "pending")
                      .map((ride) => (
                        <article className="queue-item" key={ride.id}>
                          <RideRoute ride={ride} />
                          <div className="ride-meta">
                            <strong>{money(ride.fare_cents)}</strong>
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() => transition(ride, "accept")}
                            >
                              Aceitar corrida <ArrowRight size={15} />
                            </button>
                          </div>
                        </article>
                      ))
                  ) : (
                    <div className="empty">
                      <CircleHelp size={24} />
                      <strong>Nenhuma corrida por enquanto</strong>
                      <p>Quando alguém solicitar, ela aparecerá aqui.</p>
                    </div>
                  )}
                </section>
              )}
              <section className="history">
                <div className="section-heading">
                  <div>
                    <span className="mini-label">SEU TRAJETO POR AQUI</span>
                    <h2>Histórico</h2>
                  </div>
                  <span>Últimas corridas</span>
                </div>
                {rides.filter((ride) =>
                  ["completed", "cancelled"].includes(ride.status),
                ).length ? (
                  rides
                    .filter((ride) =>
                      ["completed", "cancelled"].includes(ride.status),
                    )
                    .map((ride) => (
                      <article className="history-item" key={ride.id}>
                        <div className="history-icon">
                          <ArrowDownLeft size={17} />
                        </div>
                        <div>
                          <strong>{ride.destination}</strong>
                          <small>
                            {labels[ride.status]} ·{" "}
                            {new Date(ride.created_at).toLocaleDateString(
                              "pt-BR",
                            )}
                          </small>
                        </div>
                        <b>{money(ride.fare_cents)}</b>
                      </article>
                    ))
                ) : (
                  <p className="muted history-empty">
                    Suas corridas concluídas vão aparecer aqui.
                  </p>
                )}
              </section>
            </section>
            <aside className="dashboard-side">
              <MapSketch />
              <div className="side-note">
                <Navigation size={18} />
                <div>
                  <strong>Explore no seu ritmo</strong>
                  <p>
                    Este mapa é ilustrativo. A demonstração não usa sua
                    localização.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </main>
      )}
      <footer className="footer">
        <span>
          Vai de Boa · um projeto de{" "}
          <a href="https://github.com/Semsic" target="_blank" rel="noreferrer">
            Semsic ↗
          </a>
        </span>
        <span>Corridas e valores apenas para demonstração.</span>
      </footer>
    </div>
  );
}
function RideRoute({ ride }: { ride: Ride }) {
  return (
    <div className="ride-route">
      <div>
        <span className="dot-from" />
        <p>
          <small>PARTIDA</small>
          <strong>{ride.origin}</strong>
        </p>
      </div>
      <div>
        <span className="dot-to" />
        <p>
          <small>DESTINO</small>
          <strong>{ride.destination}</strong>
        </p>
      </div>
    </div>
  );
}
export { App };
