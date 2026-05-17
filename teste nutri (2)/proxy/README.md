# Proxy FatSecret — Nutri Stael

Por que existe: a FatSecret API não pode ser chamada direto do navegador (sem CORS, requer OAuth com client_secret que não pode ser exposto). Este proxy fica entre o app e a FatSecret.

## Deploy rápido — Cloudflare Workers

```bash
npm i -g wrangler
wrangler login
# crie wrangler.toml (veja exemplo abaixo)
wrangler secret put FATSECRET_CLIENT_ID       # cole seu client_id
wrangler secret put FATSECRET_CLIENT_SECRET   # cole sua client_secret (a NOVA, após rotação!)
wrangler deploy
```

### wrangler.toml

```toml
name = "nutri-stael-fatsecret"
main = "fatsecret-worker.js"
compatibility_date = "2024-09-01"
```

Após o `wrangler deploy` você recebe uma URL tipo:
`https://nutri-stael-fatsecret.SEU-USUARIO.workers.dev`

## Configurar no app

1. Abra o Nutri Stael
2. Clique no toggle **Tweaks** (canto inferior direito)
3. Cole a URL no campo **URL do proxy FatSecret**
4. Comece a buscar — o autocomplete agora puxa do banco da FatSecret

Sem URL configurada, o app continua funcionando com a base local de ~40 alimentos.

## Painel FatSecret

No painel de desenvolvedor da FatSecret:
- **Desative IP restriction** OU adicione um range amplo (workers têm IP dinâmico)
- Garanta que o scope `basic` está habilitado para o seu app

## Endpoints

| GET                              | Faz                                |
|----------------------------------|------------------------------------|
| `/search?q=<termo>&max=10`       | `foods.search`                     |
| `/food/<food_id>`                | `food.get.v4`                      |
| `/health`                        | Status do proxy                    |

## Segurança

- `CLIENT_SECRET` fica **apenas** como secret do Worker — nunca no front
- Token OAuth é cacheado em memória do isolate, renovado a cada hora
- CORS aberto (`*`) porque é dev. Em produção, restrinja ao seu domínio.
