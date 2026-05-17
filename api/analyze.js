// api/analyze.js — Vercel serverless function
// Proxy do Google Gemini para a Nutri Stael.
// O front chama POST /api/analyze com { prompt }, e este handler
// adiciona a system instruction da Nutri Stael e devolve o texto da resposta.

const SYSTEM_INSTRUCTION = `Você é a Nutri Stael, uma nutricionista especialista em modificar alimentos mantendo kcal e macros. Seu tom é profissional, preciso e focado em equivalência nutricional.

mantenha sempre as kcal e macros nas trocas.`;

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export default async function handler(req, res) {
  // CORS (mesmo origem na Vercel, mas seguro deixar)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada nas Environment Variables do Vercel." });
  }

  // Body parsing (Vercel já parseia JSON, mas garantia extra)
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Campo 'prompt' (string) é obrigatório." });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      // Desativa o "thinking" do gemini-2.5-flash — pra essa tarefa
      // (gerar JSON estruturado) não precisamos, e ele consumia o budget
      // de tokens antes da resposta final, causando truncamento.
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
        error: json?.error?.message || `Erro do Gemini (${r.status})`,
        details: json,
      });
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) {
      return res.status(502).json({ error: "Gemini não retornou texto.", details: json });
    }

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
