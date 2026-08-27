# Wisenancial — สถานะก่อนเปิดใช้งานจริง

**ตรวจเมื่อ**: 2026-08-28 (ชื่อไฟล์ใช้ตามที่ Rem ระบุ)
**แทนที่**: รายงานวันที่ 2026-08-20 (`9f77156` เป็น commit สุดท้ายที่รายงานนั้นเห็น)
**ขอบเขต**: ไล่ commit 17 ตัวหลัง `9f77156` + ตรวจสถานะจริงของข้อที่ Rem ระบุมาทีละข้อ

> **ข้อจำกัดที่ต้องรู้ก่อนอ่าน**: รายงานฉบับ 2026-08-20 ไม่ได้อยู่ในรีโป (`git log` ยืนยันว่าไฟล์ `.md` ในโปรเจกต์มีแค่ `AGENTS.md`, `README.md`, `ai-prompt-audit.md`) ผมจึงไม่เห็นรายการเต็มของกลุ่ม A–E เดิม
> สิ่งที่ตรวจได้จริงคือ **ข้อที่ Rem พิมพ์มาในคำสั่งนี้** บวกกับสิ่งที่เจอเพิ่มเองตอนไล่โค้ด ข้ออื่นที่เคยอยู่ในรายงานเดิมแต่ไม่ได้ระบุมา = **ไม่มีข้อมูล ไม่ได้ตรวจ** ไม่ได้แปลว่าปิดแล้ว
> ไฟล์นี้ไม่มีค่าคีย์หรือรหัสผ่านใด ๆ มีแต่ผลการตรวจ

สัญลักษณ์: ✅ ปิดแล้ว (มีหลักฐาน) · 🔴 ยังเปิดอยู่ (มีหลักฐาน) · ⬜ ยังไม่ตรวจ

---

## 1. commit ที่เกิดขึ้นหลังรายงานเดิม (17 ตัว)

### กลุ่ม UI/UX — เปลี่ยนโครงหน้าจอ

| commit | ทำอะไรจริง |
|---|---|
| `4b3016c` | **Share card**: เพิ่ม QR code (ชี้ landing page ไม่ใช่ `/profile/:username` เพราะอันนั้นอยู่หลัง `JwtAuthGuard` คนสแกนจะเจอหน้า login) + กราฟ Monthly Momentum ฝั่ง Trader (P&L สะสมรายวัน ใช้ `analyticsStore.dailyPnl` ตัวเดียวกับตัวเลขบนการ์ด) ปิด animation ของ Apex เพื่อให้ html2canvas จับภาพครบ เพิ่ม dependency `qrcode` |
| `b7dfb6c` | **ลบหน้า Monthly Movers ทั้งเส้น**: ลบ page+spec, `volatility.service.ts`, `volatility.types.ts`, route, nav entry, Cmd+K command, mock route ฝั่ง backend ลบ `@Get('movers')` + helper + seed + types (`getHeatmap()`/`getSentiment()` ไม่ถูกแตะ Market Pulse ยังใช้อยู่) bookmark เก่าตกไป ErrorNotFound |
| `60a1a1f` | **ลบ left drawer ทั้งอัน** เปลี่ยนเป็น floating bottom dock — 6 ลิงก์ `primary` อยู่บน dock ที่เหลืออยู่ใน sheet "More" ย้าย brand/logo + workspace tag ขึ้น header ย้าย Leaderboard/Missions ลงท้าย sheet เพิ่ม **`AiQuotaBadge`** บน header (เดิมเครดิต AI มองไม่เห็นจนกว่าจะโดนปฏิเสธ) `WorkspaceNavLink` มี flag `paid` แล้วแต่ยังไม่มีลิงก์ไหนใช้ ลบ `EssentialLink.vue` |
| `65eb2e9` | **News 3 คอลัมน์ → 2**: รางซ้าย/ขวาเดิมเป็น widget เหมือนกันทั้งคู่ ยุบรวมเป็นคอลัมน์เดียว ฟีดได้ที่เหลือทั้งหมด max-width 1440→1760px จอแคบพลิกคอลัมน์ซ้ายเป็น scroll rail แนวนอน แตะแต่ markup ไม่แตะ handler (มี `NewsPage.layout.spec.ts` 204 บรรทัดคุมไว้) |
| `ac49e55` | **Watchlist rails + สมดุลหุ้นไทย**: 4 หมวด radar เป็นรางเลื่อนแนวนอน (`ScrollRail`) ลบปุ่ม "View all" และการตัดเหลือ 4 ตัว · **seed หุ้นไทยเพิ่ม 57 ตัว (44 → 101)** เทียบ US 95 ตัว · `/stocks/radar` เดิมวนบน `LISTING_SEED` 27 ตัวตายตัว หุ้นที่ seed เข้ามาไม่เคยโผล่เลย เปลี่ยนไปอ่าน DB แบบ `/stocks/listing` พร้อมโควตา 18 ตัว/ตลาด (เพราะยิง Yahoo 1 ครั้ง/หุ้น ไม่มีแคช) |
| `6d6d180` | **Stock Terminal head bar 3 โหมด** (Explore / ไทย / US) บนแผงซ้าย — ยืนยันก่อนว่า `/stocks/popular` และ `/stocks/popular-th` live ทั้งคู่ ไม่ใช่ dead code (คนละหน้าใช้) |
| `0ed180f` | **ยกเลิกของใน `6d6d180`**: ลบแผงซ้าย 290px ทิ้งทั้งอัน ย้าย 3 โหมดไปเป็น tab ของการ์ด "Popular Stocks" ใต้กราฟ กราฟได้ความกว้างเต็มหน้า ลบ `PopularStocksPanel.vue` เพิ่ม error state + retry ให้ Popular Stocks และให้ `StockTerminalPage` หา default symbol เองผ่าน `stocksService.list()` |

### กลุ่ม AI — 7 เฟสตาม `ai-prompt-audit.md`

`c3c30aa` · `7c05ad5`+`5c39d8e` · `24daaa9` · `2119e75` · `77bb3d1` · `67e61ab`+`ce3b70e` · `07d66e8` · `1eb23dc`

รายละเอียดครบอยู่ในหัวข้อ **"สิ่งที่ทำไปแล้วจริง"** ท้ายไฟล์ `ai-prompt-audit.md` ไม่เขียนซ้ำที่นี่ สรุปผลกระทบต่อการเปิดใช้งานจริง:

- ทุก endpoint AI มี guardrail "ไม่ใช่คำแนะนำการลงทุน" แล้ว + มี disclaimer บน UI 4 จุด → **ลดความเสี่ยงด้านกฎเกณฑ์ลงมาก** (เดิมมีจุดเดียวจาก 8 จุด)
- AI Picks เลิกให้โมเดลนึกหุ้นเอง ใช้ candidate list จริงจาก Yahoo + ตัดหุ้นนอกลิสต์ทิ้งฝั่งเซิร์ฟเวอร์
- AI Risk Analysis เลิกตัดสินจาก field ที่เป็น `null` เสมอ
- เพดาน token ขยับขึ้นทุกจุด กันคำตอบโดนตัดกลางคันแล้วเสียเครดิตฟรี

---

## 2. กลุ่ม A — Blocking

### A1. Auth: อายุ access token — ✅ ปิดแล้ว

`.env` → `JWT_ACCESS_EXPIRES_IN=900` (15 นาที) **ไม่ใช่ 7 วันแล้ว**
`JWT_REFRESH_EXPIRES=2592000` (30 วัน) ตรงกับค่า default ในโค้ด (`auth.constants.ts:3-4` = `15m` / `30d`)

### A2. Auth: revoke refresh token ได้จริงไหม — ✅ ปิดแล้ว

`refresh-token.service.ts` ทำครบกว่าที่รายงานเดิมกังวล:
- เก็บเป็น **hash** ไม่ใช่ token ดิบ (`token_hash`, `:73`)
- **rotation จริง** — ใช้แล้วเผาทิ้งออกใบใหม่ในสายเดิม (`rotate()`, `:90`)
- **reuse detection** — เจอ token ที่ใช้ไปแล้ว/ถูก revoke แล้วถูกนำมาใช้ซ้ำ = มีสำเนาหลุด → `revokeFamily()` ล้างทั้งสายทั้งของเจ้าตัวและของคนขโมย (`:105-136`)
- `POST /auth/logout` ไม่ต้องผ่าน guard โดยตั้งใจ (`auth.controller.ts:80`) — คนที่ access token หมดอายุแล้วต้อง revoke ได้ ไม่ใช่ค้าง 30 วัน
- มี `refresh-token.service.spec.ts` (9.4K) คุมไว้

### A3. Auth: rate limit บน `/auth/refresh` — 🔴 ยังเปิดอยู่ (บางส่วน)

มี throttle **ระดับ global** แล้ว: `app.module.ts:45-50` + `APP_GUARD` (`:80`) → ทุก endpoint รวม `/auth/*` ถูกจำกัดอัตโนมัติ
**แต่ค่าเริ่มต้นคือ `THROTTLE_LIMIT=120` ต่อ `THROTTLE_TTL_SECONDS=60`** และ `/auth/login`, `/auth/refresh`, `/auth/register` **ไม่มี `@Throttle` เฉพาะจุดที่รัดกว่านั้นเลย** (grep แล้วไม่พบ `@Throttle` ที่ไหนในโค้ด)

แปลว่าเดา password ได้ **120 ครั้ง/นาที ต่อ IP** — หลวมเกินไปสำหรับ endpoint ที่รับ credential คอมเมนต์ในโค้ดเองก็เขียนไว้ว่า "จะรัดให้แน่นขึ้นตอนขึ้นจริงก็แก้ที่ env" ซึ่งยังไม่ได้ทำ และการแก้ที่ env จะรัดทั้งระบบรวมหน้า Dashboard ที่ยิงหลาย endpoint พร้อมกันด้วย

**สิ่งที่ควรทำ**: ใส่ `@Throttle` เฉพาะ `login`/`register`/`refresh` (เช่น 5–10 ครั้ง/นาที) แยกจาก limit ทั่วไป ไม่ใช่ไปกด `THROTTLE_LIMIT` รวม

### A4. `.env`: ANTHROPIC_API_KEY — 🔴 ยังเปิดอยู่ (เจอสาเหตุแล้ว)

ตรวจโดยดูความยาว+รูปแบบนำหน้า ไม่ได้เอาค่าไปใช้ที่ไหน:

| ช่อง | ความยาว | รูปแบบ | ผล |
|---|---|---|---|
| `GEMINI_API_KEY` | 39 | `AIza…` | ถูกต้องตามรูปแบบ Google |
| `GROQ_API_KEY` | 56 | `gsk_…` | ถูกต้องตามรูปแบบ Groq |
| `OPENAI_API_KEY` | 164 | `sk-proj-…` | รูปแบบถูกต้อง |
| `ANTHROPIC_API_KEY` | 56 | **`gsk_…`** | **ผิดช่อง — เป็นคีย์รูปแบบ Groq ไม่ใช่ Anthropic** |

**นี่คือสาเหตุที่ Anthropic ใช้ไม่ได้ ไม่ใช่คีย์หมดอายุ** — คีย์ Anthropic ขึ้นต้นด้วย `sk-ant-` และยาวกว่านี้มาก มีคนวางคีย์ Groq ลงช่อง Anthropic

**ผลกระทบต่อผู้ใช้**: `ai-manager.service.ts:90-97` กรองโมเดลด้วย `isConfigured()` ซึ่งดูแค่ว่า "มีค่าไหม" ไม่ได้ดูว่าใช้ได้จริงไหม → **โมเดล Claude จะโผล่ในตัวเลือกให้ผู้ใช้กด แล้วพังทุกครั้ง** (ข่าวดี: provider โยน error ก่อนถึงขั้นคิดเครดิต ผู้ใช้จึงไม่เสียเครดิตฟรี แต่เห็น error เปล่า ๆ)

### A5. `.env`: OPENAI quota — ⬜ ยังไม่ตรวจ

รูปแบบคีย์ถูกต้อง (`sk-proj-`, 164 ตัว) แต่ **สถานะโควตาตรวจจากรูปแบบไม่ได้** ต้องยิง API จริงถึงจะรู้ ยังไม่ได้ทำ
ถ้าโควตายังหมดอยู่ ผลกระทบเหมือน A4 — GPT-4o โผล่ในตัวเลือกแล้วพัง

### A6. `.env`: บรรทัด `JWT_SECRET=` ค้าง — ✅ ปิดแล้ว

`grep "^JWT_SECRET" .env` → ไม่พบ เหลือแค่ `JWT_ACCESS_SECRET` (128 ตัว) กับ `JWT_REFRESH_SECRET` (128 ตัว) ซึ่งยาวพอ

### A7. QA test user ค้างใน Supabase — ✅ ปิดแล้ว (บัญชีที่ระบุ) / 🔴 มีตัวอื่นค้างอยู่

ยิง Prisma เข้า Supabase `oheqnzvujkmtemgubhnz` จริง ตาราง `users` มี **4 แถวทั้งหมด**:

| id | email | tier |
|---|---|---|
| 2 | `test@gmail.com` | — |
| 6 | `tester@gmail.com` | PACK_279 |
| 10 | `qa@wisenancial.test` | PACK_279 |
| 11 | `qafree@wisenancial.test` | — |

- `qa_inv_1786912308@example.com` และ `qa_tr_*` ที่รายงานเดิมระบุ — **ไม่มีแล้ว ลบเรียบร้อย** (ค้นด้วย `qa_inv_`, `qa_tr_`, `@example.com` = 0 แถว)
- แต่ยังเหลือ **4 บัญชีทดสอบ ซึ่งคือทั้งตาราง** — `id 6` กับ `id 10` เป็น **PACK_279 (จ่ายเงินแล้ว) ที่ไม่ได้จ่ายเงินจริง**
- `test@gmail.com` / `tester@gmail.com` เป็นโดเมนจริงที่คนอื่นอาจเป็นเจ้าของ ไม่ควรค้างในโปรดักชัน

**หมายเหตุ**: `qa@wisenancial.test` เป็นบัญชี QA ที่ยังใช้ทดสอบอยู่ (มีบันทึกรหัสไว้) ถ้าจะลบต้องรู้ตัวว่าจะเสียบัญชีทดสอบไปด้วย

### A8. Share card (chart + QR) "verify ผ่านแล้วรอ commit" — ✅ commit แล้ว

`4b3016c` (2026-08-21) — 5 ไฟล์ +704 บรรทัด รวม spec 191 บรรทัด **ไม่ได้ค้างอยู่**

### A9. Market Pulse "verify ผ่านแล้วรอ commit" — ✅ commit แล้ว (ตั้งแต่ก่อนรายงานเดิมด้วยซ้ำ)

`191b7bd` "merge Heatmap + Discover into a single Market Pulse page" + `5cf19c6` "keep long/short labels summing to 100%"
`git merge-base --is-ancestor` ยืนยันว่า **ทั้งสองตัวเป็นบรรพบุรุษของ `9f77156`** คือ landed ก่อนรายงาน 2026-08-20 จะถูกเขียนเสียอีก — รายงานเดิมน่าจะบันทึกสถานะข้อนี้ผิด

---

## 3. กลุ่ม B — Feature gaps

⬜ **ไม่มีรายการต้นทาง** — รายงาน 2026-08-20 ไม่ได้อยู่ในรีโปและ Rem ไม่ได้ระบุข้อในกลุ่มนี้มา จึงไม่รู้ว่าเดิมมีอะไรบ้าง **ไม่ตรวจ = ไม่รู้ ไม่ใช่ปิดแล้ว**

สิ่งที่ยืนยันได้จาก commit log ว่าเปลี่ยนไปในกลุ่มนี้:
- ✅ Share card ครบตามที่ตั้งใจ (`4b3016c`)
- ✅ หน้า Monthly Movers **ถูกตัดออกจากผลิตภัณฑ์** (`b7dfb6c`) — ถ้ารายงานเดิมมีข้อ "Monthly Movers ยังไม่เสร็จ" ให้ถือว่าตกไป ไม่ใช่ค้าง
- ✅ เครดิต AI มองเห็นได้ตลอดเวลาแล้วผ่าน `AiQuotaBadge` (`60a1a1f`)
- 🔴 `WorkspaceNavLink.paid` มี flag แต่ **ยังไม่มีหน้าไหนถูกทำเครื่องหมายว่าเป็นของ paid tier เลย** (`60a1a1f` เขียนไว้เองว่า "which pages are gated is a packaging decision") — ถ้าจะขายแพ็กเกจ ต้องตัดสินใจข้อนี้ก่อนเปิด

---

## 4. กลุ่ม C — Tech debt

### C1. backend eslint — 🔴 ยังเปิดอยู่ (ไม่ขยับเลย)

- `eslint.config.mjs` มีอยู่ (1.1K) **แต่**
- `package.json` ของ backend **ไม่มี script `lint`** (มีแค่ build/start/db:seed/test)
- **ไม่มี dependency ที่เกี่ยวกับ eslint เลยสักตัว** — `Object.keys(deps+devDeps).filter(/eslint|prettier/)` = `[]`
- `node_modules/@eslint/` ไม่มีอยู่จริง
- รันจริงแล้วล้มทันที: `Cannot find package '@eslint/js' imported from eslint.config.mjs`

**ผลตอนนี้**: ฝั่ง backend ไม่มี lint gate เลย มีแค่ `tsc` + `jest` (ซึ่งผ่านทั้งคู่) ฝั่ง frontend มี `npm run lint` ใช้งานได้ปกติ

### C2. NewsGateway ไม่มี auth — 🔴 ยังเปิดอยู่

`news.gateway.ts` ทั้งไฟล์มี 17 บรรทัด ไม่มี `OnGatewayConnection` ไม่มีการตรวจ token ใด ๆ

**เทียบกับ ChatGateway ซึ่งทำถูกแล้ว**: `chat.gateway.ts:42-79` ตรวจ JWT ตอน handshake, ระบุ `JWT_ACCESS_SECRET` ตรง ๆ, ตรวจ claim ครบชุด (`sub`/`email`/`username`/`role`) แล้ว disconnect ถ้าไม่ผ่าน

**ทำไมถึงสำคัญ**: `news.controller.ts:16` ใส่ `@UseGuards(JwtAuthGuard)` ทั้ง controller — ฝั่ง HTTP ต้องล็อกอิน แต่ WebSocket broadcast เนื้อหาชุดเดียวกัน (`new_news`, `news_data_changed`, **`news_ai_enriched`**) ให้ใครก็ได้ที่ต่อ socket เข้ามา **รวมข่าวที่ผ่าน AI enrichment ซึ่งเป็นของที่ระบบจ่ายเงินค่า LLM ไปแล้ว**
ข้อดีเล็กน้อย: gateway นี้ emit อย่างเดียว ไม่มี `@SubscribeMessage` จึงเขียนข้อมูลเข้าระบบไม่ได้ ความเสี่ยงคือ "อ่านฟรี" ไม่ใช่ "เขียนได้"

### C3. WebSocket CORS `origin: '*'` — 🔴 ยังเปิดอยู่ ทั้งสอง gateway

- `news.gateway.ts:5` → `cors: { origin: '*' }`
- `chat.gateway.ts:24-28` → `cors: { origin: '*' }`

**ตรงข้ามกับฝั่ง HTTP ซึ่งทำไว้ดีมากแล้ว** (`main.ts:20-47`): อ่านจาก `CORS_ORIGINS` → ถอยไป `FRONTEND_URL` → **ตอน production ถ้าไม่ตั้งจะไม่ยอม boot** และ **ปฏิเสธ `'*'` เพราะเปิด credentials อยู่**
กติกาที่ตั้งใจไว้ทั้งหมดนั้นถูกข้ามไปโดย gateway ทั้งสองตัว

---

## 5. กลุ่ม D — Production infra

### D1. ตัวที่มีแล้ว — ✅

- `HealthModule` + `health.controller.ts` มี `@Get()` (มาจาก `5e10fb0`)
- `MonitoringModule` + `monitoring.service.ts` + spec
- `ThrottlerModule` global (ดูข้อจำกัดที่ A3)
- `.env.production.example` ทั้ง backend (9.8K) และ frontend (3.3K)
- **secret hygiene ผ่าน**: `git ls-files` มีแต่ไฟล์ `.example` ไฟล์ `.env` จริงและ `.env.backup-20260814` ไม่ถูก track (`.gitignore` ครอบ `.env` + `.env.*` แล้วยกเว้นเฉพาะ `*.example`)

### D2. CI/CD — 🔴 ไม่มีเลย

ไม่มี `.github/workflows/` แปลว่า `tsc` / `jest` / `vue-tsc` / `eslint` / `build` **รันด้วยมือเท่านั้น** ไม่มีอะไรกันไม่ให้ commit ที่พังเข้า main

### D3. Deploy target / domain / SSL / migration plan — ⬜ ยังไม่ตรวจ

ไม่ได้ตรวจในรอบนี้ และไม่มีข้อมูลจากรายงานเดิม

---

## 6. กลุ่ม E — เรื่องเล็กแต่ไม่ควรลืม

### E1. ปุ่ม Mock Mode ติดไปกับ production build — 🔴 ยังเปิดอยู่ (เจอใหม่รอบนี้)

`MainLayout.vue:24` เรนเดอร์ `<MockModeToggle />` บน header **โดยไม่มีเงื่อนไข** — ไม่มี `import.meta.env.DEV` ไม่มี flag ครอบ
`mock.config.ts:22-28` ระบุชัดว่า **ค่าใน localStorage ชนะค่า env เสมอ**

แปลว่าผู้ใช้จริงบนโปรดักชันจะเห็นปุ่ม 🧪 บน header กดแล้วทั้งแอปเปลี่ยนเป็นข้อมูลปลอมถาวร (ค้างใน localStorage) โดยที่ `VITE_MOCK_MODE=false` ช่วยอะไรไม่ได้เลย

ข่าวดี: **ค่าเริ่มต้นปิดอยู่จริง** — frontend ไม่มีไฟล์ `.env` ในเครื่อง `VITE_MOCK_MODE` จึง undefined → `readEnvDefault()` = false และ `.env.production.example:27` ก็ตั้ง `false` ไว้แล้ว ปัญหาคือปุ่มที่เปิดมันได้ ไม่ใช่ค่าเริ่มต้น

**แก้ง่ายมาก**: ครอบ `v-if="isDev"` ที่ `MainLayout.vue:24`

### E2. `test/app.e2e-spec.ts` compile ไม่ผ่าน — 🔴 ยังเปิดอยู่ (ค้างมานาน)

`tsc --noEmit` เหลือ error 2 บรรทัด: `Cannot find module 'supertest'` / `'supertest/types'` — ไฟล์ e2e ตัวเดียวในโปรเจกต์ที่ไม่มี dependency รองรับ ไม่กระทบ runtime และไม่กระทบ jest (45 suite ผ่านหมด) แต่ทำให้ `tsc` ไม่มีวันเขียว 100% ซึ่งบังหน้า error ใหม่ได้

### E3. ทดสอบตอนนี้ผ่านหมด — ✅

| ชุด | ผล |
|---|---|
| backend `tsc --noEmit` | ผ่าน (เหลือแต่ E2) |
| backend `jest` | **283 ผ่าน / 45 suite** |
| frontend `vue-tsc` | สะอาด |
| frontend `eslint` | สะอาด |
| frontend `vitest` | **413 ผ่าน / 34 ไฟล์** |
| frontend `quasar build` | สำเร็จ |

---

## 7. ข้อเสนอลำดับการทำงานต่อ

จากที่เห็นโค้ดจริงตอนนี้ ของที่บล็อกการเปิดใช้งานเรียงตามความเร่งด่วนจริง ไม่ใช่ตามลำดับในรายงานเดิม

### ทำก่อน — ราคาถูกมาก แต่ปล่อยไว้แล้วเจ็บ

1. **ครอบ `MockModeToggle` ด้วย `v-if` dev** (E1) — งาน 1 บรรทัด แต่ตอนนี้ผู้ใช้จริงกดปุ่มเดียวแล้วเห็นข้อมูลปลอมทั้งแอปแบบถาวร นี่คือของที่แย่ที่สุดต่อความน่าเชื่อถือในบรรดาทุกข้อในไฟล์นี้ เพราะผู้ใช้จะไม่รู้ตัวว่ากดอะไรไป
2. **ย้ายคีย์ Anthropic ให้ถูกช่อง หรือลบทิ้ง** (A4) — ตอนนี้ Claude โผล่ในตัวเลือกแล้วพัง 100% ถ้ายังไม่มีคีย์จริงให้ **ลบบรรทัดนั้นทิ้ง** ไปเลย `isConfigured()` จะกรอง Claude ออกจากตัวเลือกเอง ผู้ใช้จะไม่เห็นของที่กดไม่ได้ ดีกว่าปล่อยให้เห็นแล้วพัง (ควรทำเช่นเดียวกันกับ OpenAI ถ้ายืนยันแล้วว่าโควตายังหมด → A5 ต้องตรวจก่อน)
3. **`@Throttle` เฉพาะ `/auth/login|register|refresh`** (A3) — 120 ครั้ง/นาทีบน endpoint ที่รับรหัสผ่านคือช่องโหว่ที่สแกนเนอร์อัตโนมัติเจอแน่นอน แก้ที่ decorator ไม่ต้องแตะ limit รวมที่หน้าอื่นพึ่งอยู่

### ทำต่อ — ต้องคิดนิดหน่อย

4. **ปิด NewsGateway + ล็อก WS CORS** (C2, C3) — ลอก handshake ของ `chat.gateway.ts:42-79` มาใช้ได้เลย มีของพร้อมอยู่แล้วในรีโปเดียวกัน และเปลี่ยน `origin: '*'` ทั้งสองไฟล์ให้อ่านจาก `CORS_ORIGINS` ตัวเดียวกับ `main.ts` — ไม่งั้นกติกา CORS ที่อุตส่าห์เขียนให้ล้มตอน boot ก็ไร้ความหมาย เพราะมีประตูข้างเปิดอยู่
5. **ล้างบัญชีทดสอบ + ตัดสินใจเรื่อง tier** (A7, B) — ตาราง `users` มี 4 แถวและ **ทั้ง 4 เป็นบัญชีทดสอบ** สองในนั้นเป็น PACK_279 ที่ไม่ได้จ่ายเงิน ควรล้างพร้อมกับตอบคำถามว่า "หน้าไหนเป็นของ paid tier" (`WorkspaceNavLink.paid` ที่ยังไม่มีใครใช้) เพราะสองเรื่องนี้คือเรื่องเดียวกัน — จะทดสอบ tier ให้ถูกต้องไม่ได้ถ้ายังไม่รู้ว่า tier กั้นอะไร

### ทำเมื่อมีเวลา

6. **ติดตั้ง eslint ฝั่ง backend ให้ใช้ได้จริง** (C1) — `npm i -D eslint @eslint/js typescript-eslint` + เพิ่ม script `lint` ตอนนี้ config ไฟล์นั่งรออยู่เฉย ๆ มาหลายเดือน
7. **CI ขั้นต่ำ** (D2) — workflow เดียวที่รัน `tsc`/`jest`/`vue-tsc`/`eslint`/`build` บน PR ก็พอ ตอนนี้ทุกอย่างพึ่งความจำว่าจะรันเองก่อน commit
8. **ซ่อมหรือลบ `test/app.e2e-spec.ts`** (E2) — ถ้ายังไม่ได้ใช้ e2e จริง ลบทิ้งดีกว่าปล่อยให้ `tsc` แดงค้าง

### ยังไม่รู้ ต้องไปหาข้อมูลก่อน

- โควตา OpenAI (A5) — ต้องยิง API จริง
- แผน deploy / domain / SSL / migration ขึ้นโปรดักชัน (D3)
- ข้ออื่นในกลุ่ม B/D ของรายงาน 2026-08-20 ที่ผมไม่เห็นรายการ — **ถ้า Rem ยังมีไฟล์นั้นอยู่ ส่งมาให้ผมเทียบทีละข้อได้ จะได้ไม่มีข้อไหนหล่นหาย**
