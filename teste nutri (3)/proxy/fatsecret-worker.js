/**
 * Nutri Stael — proxy FatSecret (Cloudflare Worker)
 * --------------------------------------------------
 * Faz OAuth 2.0 Client Credentials, cacheia o access_token em memória do worker,
 * e expõe dois endpoints com CORS aberto:
 *
 *   GET /search?q=<termo>&max=10       → foods.search (FatSecret)
 *   GET /food/<food_id>                 → food.get.v4 (FatSecret)
 *
 * ==========================================================================
 * DEPLOY (Cloudflare Workers — grátis, 100k req/dia)
 * ==========================================================================
 * 1. Instale o wrangler:    npm i -g wrangler
 * 2. Login:                 wrangler login
 * 3. Crie wrangler.toml ao lado deste arquivo com:
 *
 *      name = "nutri-stael-fatsecret"
 *      main = "fatsecret-worker.js"
 *      compatibility_date = "2024-09-01"
 *
 * 4. Cadastre as secrets (NÃO ponha as credenciais aqui no código!):
 *      wrangler secret put FATSECRET_CLIENT_ID
 *      wrangler secret put FATSECRET_CLIENT_SECRET
 *
 * 5. Deploy:               wrangler deploy
 *    Vai te dar uma URL tipo: https://nutri-stael-fatsecret.SEU-USUARIO.workers.dev
 *
 * 6. No app Nutri Stael, abra Tweaks → cole a URL no campo "URL do proxy FatSecret".
 *
 * IMPORTANTE: no painel da FatSecret (Developer → My Account → Manage API Keys),
 * desative o "IP restriction" OU adicione um range amplo, já que o IP de saída
 * do Cloudflare Worker é dinâmico.
 *
 * Alternativa: este arquivo também roda como handler Vercel/Netlify Function ou
 * Express, basta adaptar a assinatura. A lógica de OAuth é a mesma.
 * ==========================================================================
 */

const TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const API_URL = "https://platform.fatsecret.com/rest/server.api";

// In-memory token cache (per worker isolate)
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken(env) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

  const creds = btoa(`${env.FATSECRET_CLIENT_ID}:${env.FATSECRET_CLIENT_SECRET}`);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "basic",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OAuth token error ${res.status}: ${txt}`);
  }

  const json = await res.json();
  cachedToken = json.access_token;
  tokenExpiresAt = now + (json.expires_in || 3600) * 1000;
  return cachedToken;
}

async function callFatSecret(env, params) {
  const token = await getAccessToken(env);
  const q = new URLSearchParams({ ...params, format: "json" });
  const res = await fetch(`${API_URL}?${q.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  return { status: res.status, body };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      // /search?q=banana&max=10
      if (url.pathname === "/search" || url.pathname === "/search/") {
        const q = url.searchParams.get("q") || "";
        const max = url.searchParams.get("max") || "10";
        if (!q.trim()) {
          return jsonResponse({ foods_search: { results: { food: [] } } }, 200);
        }
        const r = await callFatSecret(env, {
          method: "foods.search",
          search_expression: q,
          max_results: max,
        });
        return rawResponse(r.body, r.status);
      }

      // /food/123456
      const foodMatch = url.pathname.match(/^\/food\/(\d+)\/?$/);
      if (foodMatch) {
        const r = await callFatSecret(env, {
          method: "food.get.v4",
          food_id: foodMatch[1],
        });
        return rawResponse(r.body, r.status);
      }

      // health check
      if (url.pathname === "/" || url.pathname === "/health") {
        return jsonResponse({ ok: true, service: "nutri-stael-fatsecret" }, 200);
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (e) {
      return jsonResponse({ error: String(e.message || e) }, 500);
    }
  },
};

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function rawResponse(body, status) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
