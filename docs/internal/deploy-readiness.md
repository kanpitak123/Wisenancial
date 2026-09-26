# Deploy readiness audit (Phase 4)

Date: 2026-09-27 · Investigation only, no code changed. Read at commit `97ec5e7` (main). No `.env` value was read; env findings come from the code and from `.env.production.example`. Prices below are rough, from memory, and must be re-checked before buying anything.

## Verdict

Not ready to go live. The application code is in good shape (CI, 1,050+ backend tests, health check, CORS and cookie rules that fail closed), but there is **no way to send email, no deploy definition at all (no Dockerfile / Procfile / start-up steps), the rate limiter would collapse behind a proxy, user uploads live on local disk, and a database dump with user rows is committed to git.** Those are fixable in days, not weeks. Section 7 is the ordered list.

## 1. Environment

**Fail-fast in production today**

| Check | Behaviour |
|---|---|
| `CORS_ORIGINS` / `FRONTEND_URL` | Boot fails if unset in production; boot fails if it contains `*`. Same list is used by the two WebSocket gateways. Good. |
| `JWT_ACCESS_SECRET` | Boot fails if missing (`auth.module.ts` factory). |
| `DATABASE_URL` | Boot fails (`$connect` in `PrismaService.onModuleInit`). |
| `MAIL_TRANSPORT` | Boot fails only for an *unknown* name. |

**Does not fail fast (should)**

- `JWT_REFRESH_SECRET`: read lazily on first refresh/login, so the server boots and then returns 500s on login.
- `STRIPE_SECRET_KEY`: only a warning; `STRIPE_WEBHOOK_SECRET` defaults to `''`. Payments silently off/broken.
- `ANTHROPIC_API_KEY` (+ `ANTHROPIC_WORKSPACE_ID` for a non-workspace key, `AI_MODEL_FAST`, `AI_MODEL_SMART`): missing = every AI feature returns 503 at request time.
- `MAIL_TRANSPORT`: defaults to `console`, which in production logs "email NOT sent" and drops the message.
- No schema validation of env at all (`ConfigModule.forRoot({ isGlobal: true })`, no `validate`); no minimum length/entropy check on the JWT secrets. Recommend one `assertProductionEnv()` at boot listing every missing/invalid variable at once.

**Code vs `.env.production.example`**

- Read by code, missing from the example: `EXPORT_THROTTLE_LIMIT`, `EXPORT_THROTTLE_TTL_SECONDS` (optional tuning).
- In the example, not read as `process.env` in code: `DATABASE_URL`, `DIRECT_URL` (read by Prisma's `env()`, fine), `AI_MODEL_FAST/SMART` (read through a dynamic key, fine). Nothing is genuinely unused.
- Stale text: the example still says `DATABASE_URL` is a **Supabase** pooler on port 6543; the database is Neon (use the pooled `-pooler` host for `DATABASE_URL` and the direct host for `DIRECT_URL`).
- Frontend example documents `VUE_ROUTER_MODE` / `VUE_ROUTER_BASE`, but `quasar.config.ts` hard-codes `vueRouterMode: 'hash'`; those two variables do nothing.

## 2. Security

| Item | State |
|---|---|
| Security headers (helmet) | **Missing.** No helmet, no HSTS/CSP/X-Frame-Options/nosniff from the app. Can be added at the proxy/CDN, but nothing does it now. |
| CORS | Explicit origins, `credentials: true`, production requires the variable. Good. |
| Cookies | Refresh cookie: `httpOnly`, `Secure` and `SameSite=None` in production, path-scoped to `/auth`. Good (needs HTTPS end to end). |
| `trust proxy` | **Not set.** Behind any load balancer `req.ip` is the proxy's IP, so the global 120 req/min limit and the per-IP auth limits are shared by *all users*. One busy minute locks everyone out. |
| Rate limits | Global `ThrottlerGuard` (default 120/min, env-tunable), stricter auth, export and MT5-ingest limits. Storage is **in memory**: per instance, reset on every deploy. |
| Body limits | Express default (100 kb JSON); MT5 ingest has its own raised limit; screenshot upload capped at 5 MB. `rawBody: true` for the Stripe webhook. Fine. |
| Swagger | `/api` serves Swagger UI unauthenticated in every environment. Gate it in production. |
| Validation | Global `ValidationPipe` (whitelist + forbid). Now covered for the AI DTOs by a test (the recent `/ai/analyze` 400 was exactly this pipe). |
| Secrets in git | **`tradingjournal-backend/backup.sql` is tracked** (commit `bf28dc9`) and contains a `pg_dump` with a `users` table (4 rows: emails and password hashes) plus trades/portfolios. It is on the GitHub remote. Local `.env.backup-*` / `.env.pre-3k-backup` files are git-ignored (`.env.*`) but sit in the working directory. |
| PII in logs | A grep for logger calls that include email/password/token found none; the account-purge job logs counts only. Good. Local `*.log` files (9.8 MB `backend-dev.log`) are git-ignored but should not ship in an image. |

## 3. Run

- **Start:** `npm run build` then `npm run start:prod` (`node dist/src/main`). Port from `PORT`. Works.
- **Migrations:** `prisma migrate deploy` is not wired anywhere. **`prisma` is a devDependency**, and `postinstall` runs `prisma generate`; a production install (`--omit=dev`) breaks both. Move `prisma` (pinned 6.19.2) to dependencies or build in a stage that has dev deps. Run `migrate deploy` as a release step against `DIRECT_URL` before the new version takes traffic.
- **Node:** CI uses 22, local is 22.22, but no `engines`, `.nvmrc` or image pin. `@types/node` is 26. Pin Node 22 LTS.
- **Deploy files:** none (no Dockerfile, Procfile, render/fly/railway config).
- **Health check:** `GET /health` exists, unauthenticated, runs `SELECT 1`, returns 503 when the DB is down, reports `APP_VERSION`. Good. Use it as the platform check.
- **Graceful shutdown:** none. No `enableShutdownHooks()`, no `$disconnect()`. A redeploy kills in-flight requests (an AI call can take up to a minute) and leaves Neon connections to time out.
- **Static/uploads:** `/uploads` is served from the local `uploads/` directory (post images, share images) and `data/` is written locally. Ephemeral disk on most hosts means these vanish on every deploy. Use object storage, or a persistent volume with a single instance.
- **Logging:** Nest default logger to stdout (fine for any platform). Sentry is wired but the SDK is not installed (documented in the code), so no error tracking.
- **CI:** backend tsc + jest, frontend vue-tsc + vitest + build. Backend lint is non-blocking (known issues). No deploy job.

## 4. Crons and more than one instance

| Job | Schedule | Guard | Safe with N > 1? |
|---|---|---|---|
| Forex calendar sync (+ classifier/enrichment) | every 5 min | in-memory flag | Runs N times: duplicate provider/AI calls; DB writes are upserts. |
| Investor news sync (up to 20 AI enrichments) | hourly | in-memory flag | Runs N times: N× NewsAPI quota (100/day free) and N× AI spend. |
| Guardrails second pass (flag off) | every 10 min | in-memory flag; daily budget read from DB | Race: two instances can both pass the budget check and exceed the cap or double-analyse an item. |
| Account purge | 03:00 daily | in-memory flag; conditional `deleteMany` | Idempotent and safe, repeats the Stripe lookups. |
| Finnhub holdings sync | every 30 min | none | Skipped without `FINNHUB_API_KEY` (host is blocked in this environment anyway). |

Also single-instance by design: in-memory throttler, Yahoo/price caches (5 min to 12 h), and the socket.io gateways (chat, news feed; no Redis adapter, no sticky-session note). **Run exactly one backend instance** until cron jobs take a Postgres advisory lock (`pg_try_advisory_lock`) and the throttler/socket state move to shared storage. One instance is enough for launch.

## 5. Frontend

- **Build:** `quasar build` (also runs ESLint); works in CI and locally. Output is a static SPA.
- **API URL:** `VITE_API_URL` at build time. If it is missing the bundle **silently falls back to `http://localhost:3000`**: a production build with the variable forgotten ships a broken site. Make the production build fail when it is unset.
- **Mock mode:** off by default; `VITE_MOCK_MODE` / `VITE_ENABLE_MOCK_MODE` must stay unset in production (documented, and the toggle is not rendered unless enabled).
- **Routing:** hash mode is hard-coded, so deep links and refresh work on any static host with no rewrite rule (URLs contain `#`). If pretty URLs are wanted, wire `VUE_ROUTER_MODE` in `quasar.config.ts` and add a rewrite to `index.html` on the host.
- **404:** in hash mode the host never sees deep paths; unknown hashes hit the app's own `ErrorNotFound` route.
- **Cache headers:** nothing configured. Set `index.html` to `no-cache` and hashed `/assets/*` to `public, max-age=31536000, immutable` on the host/CDN.
- **Uncommitted:** `quasar.config.ts` has a local, dev-only `allowedHosts: true` (tunnel sharing). It does not affect production builds; do not commit it as-is.

## 6. Hosting options (backend + frontend, near Neon `us-east-1`)

All keep the backend at **one instance** (section 4). Estimates are rough monthly USD, excluding Neon, Anthropic and Stripe fees.

| | A. Render | B. Fly.io + Cloudflare Pages | C. AWS (Lightsail/EC2 us-east-1 + S3/CloudFront) |
|---|---|---|---|
| Backend | Web service, Virginia. Starter 512 MB ≈ $7; Standard 2 GB ≈ $25 | Docker on `iad`, shared-cpu 512 MB–1 GB ≈ $4–8 | Lightsail 1 GB ≈ $7–10 (or EC2 t4g.small ≈ $12) |
| Frontend | Static site + CDN, ≈ $0 | Cloudflare Pages ≈ $0 | S3 + CloudFront ≈ $1–3 |
| Uploads | Persistent disk ≈ $0.25/GB (single instance) | Fly volume ≈ $0.15/GB (single instance) | S3 ≈ $1 (or the instance disk) |
| Deploy | Git push; managed TLS; no Docker needed (build/start commands) | `fly deploy` from a Dockerfile (needs writing) | Manual/Docker Compose; most ops work |
| Total | **≈ $8–26** | **≈ $5–10** | **≈ $9–16** |
| Fits when | You want the least ops | You want cheapest and don't mind a Dockerfile | You already live on AWS |

Notes that apply to all: (1) Neon in `us-east-1` is about 250 ms from Thailand; if the users are mostly Thai, consider moving Neon and the backend to Singapore later (same platforms have a Singapore region). (2) Use a paid Neon plan for production (automatic suspend on the free tier adds cold-start delay, and history/backup limits are small), roughly $5–20 usage-based. (3) Do not put the frontend on a "hobby/non-commercial" tier (e.g. Vercel Hobby); Cloudflare Pages and Render static are fine commercially. (4) Yahoo (`yahoo-finance2`) is unofficial and often rate-limits datacenter IPs; expect some price/fundamental gaps after moving off a home connection.

## 7. Blockers to go live (priority order)

**P0, cannot launch without**

1. **No email sending.** Only a console mailer exists; production drops verification and password-reset emails. Add a real transport (Resend/SES/Postmark), DNS (SPF/DKIM), then turn on `REQUIRE_VERIFIED_EMAIL_FOR_AI`.
2. **`backup.sql` in git history** with user rows and password hashes. Remove the file, decide on a history purge (or confirm the repo is private and the 4 accounts are test data), and rotate anything that was ever in it.
3. **`trust proxy`.** Without it the rate limiter treats all users as one IP. One line, plus a test.
4. **A defined deploy**: move `prisma` to dependencies, add the `migrate deploy` release step, pin Node 22, add the Dockerfile/Procfile for the chosen host.
5. **Boot-time env validation** for production (JWT secrets incl. refresh, Stripe key + webhook secret, Anthropic key/workspace/model ids, mail transport, `CORS_ORIGINS`, `API_PUBLIC_URL`), and fix the stale Supabase text in the example.
6. **Uploads off local disk** (object storage, or a persistent volume on a single instance).
7. **Frontend build must fail without `VITE_API_URL`**, and set cache headers.

**P1, first week**

8. Security headers (helmet or at the proxy: HSTS, nosniff, frame-ancestors), hide Swagger in production.
9. Graceful shutdown (`enableShutdownHooks`, `$disconnect`), and a Sentry SDK install for error tracking.
10. Stripe live mode: live keys, webhook endpoint registered, the four price ids, one real end-to-end payment test; billing/legal pages reviewed.
11. Neon paid plan, backups/PITR checked with an actual restore drill.
12. Decide on the AI go-live switches (all currently off): `NEWS_CLASSIFIER_ENABLED`, `NEWS_GUARDRAILS_ENABLED`; set a monthly Anthropic spend cap in the console.

**P2, before scaling past one instance**

13. Postgres advisory locks for the crons; shared throttler storage; socket.io Redis adapter and sticky sessions.
14. Lint gate (currently non-blocking), a staging environment, and an uptime monitor on `/health`.
15. Re-check the unofficial data sources (Yahoo, NewsAPI free quota, Finnhub blocked) under real traffic.
