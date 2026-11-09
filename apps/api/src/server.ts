import { readEnv } from "./config/env.js";
import { supabaseRepository } from "./repositories/supabase.js";
import { createApp } from "./app.js";
const env = readEnv(process.env);
const app = createApp(
  {
    origin: env.APP_ORIGIN,
    jwtSecret: env.JWT_SECRET,
    rateSecret: env.RATE_LIMIT_SECRET,
    secureCookie: env.NODE_ENV === "production",
    proxySecret: env.PROXY_SECRET,
  },
  supabaseRepository(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY),
);
app.listen(env.PORT, "0.0.0.0", () =>
  console.log(`API disponível na porta ${env.PORT}`),
);
