/**
 * fatsecret.js — cliente browser para o proxy FatSecret
 *
 * A URL do proxy é guardada em localStorage ("fatsecret_proxy_url").
 * Sem URL configurada, search() retorna null e o app cai pra base local.
 */
(function () {
  const LS_KEY = "fatsecret_proxy_url";

  const getProxyUrl = () => {
    const u = localStorage.getItem(LS_KEY) || "";
    return u.replace(/\/+$/, ""); // strip trailing slash
  };
  const setProxyUrl = (u) => {
    if (u) localStorage.setItem(LS_KEY, u);
    else localStorage.removeItem(LS_KEY);
  };
  const isConfigured = () => !!getProxyUrl();

  // ------- Parsing helpers -------
  function asArray(x) {
    if (!x) return [];
    return Array.isArray(x) ? x : [x];
  }
  function pickServingPer100(servings) {
    // Prefer the metric 100g/100ml serving
    return servings.find(s =>
      parseFloat(s.metric_serving_amount) === 100 &&
      (s.metric_serving_unit === "g" || s.metric_serving_unit === "ml")
    ) || servings.find(s => s.metric_serving_amount && s.metric_serving_unit)
       || servings[0];
  }

  // ------- API -------
  /**
   * Search foods. Returns lightweight result rows for the autocomplete:
   *   [{ id, nome, cat, kcal_hint, c_hint, p_hint, g_hint, unidade, remote: true }]
   * Returns null if proxy not configured.
   */
  async function search(query) {
    if (!isConfigured()) return null;
    const base = getProxyUrl();
    const res = await fetch(`${base}/search?q=${encodeURIComponent(query)}&max=10`);
    if (!res.ok) throw new Error(`search ${res.status}`);
    const json = await res.json();
    const list = asArray(json?.foods_search?.results?.food);
    return list.map(f => {
      const hints = parseDescription(f.food_description || "");
      return {
        id: f.food_id,
        nome: f.food_name + (f.brand_name ? ` · ${f.brand_name}` : ""),
        cat: f.food_type || "FatSecret",
        unidade: hints.unidade || "g",
        kcal: hints.kcal,
        c: hints.c,
        p: hints.p,
        g: hints.g,
        remote: true,
      };
    });
  }

  /**
   * Get full nutrition for a food by id. Returns object normalized per 100g/100ml:
   *   { nome, unidade, kcal, c, p, g }
   */
  async function get(id) {
    if (!isConfigured()) throw new Error("Proxy não configurado");
    const base = getProxyUrl();
    const res = await fetch(`${base}/food/${id}`);
    if (!res.ok) throw new Error(`get ${res.status}`);
    const json = await res.json();
    const food = json?.food;
    if (!food) throw new Error("Sem dados do alimento");

    const servings = asArray(food.servings?.serving);
    const serving = pickServingPer100(servings);
    if (!serving) throw new Error("Sem serving");

    const amount = parseFloat(serving.metric_serving_amount) || 100;
    const factor = 100 / amount;
    const unidade = serving.metric_serving_unit === "ml" ? "ml" : "g";

    return {
      nome: food.food_name + (food.brand_name ? ` · ${food.brand_name}` : ""),
      unidade,
      kcal: Math.round((parseFloat(serving.calories) || 0) * factor),
      c: +((parseFloat(serving.carbohydrate) || 0) * factor).toFixed(1),
      p: +((parseFloat(serving.protein) || 0) * factor).toFixed(1),
      g: +((parseFloat(serving.fat) || 0) * factor).toFixed(1),
      cat: food.food_type || "FatSecret",
    };
  }

  // Parse FatSecret search snippets like:
  //   "Per 100g - Calories: 89kcal | Fat: 0.33g | Carbs: 22.84g | Protein: 1.09g"
  function parseDescription(desc) {
    const out = { kcal: null, c: null, p: null, g: null, unidade: null };
    const unitMatch = desc.match(/Per\s+\d+(\.\d+)?\s*(g|ml)/i);
    if (unitMatch) out.unidade = unitMatch[2].toLowerCase();
    const kcal = desc.match(/Calories:\s*([\d.]+)\s*kcal/i);
    const fat = desc.match(/Fat:\s*([\d.]+)\s*g/i);
    const carb = desc.match(/Carbs?:\s*([\d.]+)\s*g/i);
    const prot = desc.match(/Protein:\s*([\d.]+)\s*g/i);
    if (kcal) out.kcal = Math.round(parseFloat(kcal[1]));
    if (fat) out.g = parseFloat(fat[1]);
    if (carb) out.c = parseFloat(carb[1]);
    if (prot) out.p = parseFloat(prot[1]);
    return out;
  }

  /** Quick connectivity test */
  async function healthCheck() {
    if (!isConfigured()) return { ok: false, reason: "Proxy não configurado" };
    try {
      const res = await fetch(`${getProxyUrl()}/health`);
      const j = await res.json();
      return { ok: !!j.ok };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  window.fatsecret = { search, get, getProxyUrl, setProxyUrl, isConfigured, healthCheck };
})();
