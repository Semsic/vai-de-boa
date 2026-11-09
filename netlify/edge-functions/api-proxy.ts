// O navegador conversa com a Netlify; o segredo só viaja entre os servidores.
export default async (request: Request, context: { ip: string }) => {
  const origin = Netlify.env.get("RENDER_API_URL");
  const secret = Netlify.env.get("PROXY_SECRET");
  if (!origin || !secret || secret.length < 32)
    return new Response("API não configurada.", { status: 503 });
  try {
    const upstream = new URL(origin);
    if (
      upstream.protocol !== "https:" ||
      upstream.username ||
      upstream.password ||
      upstream.pathname !== "/"
    )
      throw new Error("invalid URL");
    const incoming = new URL(request.url);
    const destination = new URL(incoming.pathname + incoming.search, upstream);
    const headers = new Headers();
    for (const name of [
      "accept",
      "content-type",
      "cookie",
      "origin",
      "x-csrf-token",
    ]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("x-vdb-proxy-secret", secret);
    headers.set("x-vdb-client-ip", context.ip || "unknown");
    const options: RequestInit & { duplex: "half" } = {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
      duplex: "half",
    };
    return await fetch(new Request(destination, options));
  } catch {
    return new Response("API indisponível.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
};
