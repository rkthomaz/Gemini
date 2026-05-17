const { useState, useEffect, useRef, useMemo } = React;

// ---------- Utility ----------
const scale = (food, qty) => {
  const factor = qty / 100;
  return {
    nome: food.nome,
    quantidade: qty,
    unidade: food.unidade,
    kcal: Math.round(food.kcal * factor),
    c: +(food.c * factor).toFixed(1),
    p: +(food.p * factor).toFixed(1),
    g: +(food.g * factor).toFixed(1)
  };
};

const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const sumTotals = (items) => items.reduce(
  (acc, it) => ({
    kcal: acc.kcal + (it.kcal || 0),
    c: +(acc.c + (it.c || 0)).toFixed(1),
    p: +(acc.p + (it.p || 0)).toFixed(1),
    g: +(acc.g + (it.g || 0)).toFixed(1)
  }),
  { kcal: 0, c: 0, p: 0, g: 0 }
);

const GOALS = [
{ key: "manter", label: "Substituir por refeição equivalente", short: "Equivalente", hint: "Mesma equivalência calórica e de macros, com variedade" },
{ key: "reduzir_kcal", label: "Diminuir calorias", short: "Menos kcal", hint: "Cortar ~20% das kcal mantendo saciedade" },
{ key: "mais_saudavel", label: "Refeição mais saudável", short: "Mais saudável", hint: "Trocar processados por opções in natura" },
{ key: "mais_proteina", label: "Mais proteína", short: "Mais proteína", hint: "Aumentar proteína mantendo kcal próximo" }];

// Big icons for goal chips
function GoalIcon({ goalKey, size = 40 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };
  if (goalKey === "manter") return (
    <svg {...common}><path d="m7 4-3 3 3 3"/><path d="M4 7h13a3 3 0 0 1 3 3v0"/><path d="m17 20 3-3-3-3"/><path d="M20 17H7a3 3 0 0 1-3-3v0"/></svg>);
  if (goalKey === "reduzir_kcal") return (
    <svg {...common}><path d="M12 2v3"/><path d="M9 4h6"/><path d="M12 22a8 8 0 0 0 8-8c0-4-3-6-3-10H7c0 4-3 6-3 10a8 8 0 0 0 8 8Z"/><path d="M9 14h6"/></svg>);
  if (goalKey === "mais_saudavel") return (
    <svg {...common}><path d="M11 20A7 7 0 0 1 4 13a7 7 0 0 1 7-7c1.5 0 2.8.5 4 1.4"/><path d="M11 20c0-6.5 4-12 10-12"/><path d="M14 9c1.5 0 3 .5 4 1.5"/></svg>);
  if (goalKey === "mais_proteina") return (
    <svg {...common}><path d="M6.5 6.5 17.5 17.5"/><path d="M21 21a4 4 0 0 1-5.6 0L3 8.6A4 4 0 0 1 8.6 3L21 15.4a4 4 0 0 1 0 5.6Z"/></svg>);
  return null;
}


// ---------- AI Prompt ----------
function buildPrompt(items, goalKey) {
  const goal = GOALS.find((g) => g.key === goalKey);
  const totals = sumTotals(items);
  const list = items.map((it, i) =>
  `${i + 1}. ${it.quantidade}${it.unidade} de ${it.nome} (${it.kcal} kcal | C ${it.c}g | P ${it.p}g | G ${it.g}g)`
  ).join("\n");

  const goalRule = {
    manter: "Mantenha os TOTAIS de kcal e macros o mais próximos possível dos originais (variação <10%). Priorize variedade e qualidade nutricional.",
    mais_proteina: "Aumente a proteína total em ~20-30% mantendo kcal próximo do original.",
    reduzir_kcal: "Reduza as kcal totais em ~20% preservando a proporção de proteína (não cortar proteína).",
    mais_saudavel: "Substitua alimentos processados/refinados por versões integrais e in natura. Mantenha kcal próximo."
  }[goalKey];

  return `Você é a Nutri Stael, nutricionista. Tom profissional mas acolhedor, em português do Brasil.

REFEIÇÃO ATUAL:
${list}

TOTAIS ATUAIS: ${totals.kcal} kcal | C ${totals.c}g | P ${totals.p}g | G ${totals.g}g

OBJETIVO: ${goal.label} — ${goal.hint}
REGRA: ${goalRule}

TAREFA:
Gere DUAS opções alternativas de alteração (A e B), DIFERENTES entre si — substitutos distintos, abordagens distintas, para o usuário comparar.

Para CADA opção, decida para CADA item original (na ordem, mesmo índice) uma ação:
- "manter": item permanece igual.
- "substituir": indique novo alimento e quantidade.
- "remover": item sai da refeição.

Você também pode ADICIONAR de 0 a 2 novos itens em cada opção.

Seja realista para a culinária brasileira. Calcule kcal e macros corretos para cada item novo.

Responda APENAS com JSON válido (sem markdown, sem comentários, sem texto fora do JSON):

{
  "opcaoA": {
    "titulo": "string curta descrevendo a abordagem (ex: 'Troca por carboidratos integrais')",
    "alteracoes": [
      { "indice_original": 0, "acao": "manter" | "substituir" | "remover", "novo": null, "motivo": "frase curta" }
    ],
    "adicionados": [
      { "nome": "string", "quantidade": numero, "unidade": "g" | "ml", "kcal": numero, "c": numero, "p": numero, "g": numero, "motivo": "frase curta" }
    ],
    "justificativa": "2-3 frases sobre a estratégia desta opção."
  },
  "opcaoB": {
    "titulo": "string curta",
    "alteracoes": [
      { "indice_original": 0, "acao": "manter" | "substituir" | "remover", "novo": null, "motivo": "frase curta" }
    ],
    "adicionados": [ ],
    "justificativa": "2-3 frases."
  }
}

Para "substituir", "novo" deve ser objeto: { "nome": "string", "quantidade": numero, "unidade": "g"|"ml", "kcal": numero, "c": numero, "p": numero, "g": numero }.
Para "manter" e "remover", "novo" é null.
Cada "alteracoes" deve ter exatamente ${items.length} entradas, uma por item original.
opcaoA e opcaoB DEVEM ser claramente diferentes (substitutos distintos, não apenas redoses).`;
}

async function getMealSuggestion(items, goal) {
  const prompt = buildPrompt(items, goal);

  // 1) Tenta /api/analyze (Gemini via Vercel serverless function)
  let raw = null;
  try {
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    if (r.ok) {
      const j = await r.json();
      raw = j.text;
    } else if (r.status !== 404) {
      // 404 = endpoint não existe (rodando local sem Vercel) → tenta fallback
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `API ${r.status}`);
    }
  } catch (e) {
    // Erro de rede ou endpoint não disponível → tenta fallback
    if (!raw && !window.claude?.complete) throw e;
  }

  // 2) Fallback: window.claude.complete (quando aberto dentro do Claude)
  if (!raw) {
    if (!window.claude?.complete) {
      throw new Error("Nenhuma IA disponível. Configure GEMINI_API_KEY no Vercel.");
    }
    raw = await window.claude.complete(prompt);
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Resposta inválida da IA");
  return JSON.parse(match[0]);
}

// ---------- Tweak defaults ----------
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfortable",
  "proxyUrl": ""
} /*EDITMODE-END*/;

// ---------- Header ----------
function Header({ onReset }) {
  return (
    <header className="header">
      <div className="brand" onClick={onReset}>
        <div className="brand-mark brand-mark-img">
          <img src="helper-logo.png" alt="Helper das realizadas" />
        </div>
        <div>
          <div className="brand-name">Helper <em>das realizadas</em></div>
          <div className="brand-tag">Alterações inteligentes de refeição</div>
        </div>
      </div>
      <nav className="header-nav">
        <button>Sobre</button>
      </nav>
    </header>);
}

// ---------- Food picker (autocomplete, FatSecret + fallback local) ----------
function FoodPicker({ onAdd }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(100);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState(null);
  const wrapRef = useRef(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {setSuggestions([]);setSearching(false);return;}
    setSearching(true);
    const myId = ++reqRef.current;
    const t = setTimeout(async () => {
      let results = null;
      let used = null;

      // 1) Gemini (primário) — busca com macros calculados pela IA
      try {
        const r = await fetch(`/api/search-foods?q=${encodeURIComponent(q)}`);
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j.foods) && j.foods.length > 0) {
            results = j.foods;
            used = "gemini";
          }
        }
      } catch (e) {console.warn("Gemini search falhou:", e);}

      // 2) FatSecret (opcional, se configurado nos Tweaks)
      if (!results) {
        try {
          if (window.fatsecret && window.fatsecret.isConfigured()) {
            const remote = await window.fatsecret.search(q);
            if (remote && remote.length > 0) {results = remote;used = "fatsecret";}
          }
        } catch (e) {console.warn("FatSecret falhou:", e);}
      }

      // 3) Base local (fallback final)
      if (!results) {
        const n = normalize(q);
        results = window.FOODS.
        filter((f) => normalize(f.nome).includes(n) || normalize(f.cat).includes(n)).
        slice(0, 8);
        used = "local";
      }

      if (reqRef.current !== myId) return;
      setSuggestions(results);
      setSearching(false);
      setSource(used);
    }, 320);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = async (food) => {
    setOpen(false);
    if (food.remote && food.id) {
      setAdding(true);
      setQuery(food.nome);
      try {
        const full = await window.fatsecret.get(food.id);
        setSelected(full);
      } catch (e) {
        console.error(e);
        if (food.kcal != null) {
          setSelected({ nome: food.nome, unidade: food.unidade || "g",
            kcal: food.kcal, c: food.c || 0, p: food.p || 0, g: food.g || 0 });
        }
      } finally {setAdding(false);}
    } else {
      setSelected(food);
      setQuery(food.nome);
    }
  };

  const handleAdd = () => {
    if (!selected) return;
    onAdd(scale(selected, qty));
    setSelected(null);
    setQuery("");
    setQty(100);
  };

  const onKeyDown = (e) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter" && selected) handleAdd();
      return;
    }
    if (e.key === "ArrowDown") {e.preventDefault();setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));} else
    if (e.key === "ArrowUp") {e.preventDefault();setActiveIdx((i) => Math.max(i - 1, 0));} else
    if (e.key === "Enter") {e.preventDefault();pick(suggestions[activeIdx]);} else
    if (e.key === "Escape") {setOpen(false);}
  };

  return (
    <div className="picker-wrap" ref={wrapRef}>
      <div className="search-bar">
        <div className="search-input-area">
          <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            className="search-input"
            placeholder="Adicionar alimento à refeição…"
            value={query}
            onChange={(e) => {setQuery(e.target.value);setSelected(null);setOpen(true);setActiveIdx(0);}}
            onFocus={() => query && setOpen(true)}
            onKeyDown={onKeyDown} />
          
        </div>
        <div className="qty-area">
          <input
            className="qty-input"
            type="number"
            value={qty}
            min="1"
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "0")))} />
          
          <span className="qty-unit">{selected?.unidade || "g"}</span>
        </div>
        <button className="search-submit" onClick={handleAdd} disabled={!selected || adding}>
          {adding ?
          <>
              <span className="mini-spinner"></span>
              Buscando…
            </> :

          <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Adicionar
            </>
          }
        </button>
      </div>

      {open && (searching || suggestions.length > 0) &&
      <div className="suggestions">
          {source &&
        <div className={"sugg-source " + source}>
              {source === "gemini" ?
          <>
                  <span className="src-dot"></span>
                  Base Gemini · valores nutricionais por 100{suggestions[0]?.unidade || "g"}
                </> :
          source === "fatsecret" ?
          <>
                  <span className="src-dot"></span>
                  Base FatSecret
                </> :

          <>
                  <span className="src-dot local"></span>
                  Base local · Gemini indisponível
                </>
          }
            </div>
        }
          {searching &&
        <div className="sugg-loading">
              <span className="mini-spinner"></span>
              Buscando alimentos…
            </div>
        }
          {!searching && suggestions.map((f, i) =>
        <div
          key={f.id || f.nome}
          className={"sugg-item" + (i === activeIdx ? " active" : "")}
          onMouseEnter={() => setActiveIdx(i)}
          onClick={() => pick(f)}>
          
              <div className="sugg-name">{f.nome}</div>
              <div className="sugg-meta">
                {f.kcal != null ?
            <>{f.kcal} kcal · 100{f.unidade || "g"} · {f.cat}</> :
            <>{f.cat || "FatSecret"}</>}
              </div>
            </div>
        )}
        </div>
      }
    </div>);

}

// ---------- Meal list ----------
function MealList({ items, onRemove }) {
  if (items.length === 0) {
    return (
      <div className="meal-empty">
        <div className="meal-empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M3 11h18M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <div>Sua refeição aparecerá aqui.</div>
        <small>Adicione ao menos 1 alimento acima para receber sugestões.</small>
      </div>);

  }
  return (
    <ul className="meal-list">
      {items.map((it, i) =>
      <li key={i} className="meal-row">
          <div className="meal-row-main">
            <div className="meal-row-name">{it.nome}</div>
            <div className="meal-row-meta">
              <span className="m-qty">{it.quantidade}{it.unidade}</span>
              <span className="m-dot">·</span>
              <span className="m-kcal">{it.kcal} kcal</span>
              <span className="m-macros">C {it.c}g · P {it.p}g · G {it.g}g</span>
            </div>
          </div>
          <button className="meal-row-remove" onClick={() => onRemove(i)} aria-label="Remover">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </li>
      )}
    </ul>);

}

// ---------- Totals card ----------
function TotalsCard({ totals, title, accent = "neutral", compareTo = null }) {
  const max = Math.max(totals.c, totals.p, totals.g, compareTo?.c || 0, compareTo?.p || 0, compareTo?.g || 0, 10);
  return (
    <div className={"totals-card " + (accent === "sage" ? "sage" : "")}>
      <div className={"card-label " + (accent === "sage" ? "sage" : "")}>{title}</div>
      <div className="totals-kcal">
        <span className="num">{totals.kcal}</span>
        <span className="lbl">kcal</span>
        {compareTo && <DiffPill diff={totals.kcal - compareTo.kcal} suffix="" />}
      </div>
      <div className="macros">
        <MacroRow label="Carboidratos" cls="carb" value={totals.c} max={max} compare={compareTo?.c} />
        <MacroRow label="Proteínas" cls="prot" value={totals.p} max={max} compare={compareTo?.p} />
        <MacroRow label="Gorduras" cls="fat" value={totals.g} max={max} compare={compareTo?.g} />
      </div>
    </div>);

}

function MacroRow({ label, cls, value, max, compare }) {
  const pct = Math.min(100, value / max * 100);
  const diff = compare !== undefined && compare !== null ? +(value - compare).toFixed(1) : null;
  return (
    <div className="macro-row">
      <div className={"macro-label " + cls}>{label}</div>
      <div className="macro-bar">
        <div className={"macro-fill " + cls} style={{ width: pct + "%" }} />
      </div>
      <div className="macro-value">
        {value.toFixed(1)}<span className="unit">g</span>
        {diff !== null && <DiffPill diff={diff} suffix="g" small />}
      </div>
    </div>);

}

function DiffPill({ diff, suffix = "", small = false }) {
  if (Math.abs(diff) < 0.1) return null;
  const sign = diff > 0 ? "+" : "";
  const tone = diff > 0 ? "up" : "down";
  return (
    <span className={"diff-pill " + tone + (small ? " small" : "")}>
      {sign}{diff}{suffix}
    </span>);

}

// ---------- Goal selector ----------
function GoalSelector({ value, onChange }) {
  return (
    <div className="goal-selector">
      <div className="goal-label">Objetivo da alteração</div>
      <div className="goal-chips">
        {GOALS.map((g) =>
        <button
          key={g.key}
          className={"goal-chip" + (value === g.key ? " active" : "")}
          onClick={() => onChange(g.key)}
          title={g.hint}>
            <div className="goal-chip-icon"><GoalIcon goalKey={g.key} size={44} /></div>
            <div className="goal-chip-text">
              <span className="goal-chip-name">{g.label}</span>
              <span className="goal-chip-hint">{g.hint}</span>
            </div>
          </button>
        )}
      </div>
    </div>);
}

// ---------- Builder screen ----------
function Builder({ onAnalyze }) {
  const [items, setItems] = useState([]);
  const [goal, setGoal] = useState("manter");

  const totals = useMemo(() => sumTotals(items), [items]);

  return (
    <>
      <div className="hero">
        <div className="hero-eyebrow"><span className="dot"></span>Análise de refeição</div>
        <h1 className="hero-title">Monte sua refeição. <em>Eu sugiro</em> as alterações.</h1>
        <p className="hero-sub">Adicione os alimentos da sua dieta, e a gente devolve opçoes com cada item marcado como mantido, substituído ou removido.

        </p>
      </div>

      <div className="builder">
        <div className="builder-left">
          <FoodPicker onAdd={(it) => setItems((prev) => [...prev, it])} />
          <MealList items={items} onRemove={(i) => setItems((prev) => prev.filter((_, idx) => idx !== i))} />
        </div>

        <aside className="builder-right">
          <TotalsCard totals={totals} title="Totais da refeição" />
        </aside>
      </div>

      {items.length > 0 &&
      <div className="actions">
          <GoalSelector value={goal} onChange={setGoal} />
          <button className="analyze-btn" onClick={() => onAnalyze(items, goal)}>
            Analisar refeição
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      }
    </>);

}

// ---------- Suggested meal item row ----------
function ChangeRow({ change, item }) {
  const action = change.acao;
  const isMantido = action === "manter";
  const isSub = action === "substituir";
  const isRem = action === "remover";
  const novo = change.novo;

  return (
    <li className={"change-row action-" + action}>
      <div className={"change-badge " + action}>
        {isMantido &&
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        }
        {isSub &&
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 4-3 3 3 3" /><path d="M4 7h13a3 3 0 0 1 3 3" /><path d="m17 20 3-3-3-3" /><path d="M20 17H7a3 3 0 0 1-3-3" /></svg>
        }
        {isRem &&
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        }
      </div>

      <div className="change-body">
        <div className="change-tag">
          {isMantido && "Mantido"}
          {isSub && "Substituído"}
          {isRem && "Removido"}
        </div>

        {isMantido &&
        <>
            <div className="change-name">{item.nome}</div>
            <div className="change-meta">
              <span>{item.quantidade}{item.unidade}</span><span className="m-dot">·</span>
              <span>{item.kcal} kcal</span><span className="m-dot">·</span>
              <span>C {item.c}g · P {item.p}g · G {item.g}g</span>
            </div>
          </>
        }

        {isSub && novo &&
        <>
            <div className="change-name">
              <span className="strike">{item.nome}</span>
              <svg className="arrow-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              {novo.nome}
            </div>
            <div className="change-meta">
              <span>{novo.quantidade}{novo.unidade}</span><span className="m-dot">·</span>
              <span>{novo.kcal} kcal</span><span className="m-dot">·</span>
              <span>C {novo.c}g · P {novo.p}g · G {novo.g}g</span>
            </div>
            {change.motivo && <div className="change-motivo">{change.motivo}</div>}
          </>
        }

        {isRem &&
        <>
            <div className="change-name strike">{item.nome}</div>
            <div className="change-meta">
              <span>{item.quantidade}{item.unidade}</span><span className="m-dot">·</span>
              <span>{item.kcal} kcal</span>
            </div>
            {change.motivo && <div className="change-motivo">{change.motivo}</div>}
          </>
        }
      </div>
    </li>);

}

function AddedRow({ item }) {
  return (
    <li className="change-row action-adicionar">
      <div className="change-badge adicionar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </div>
      <div className="change-body">
        <div className="change-tag">Adicionado</div>
        <div className="change-name">{item.nome}</div>
        <div className="change-meta">
          <span>{item.quantidade}{item.unidade}</span><span className="m-dot">·</span>
          <span>{item.kcal} kcal</span><span className="m-dot">·</span>
          <span>C {item.c}g · P {item.p}g · G {item.g}g</span>
        </div>
        {item.motivo && <div className="change-motivo">{item.motivo}</div>}
      </div>
    </li>);

}

// ---------- Result ----------
function Result({ original, result, goalKey, onReset }) {
  const originalTotals = useMemo(() => sumTotals(original), [original]);

  // Normaliza: se vier no formato antigo (sem opções A/B), envolve em opcaoA
  const options = useMemo(() => {
    if (result.opcaoA || result.opcaoB) {
      const arr = [];
      if (result.opcaoA) arr.push({ letra: "A", ...result.opcaoA });
      if (result.opcaoB) arr.push({ letra: "B", ...result.opcaoB });
      return arr;
    }
    return [{ letra: "A", titulo: "Sugestão", alteracoes: result.alteracoes, adicionados: result.adicionados, justificativa: result.justificativa }];
  }, [result]);

  const [selectedOpt, setSelectedOpt] = useState(0);
  const opt = options[selectedOpt] || options[0];

  const suggestedItems = useMemo(() => {
    const out = [];
    (opt.alteracoes || []).forEach((ch) => {
      const it = original[ch.indice_original];
      if (!it) return;
      if (ch.acao === "manter") out.push(it);
      else if (ch.acao === "substituir" && ch.novo) out.push(ch.novo);
    });
    (opt.adicionados || []).forEach((a) => out.push(a));
    return out;
  }, [opt, original]);

  const suggestedTotals = useMemo(() => sumTotals(suggestedItems), [suggestedItems]);
  const goal = GOALS.find((g) => g.key === goalKey);

  return (
    <section className="result-section">
      <div className="result-header">
        <div className="result-eyebrow">
          <span className="dot"></span>
          Objetivo: {goal.label}
        </div>
        <h2>Sua refeição ajustada</h2>
        <p>Compare as opções abaixo e escolha a que se encaixa melhor.</p>
      </div>

      {options.length > 1 &&
      <div className="option-toggle">
          {options.map((o, i) =>
          <button
            key={o.letra}
            className={"option-tab" + (selectedOpt === i ? " active" : "")}
            onClick={() => setSelectedOpt(i)}>
              <span className="option-letter">Opção {o.letra}</span>
              {o.titulo && <span className="option-title">{o.titulo}</span>}
            </button>
          )}
        </div>
      }

      <div className="totals-comparison">
        <TotalsCard totals={originalTotals} title="Refeição original" />
        <div className="swap-arrow">
          <div className="swap-arrow-inner">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
          </div>
        </div>
        <TotalsCard totals={suggestedTotals} title={"Opção " + opt.letra} accent="sage" compareTo={originalTotals} />
      </div>

      <div className="changes-section">
        <div className="changes-title">Alterações item a item</div>
        <ul className="changes-list">
          {(opt.alteracoes || []).map((ch, i) =>
          <ChangeRow key={"c" + selectedOpt + "-" + i} change={ch} item={original[ch.indice_original]} />
          )}
          {(opt.adicionados || []).map((a, i) =>
          <AddedRow key={"a" + selectedOpt + "-" + i} item={a} />
          )}
        </ul>
      </div>

      {opt.justificativa &&
      <div className="justification">
          <div className="justification-text">{opt.justificativa}</div>
        </div>
      }

      <div style={{ textAlign: "center", marginTop: 36 }}>
        <button className="reset-btn" onClick={onReset}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
          Analisar outra refeição
        </button>
      </div>
    </section>);
}

// ---------- Loading ----------
function Loading() {
  const messages = [
  "Analisando o perfil da refeição…",
  "Buscando equivalências calóricas…",
  "Balanceando macronutrientes…",
  "Selecionando as melhores trocas…"];

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="loading">
      <div className="spinner"></div>
      <div className="loading-msg">{messages[idx]}</div>
    </div>);

}

// ---------- App ----------
function App() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [originalMeal, setOriginalMeal] = useState(null);
  const [goalKey, setGoalKey] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.body.classList.toggle("dense", t.density === "dense");
  }, [t.density]);

  const handleAnalyze = async (items, goal) => {
    setOriginalMeal(items);
    setGoalKey(goal);
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const r = await getMealSuggestion(items, goal);
      setResult(r);
    } catch (e) {
      console.error(e);
      setError("Não consegui analisar a refeição agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setOriginalMeal(null);
    setGoalKey(null);
    setResult(null);
    setError(null);
    setLoading(false);
  };

  const showBuilder = !loading && !result && !error;

  return (
    <div className="app">
      <Header onReset={handleReset} />
      <main className="container">
        {showBuilder && <Builder onAnalyze={handleAnalyze} />}

        {loading && <Loading />}

        {error &&
        <div style={{ maxWidth: 720, margin: "32px auto 0" }}>
            <div className="error-card">{error}</div>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="reset-btn" onClick={handleReset}>← Voltar</button>
            </div>
          </div>
        }

        {result && originalMeal && !loading &&
        <Result original={originalMeal} result={result} goalKey={goalKey} onReset={handleReset} />
        }
      </main>
      <footer className="footer">
        Helper das refeições · <em>alterações inteligentes para o dia a dia</em>
      </footer>

      <TweaksUI t={t} setTweak={setTweak} />
    </div>);

}

function TweaksUI({ t, setTweak }) {
  const { TweaksPanel, TweakSection, TweakRadio, TweakText, TweakButton } = window;
  if (!TweaksPanel) return null;
  const [testStatus, setTestStatus] = useState(null);

  // Mantém o localStorage (lido pelo fatsecret.js) em sincronia com o tweak
  useEffect(() => {
    if (window.fatsecret) window.fatsecret.setProxyUrl(t.proxyUrl || "");
    setTestStatus(null);
  }, [t.proxyUrl]);

  const testConnection = async () => {
    setTestStatus({ kind: "loading" });
    const r = await window.fatsecret.healthCheck();
    setTestStatus(r.ok ?
    { kind: "ok", msg: "Conectado à FatSecret" } :
    { kind: "err", msg: r.reason || "Falha de conexão" });
  };

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="FatSecret API">
        <TweakText
          label="URL do proxy"
          value={t.proxyUrl || ""}
          placeholder="https://...workers.dev"
          onChange={(v) => setTweak("proxyUrl", (v || "").trim())} />
        
        <TweakButton
          label={testStatus?.kind === "loading" ? "Testando…" : "Testar conexão"}
          onClick={testConnection}
          secondary />
        
        {testStatus && testStatus.kind !== "loading" &&
        <div className={"twk-status " + testStatus.kind}>{testStatus.msg}</div>
        }
        <div className="twk-hint">Sem URL, o app usa a base local de ~40 alimentos.</div>
      </TweakSection>
      <TweakSection title="Visual">
        <TweakRadio
          label="Densidade"
          value={t.density}
          onChange={(v) => setTweak("density", v)}
          options={[
          { value: "comfortable", label: "Confortável" },
          { value: "dense", label: "Compacto" }]
          } />
        
      </TweakSection>
    </TweaksPanel>);

}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);