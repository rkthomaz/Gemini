/**
 * Nutri Stael — proxy FatSecret (Cloudflare Pages Functions)
 * Roteia /search, /food/:id e /health no mesmo domínio do Pages.
 *
 * Estrutura esperada no projeto Pages:
 *   functions/[[catchall]].js  ← este arquivo
 *
 * Secrets necessárias (Pages → Settings → Environment variables → Production):
 *   FATSECRET_CLIENT_ID         (Secret)
 *   FATSECRET_CLIENT_SECRET     (Secret)
 *
 * Após o deploy, a URL do proxy será o domínio do Pages, ex:
 *   https://testenutri.pages.dev
 * Cole essa URL no app em Tweaks → URL do proxy.
 */

const TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const API_URL = "https://platform.fatsecret.com/rest/server.api";

// Cache em memória (por instância)
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
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) throw new Error(`OAuth ${res.status}: ${await res.text()}`);

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
  return { status: res.status, body: await res.text() };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function onRequest(context) {
  const { request, env, next } = context;
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(request.url);

  try {
    // /search?q=banana&max=10
    if (url.pathname === "/search" || url.pathname === "/search/") {
      const q = url.searchParams.get("q") || "";
      const max = url.searchParams.get("max") || "10";
      if (!q.trim()) return jsonResp({ foods_search: { results: { food: [] } } });
      const r = await callFatSecret(env, {
        method: "foods.search",
        search_expression: q,
        max_results: max,
      });
      return rawResp(r.body, r.status);
    }

    // /food/123456
    const m = url.pathname.match(/^\/food\/(\d+)\/?$/);
    if (m) {
      const r = await callFatSecret(env, {
        method: "food.get.v4",
        food_id: m[1],
      });
      return rawResp(r.body, r.status);
    }

    // /health
    if (url.pathname === "/health") {
      return jsonResp({ ok: true, service: "nutri-stael-fatsecret" });
    }

    // outras rotas → deixa o Pages servir o estático (ou 404)
    return next();
  } catch (e) {
    return jsonResp({ error: String(e.message || e) }, 500);
  }
}

function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function rawResp(body, status) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
