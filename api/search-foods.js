// api/search-foods.js — Vercel serverless function
// Busca alimentos via Gemini: retorna lista de até 8 opções com kcal/macros
// por 100g (ou 100ml), no shape que o autocomplete da Nutri Stael consome.

const SYSTEM_INSTRUCTION = `Você é a Nutri Stael, nutricionista especialista em alimentos brasileiros.
Você conhece a tabela TACO e bases de composição de alimentos.
Quando recebe um termo de busca, retorna uma lista de alimentos compatíveis com valores nutricionais POR 100g (ou 100ml para líquidos), sempre normalizados.

Regras:
- Valores SEMPRE por 100g/100ml, nunca por porção.
- Use kcal (não kJ).
- Carboidratos, proteínas e gorduras em gramas (números, sem unidade no JSON).
- Inclua variações relevantes (ex: "arroz" → arroz branco cozido, integral cozido, parboilizado cru).
- Foco em alimentos comuns na alimentação brasileira.
- Se o termo for vago, retorne as opções mais prováveis.
- Se o termo não corresponder a nenhum alimento real, retorne lista vazia.`;

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada." });
  }

  const q = (req.query?.q || "").toString().trim();
  if (!q) return res.status(200).json({ foods: [] });

  const prompt = `Termo de busca: "${q}"

Retorne uma lista de até 8 alimentos brasileiros que correspondam ao termo, com valores nutricionais POR 100g (ou 100ml para líquidos).

Responda APENAS com JSON válido nesse formato exato (sem markdown, sem comentários):

{
  "foods": [
    {
      "nome": "string (nome claro, ex: 'Arroz branco cozido')",
      "unidade": "g" | "ml",
      "kcal": numero (inteiro, por 100g/100ml),
      "c": numero (carboidratos em g, 1 casa decimal),
      "p": numero (proteínas em g, 1 casa decimal),
      "g": numero (gorduras em g, 1 casa decimal),
      "cat": "string (categoria curta, ex: 'Cereais', 'Frutas', 'Carnes')"
    }
  ]
}

Se nenhum alimento corresponder, retorne {"foods": []}.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: json?.error?.message || `Gemini ${r.status}`,
      });
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) {
      return res.status(502).json({ error: "Gemini não retornou texto." });
    }

    // Tenta extrair o JSON da resposta
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(200).json({ foods: [] });

    let parsed;
    try { parsed = JSON.parse(match[0]); }
    catch { return res.status(200).json({ foods: [] }); }

    // Normaliza: garante que todos os campos existam
    const foods = (parsed.foods || []).map(f => ({
      nome: String(f.nome || "").trim(),
      unidade: f.unidade === "ml" ? "ml" : "g",
      kcal: Math.round(Number(f.kcal) || 0),
      c: +(Number(f.c) || 0).toFixed(1),
      p: +(Number(f.p) || 0).toFixed(1),
      g: +(Number(f.g) || 0).toFixed(1),
      cat: String(f.cat || "Geral"),
    })).filter(f => f.nome && f.kcal > 0);

    // Cache 1h no edge — termos repetidos não custam tokens
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

    return res.status(200).json({ foods });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
