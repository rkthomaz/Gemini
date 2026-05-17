# Proxy FatSecret — Cloudflare Pages Functions

Pra usar com `testenutri.pages.dev` (ou qualquer outro projeto Cloudflare Pages).

## Estrutura

A pasta `functions/` deve ficar na **raiz do projeto Pages**:

```
seu-projeto-pages/
├── index.html              ← seu site (se já tem)
└── functions/
    └── [[catchall]].js     ← este proxy
```

## Deploy via Dashboard (sem terminal)

1. Vá em [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
2. Abra seu projeto **testenutri**
3. Vá em **Settings → Environment variables → Production**
4. Adicione 2 variáveis **do tipo Secret**:
   - `FATSECRET_CLIENT_ID` = seu client_id
   - `FATSECRET_CLIENT_SECRET` = a nova secret (após rotação!)
5. Faça upload da pasta `functions/` na raiz do projeto:
   - Direct upload: arraste `functions/[[catchall]].js` mantendo a estrutura
   - **Git connected**: faça commit da pasta no seu repo, o Pages publica automaticamente
6. Aguarde o build/deploy terminar

## Testar

Abra no browser:
```
https://testenutri.pages.dev/health
```
Deve responder `{"ok": true, ...}`.

Depois teste a busca:
```
https://testenutri.pages.dev/search?q=banana
```
Deve voltar um JSON com `foods_search.results.food`.

## Configurar no app Nutri Stael

Abra o app → Tweaks (canto inferior direito) → cole no campo **"URL do proxy"**:
```
https://testenutri.pages.dev
```
(sem barra no final)

Clique em **"Testar conexão"**. Deve aparecer "Conectado à FatSecret".

## Painel FatSecret

No painel de desenvolvedor:
- **Desative IP restriction** (Cloudflare usa IPs dinâmicos)
- Confirme que seu app tem scope `basic` habilitado

## Endpoints expostos

| GET                          | Faz                  |
|------------------------------|----------------------|
| `/search?q=<termo>&max=10`   | `foods.search`       |
| `/food/<food_id>`            | `food.get.v4`        |
| `/health`                    | Status do proxy      |
