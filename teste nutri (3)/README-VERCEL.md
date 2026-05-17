# Deploy no Vercel — Nutri Stael

App estático + 1 serverless function que chama o Google Gemini.

## O que você precisa

- Conta no Vercel (grátis) — [vercel.com/signup](https://vercel.com/signup)
- Chave da API do Gemini — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

## Deploy em 3 passos

### 1. Suba os arquivos
Duas formas:

**A) Via Git (recomendado)**
- Suba esta pasta inteira pra um repositório no GitHub
- No Vercel: New Project → Import → escolha o repo → Deploy

**B) Via Vercel CLI**
```bash
npm i -g vercel
cd <esta-pasta>
vercel
# siga as perguntas (defaults estão ok)
```

### 2. Configure a Environment Variable
No painel do projeto Vercel:
- **Settings → Environment Variables**
- Adicione:

| Name              | Value                                | Environment |
|-------------------|--------------------------------------|-------------|
| `GEMINI_API_KEY`  | sua chave do Google AI Studio        | Production, Preview, Development |
| `GEMINI_MODEL`    | `gemini-2.5-flash` *(opcional)*      | Production  |

- Clique em **Save**
- Vá em **Deployments** → no último deployment, clique **Redeploy** (pra a env var entrar)

### 3. Acesse
A URL final será algo como `https://teste-nutri-XXX.vercel.app`

## Estrutura

```
.
├── index.html              # redireciona pra Nutri Stael.html
├── Nutri Stael.html        # entrada principal
├── app.jsx                 # componentes React
├── styles.css
├── foods.js                # base local de alimentos
├── fatsecret.js            # cliente do proxy FatSecret (opcional)
├── tweaks-panel.jsx
├── vercel.json
└── api/
    └── analyze.js          # ← serverless function que chama o Gemini
```

## Como funciona

1. Front chama `POST /api/analyze` com `{ prompt: "..." }`
2. `api/analyze.js` adiciona a system instruction da Nutri Stael e chama o Gemini
3. Resposta volta como `{ text: "..." }` — front parseia o JSON

A chave do Gemini **fica só no servidor** (env var). Nunca é exposta ao browser.

## Modelo padrão

Está usando `gemini-2.5-flash`. Pra trocar, basta setar a env var `GEMINI_MODEL`:
- `gemini-2.5-flash-lite` — mais barato/rápido
- `gemini-2.5-pro` — mais inteligente
- `gemini-2.0-flash` — versão anterior estável

## Local dev

```bash
npm i -g vercel
vercel dev
```
Abre http://localhost:3000 com `/api/analyze` funcionando localmente (usa as env vars do `.env.local`).

Crie um `.env.local`:
```
GEMINI_API_KEY=sua_chave_aqui
```

## FatSecret (opcional)

O proxy FatSecret continua independente — pode rodar nos seus Workers/Pages atuais (`stael.rkthomaz2.workers.dev`). Cole a URL nos Tweaks do app. Sem proxy, o autocomplete usa apenas os ~40 alimentos da base local.
