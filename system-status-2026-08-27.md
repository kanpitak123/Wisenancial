# Wisenancial — สถานะก่อนเปิดใช้งานจริง

**ตรวจเมื่อ**: 2026-08-28 (ชื่อไฟล์ใช้ตามที่ Rem ระบุ)
**อัปเดตล่าสุด**: 2026-08-28 — ปิดชุด security hardening 4 ข้อ (E1, C4/A4, A3, C2+C3) ดูหัวข้อ 7
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

### A3. Auth: rate limit บน `/auth/*` — ✅ ปิดแล้ว (`f30750f`)

**เดิม**: มี throttle ระดับ global (`app.module.ts:45-50` + `APP_GUARD`) ที่ `THROTTLE_LIMIT=120` ต่อ 60 วินาที และ **ไม่มี `@Throttle` เฉพาะจุดที่ไหนเลย** → เดา password ได้ 120 ครั้ง/นาที/IP

**ตอนนี้**: `/auth/login`, `/auth/register`, `/auth/refresh` มีเพดานของตัวเองที่ **10 ครั้ง/นาที** ปรับได้ผ่าน `AUTH_THROTTLE_LIMIT` / `AUTH_THROTTLE_TTL_SECONDS` (เอกสารอยู่ใน `.env.production.example`) endpoint อื่นไม่ถูกแตะ

**ทำไม 10 ไม่ใช่ 3**: เพดานนับต่อ IP และผู้ใช้จำนวนมากอยู่หลัง NAT ร่วมกัน (ออฟฟิศ/CGNAT) ต่ำกว่านี้เสี่ยงล็อกคนทั้งออฟฟิศเพราะมีคนพิมพ์รหัสผิดไม่กี่ครั้ง ส่วน 10 ยังรัดกว่าเดิม 12 เท่า
`/auth/refresh` รวมอยู่ด้วยและไม่กระทบผู้ใช้จริง — หน้าบ้านรวบคำขอ refresh ที่เกิดพร้อมกันให้เหลือครั้งเดียวอยู่แล้ว (`boot/axios.refresh.spec.ts`) ของจริงเกิดราว 4 ครั้ง/ชั่วโมงตามอายุ access token 15 นาที

**รายละเอียดที่เกือบพลาด**: ใน `@nestjs/throttler` v6 ถ้าประกาศ throttler ตัวที่สองตอน `forRoot` **ทุกตัวจะถูกบังคับใช้กับทุก route** ไม่ใช่เฉพาะที่อ้างถึง — จึงใช้วิธีเขียนทับ throttler ชื่อ `default` ที่ endpoint แทนการเพิ่มตัวใหม่ ไม่งั้นเพดาน 10 จะไปครอบทั้ง API

**เทส**: `auth.throttle.spec.ts` ยิงผ่าน `ThrottlerGuard` + storage ของจริง — ยิงถึงเพดานผ่าน เกิน 1 ครั้งโดนบล็อก, ยิงรัว 40 ครั้งโดนบล็อก 30, และ IP อื่นไม่ได้รับผลกระทบ ถ้าใครถอด `@Throttle` ออกเทสแดงทันที

### A4. `.env`: ANTHROPIC_API_KEY — 🟡 สาเหตุแก้แล้วในโค้ด (`a2d9974`) / คีย์ Rem หมุนเอง

ตรวจโดยดูความยาว+รูปแบบนำหน้า ไม่ได้เอาค่าไปใช้ที่ไหน:

| ช่อง | ความยาว | รูปแบบ | ผล |
|---|---|---|---|
| `GEMINI_API_KEY` | 39 | `AIza…` | ถูกต้องตามรูปแบบ Google |
| `GROQ_API_KEY` | 56 | `gsk_…` | ถูกต้องตามรูปแบบ Groq |
| `OPENAI_API_KEY` | 164 | `sk-proj-…` | รูปแบบถูกต้อง |
| `ANTHROPIC_API_KEY` | 56 | **`gsk_…`** | **ผิดช่อง — เป็นคีย์รูปแบบ Groq ไม่ใช่ Anthropic** |

**นี่คือสาเหตุที่ Anthropic ใช้ไม่ได้ ไม่ใช่คีย์หมดอายุ** — คีย์ Anthropic ขึ้นต้นด้วย `sk-ant-` และยาวกว่านี้มาก มีคนวางคีย์ Groq ลงช่อง Anthropic

**ผลกระทบต่อผู้ใช้ (เดิม)**: `ai-manager.service.ts:90-97` กรองโมเดลด้วย `isConfigured()` ซึ่งดูแค่ว่า "มีค่าไหม" ไม่ได้ดูว่าใช้ได้จริงไหม → **โมเดล Claude จะโผล่ในตัวเลือกให้ผู้ใช้กด แล้วพังทุกครั้ง** (ข่าวดี: provider โยน error ก่อนถึงขั้นคิดเครดิต ผู้ใช้จึงไม่เสียเครดิตฟรี แต่เห็น error เปล่า ๆ)

**แก้แล้ว (`a2d9974`)**: `isConfigured()` ตรวจรูปแบบคีย์ต่อ provider แล้ว คีย์ที่รูปแบบไม่ตรงถูกนับเป็น "ไม่ได้ตั้ง" → โมเดลนั้นหายจากตัวเลือกแทนที่จะโผล่มาให้กดแล้วพัง และไม่กิน fallback chain เปล่า ๆ ด้วย รายละเอียดในข้อ C4 ด้านล่าง
**เหลือฝั่ง Rem**: ใส่คีย์ Anthropic ตัวจริง (`sk-ant-…`) แทนตัวที่เป็น `gsk_` — Rem แจ้งว่าจะหมุนคีย์ทั้ง 4 ตัวเองที่หน้าเว็บ provider

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

### C2. NewsGateway ไม่มี auth — ✅ ปิดแล้ว (`2274b60`)

**เดิม**: `news.gateway.ts` ทั้งไฟล์ 17 บรรทัด ไม่มี `OnGatewayConnection` ไม่ตรวจ token ใด ๆ ขณะที่ `news.controller.ts:16` ใส่ `@UseGuards(JwtAuthGuard)` ครอบทั้ง controller → เนื้อหาชุดเดียวกัน (`new_news`, `news_data_changed`, **`news_ai_enriched`** ซึ่งจ่ายค่า LLM ไปแล้ว) broadcast ให้ใครก็ได้ที่ต่อ socket เข้ามา

**ตอนนี้**: ตรวจ JWT ตอน handshake แล้ว ไม่ผ่าน = `disconnect()` ครอบคลุมทั้งกรณีไม่มี token / token เสีย-หมดอายุ / claim ไม่ครบ / ไม่ได้ตั้ง `JWT_ACCESS_SECRET`

ตรรกะไม่ได้เขียนใหม่ — ย้ายของ ChatGateway (ซึ่งทำถูกอยู่แล้ว) ไปไว้ที่ `auth/utils/socket-auth.util.ts` แล้วให้ทั้งสอง gateway ใช้ตัวเดียวกัน กันไม่ให้สองที่ค่อย ๆ เพี้ยนออกจากกัน พฤติกรรมของ Chat ไม่เปลี่ยน (spec เดิม 9.1K ยังผ่าน)

**จุดที่เกือบทำระบบพังเงียบ ๆ**: หน้าบ้าน (`news-socket.service.ts`) **ไม่เคยส่ง token มาเลย** — ถ้าเพิ่มแค่ฝั่งเซิร์ฟเวอร์ ฟีดข่าวเรียลไทม์จะเงียบสนิทโดยไม่มี error ให้เห็นบนหน้าจอ จึงแก้ฝั่ง client ให้แนบ token ไปด้วยในคอมมิตเดียวกัน (อ่านตอน connect ทุกครั้ง ไม่ cache — token ถูกหมุนใหม่ทุกครั้งที่ refresh)

### C3. WebSocket CORS `origin: '*'` — ✅ ปิดแล้ว (`2274b60`)

**เดิม**: `news.gateway.ts:5` และ `chat.gateway.ts:24-28` hardcode `cors: { origin: '*' }` ทั้งคู่ ข้ามกติกาที่ `main.ts` ตั้งไว้ทั้งหมด (บังคับตั้ง `CORS_ORIGINS` บน production ถึงขั้นไม่ยอม boot และปฏิเสธ `'*'` เพราะเปิด credentials)

**ตอนนี้**: การอ่าน origin ย้ายไป `config/cors-origins.util.ts` ใช้ร่วมกันทั้ง HTTP และ WS ทั้งสอง gateway ใช้รายการเดียวกัน + `credentials: true`

แยกเป็นสองฟังก์ชันโดยตั้งใจ: `resolveCorsOrigins()` ไม่โยน error (decorator ของ gateway ทำงานตอน import ซึ่งเกิดก่อน `bootstrap()` ถ้าโยนตรงนั้นผู้ดูแลจะเห็น stack ตอน import แทนข้อความบอกสาเหตุ) ส่วน `assertCorsOriginsValid()` ที่โยน error ยังอยู่ใน `main.ts` เหมือนเดิม

**เทส**: ตัวที่ปฏิเสธ origin จริง ๆ คือ engine.io ไม่ใช่โค้ดเรา จึงทดสอบสิ่งที่เป็นต้นเหตุแทน — อ่าน metadata ของ `@WebSocketGateway` ยืนยันว่าทั้งสอง gateway ไม่มี `'*'` และเปิด credentials พร้อมเทสของ `resolveCorsOrigins()` ที่คุมว่า `'*'` ถูกตัดทิ้งเสมอแม้หลุดมาถึง

### C4. `isConfigured()` ตรวจแค่ "มีค่าไหม" — ✅ ปิดแล้ว (`a2d9974`)

ตรวจรูปแบบคีย์ต่อ provider แล้วผ่าน `resolveApiKey()` ใน `ai/providers/api-key.util.ts`: `gsk_` (Groq), `sk-` (OpenAI), `sk-ant-` (Anthropic), `AIza` (Gemini) พร้อมความยาวขั้นต่ำ คีย์ที่ไม่ตรงถูกนับเป็น "ไม่ได้ตั้ง"

`sk-ant-` ขึ้นต้นด้วย `sk-` ของ OpenAI ด้วย ถ้าเช็คแค่ prefix ตรง ๆ คีย์ Anthropic ที่วางผิดช่องจะผ่านการตรวจของ OpenAI ไปได้ — OpenAI จึงต้องมี `notPrefix` กันไว้อีกชั้น

แยกระดับล็อกสองแบบ: ไม่ได้ตั้ง = `warn`, ตั้งไว้แต่ผิดรูปแบบ = `error` (อันหลังคือกรณีที่คนตั้งค่าเชื่อว่าทำถูกแล้ว) และ**ไม่พิมพ์ตัวคีย์ลงล็อกแม้แต่บางส่วน** — บอกชื่อ env, prefix ที่คาดหวัง และความยาว ก็พอวินิจฉัยแล้ว

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

### E1. ปุ่ม Mock Mode ติดไปกับ production build — ✅ ปิดแล้ว (`124c31d`)

**เดิม**: `MainLayout.vue:24` เรนเดอร์ `<MockModeToggle />` โดยไม่มีเงื่อนไข และ `mock.config.ts` อ่าน localStorage ก่อนเสมอ (**ค่าที่ค้างชนะค่า env**) → ผู้ใช้จริงกดปุ่มครั้งเดียวก็เห็นข้อมูลปลอมถาวร และ `VITE_MOCK_MODE=false` ช่วยไม่ได้เลย

**ตอนนี้**: `isMockAvailable()` เป็นด่านครอบทั้งฟีเจอร์ — dev เปิดได้เสมอ, build อื่นต้องตั้ง `VITE_ENABLE_MOCK_MODE=true` ให้ชัด (สำหรับ staging), production ที่ไม่ได้ตั้ง = **ปิดตายก่อนแตะ localStorage** ไม่ว่าจะมีอะไรค้างอยู่ในเครื่องผู้ใช้ และ `setMockEnabled()` ก็ไม่เขียนอะไรลงไปด้วย

ด่านอยู่ที่ตัวปุ่มเอง ไม่ใช่ที่ `MainLayout` — call site ใหม่ในอนาคตจะได้ปลอดภัยตามไปโดยไม่ต้องจำว่าต้องครอบ `v-if` ทุกครั้ง

ระหว่างทางยังห่อการอ่าน/เขียน localStorage ด้วย try/catch — โหมดส่วนตัวของบางเบราว์เซอร์โยน error ตอนเข้าถึง ซึ่งจะทำให้ทั้งแอปพังตั้งแต่เริ่ม

**เทส**: เคสที่กัดจริง — มี `"true"` ค้างใน localStorage บน production build แล้วต้องยังปิดอยู่ (+ ปุ่มไม่ถูกเรนเดอร์)

### E2. `test/app.e2e-spec.ts` compile ไม่ผ่าน — 🔴 ยังเปิดอยู่ (ค้างมานาน)

`tsc --noEmit` เหลือ error 2 บรรทัด: `Cannot find module 'supertest'` / `'supertest/types'` — ไฟล์ e2e ตัวเดียวในโปรเจกต์ที่ไม่มี dependency รองรับ ไม่กระทบ runtime และไม่กระทบ jest (45 suite ผ่านหมด) แต่ทำให้ `tsc` ไม่มีวันเขียว 100% ซึ่งบังหน้า error ใหม่ได้

### E3. ทดสอบตอนนี้ผ่านหมด — ✅

| ชุด | ผล |
|---|---|
| backend `tsc --noEmit` | ผ่าน (เหลือแต่ E2) |
| backend `jest` | **330 ผ่าน / 49 suite** |
| frontend `vue-tsc` | สะอาด |
| frontend `eslint` | สะอาด |
| frontend `vitest` | **430 ผ่าน / 37 ไฟล์** |
| frontend `quasar build` | สำเร็จ |

(ก่อนชุด security hardening: backend 283 / frontend 413 — เพิ่มมา 47 เคสฝั่ง backend, 17 เคสฝั่ง frontend)

---

## 7. Security hardening batch — ทำแล้ว 2026-08-28

Rem อนุมัติทำรวมเป็นชุดเดียว แยกเป็น 4 commit ตามข้อ

| ข้อ | เรื่อง | commit |
|---|---|---|
| E1 | Mock mode ปิดตายบน production build | `124c31d` |
| C4 / A4 | `isConfigured()` ตรวจรูปแบบคีย์ต่อ provider | `a2d9974` |
| A3 | rate limit เฉพาะ `/auth/login|register|refresh` | `f30750f` |
| C2 + C3 | NewsGateway handshake auth + WS CORS ไม่ใช่ `'*'` | `2274b60` |

C2 กับ C3 รวมเป็น commit เดียวเพราะแตะไฟล์เดียวกันทั้งคู่ (`news.gateway.ts` เขียนใหม่ทั้งไฟล์, `chat.gateway.ts` แก้ทั้ง decorator และ handshake) แยกแล้วจะได้ commit กลางทางที่ gateway ตรวจ token แล้วแต่ยังเปิดรับทุก origin อยู่ ซึ่งไม่ใช่สถานะที่อยากให้มีอยู่ในประวัติ

**ผลรวม**: backend jest 283 → **330**, frontend vitest 413 → **430** ทุกชุดตรวจผ่านหมด

---

## 8. ข้อเสนอลำดับการทำงานต่อ

### เหลือฝั่ง Rem (ไม่ใช่งานโค้ด)

1. **หมุนคีย์ทั้ง 4 ตัว + ใส่ Anthropic ให้ถูกช่อง** (A4) — Rem แจ้งว่าจะทำเอง ตอนนี้โค้ดพร้อมรับแล้ว: ถ้าใส่ผิดรูปแบบอีก โมเดลนั้นจะหายจากตัวเลือกพร้อม log ระดับ `error` บอกชื่อ env และ prefix ที่คาดหวัง แทนที่จะโผล่มาให้กดแล้วพังเงียบ ๆ
2. **ตรวจโควตา OpenAI** (A5) — ยังไม่ได้ตรวจ ต้องยิง API จริง ถ้าโควตายังหมด ผลกระทบเหมือน A4 เดิม (โผล่ในตัวเลือกแล้วพัง) เพราะการตรวจรูปแบบคีย์ไม่ได้บอกว่าโควตาเหลือไหม

### บล็อกการเปิดใช้งานมากที่สุดตอนนี้

3. **ล้างบัญชีทดสอบ + ตัดสินใจเรื่อง tier** (A7, B) — ตาราง `users` มี 4 แถวและ **ทั้ง 4 เป็นบัญชีทดสอบ** สองในนั้นเป็น PACK_279 ที่ไม่ได้จ่ายเงินจริง ควรล้างพร้อมกับตอบว่า "หน้าไหนเป็นของ paid tier" (`WorkspaceNavLink.paid` ที่ยังไม่มีลิงก์ไหนใช้) — สองเรื่องนี้คือเรื่องเดียวกัน จะทดสอบ tier ให้ถูกไม่ได้ถ้ายังไม่รู้ว่า tier กั้นอะไร

หลังปิดชุด hardening นี้แล้ว **ข้อ 3 คือของที่เหลืออยู่ชิ้นเดียวที่กระทบผู้ใช้จริงโดยตรง** ข้อที่เหลือด้านล่างเป็นเรื่องคุณภาพของกระบวนการ ไม่ใช่สิ่งที่ผู้ใช้เจอ

### ทำเมื่อมีเวลา

4. **ติดตั้ง eslint ฝั่ง backend ให้ใช้ได้จริง** (C1) — `npm i -D eslint @eslint/js typescript-eslint` + เพิ่ม script `lint` config ไฟล์นั่งรออยู่เฉย ๆ
5. **CI ขั้นต่ำ** (D2) — workflow เดียวที่รัน `tsc`/`jest`/`vue-tsc`/`eslint`/`build` บน PR ตอนนี้ทุกอย่างพึ่งความจำว่าจะรันเองก่อน commit
6. **ซ่อมหรือลบ `test/app.e2e-spec.ts`** (E2) — ถ้ายังไม่ได้ใช้ e2e จริง ลบทิ้งดีกว่าปล่อยให้ `tsc` แดงค้าง (ตอนเขียน `auth.throttle.spec.ts` ต้องเลี่ยง supertest ไปเรียก guard ตรง ๆ เพราะเหตุนี้)

### ยังไม่รู้ ต้องไปหาข้อมูลก่อน

- แผน deploy / domain / SSL / migration ขึ้นโปรดักชัน (D3)
- ข้ออื่นในกลุ่ม B/D ของรายงาน 2026-08-20 ที่ผมไม่เห็นรายการ — **ถ้า Rem ยังมีไฟล์นั้นอยู่ ส่งมาให้ผมเทียบทีละข้อได้ จะได้ไม่มีข้อไหนหล่นหาย**
