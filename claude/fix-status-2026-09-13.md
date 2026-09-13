# Fix Status — 2026-09-13

**หมายเหตุก่อนอ่าน:** `claude/qa-bug-report-2026-09-13.md` ที่อ้างถึงในงานนี้ไม่มีอยู่จริงในโปรเจกต์ (เช็คแล้วทั้ง `claude/` และทั้ง repo) — มีเฉพาะ `Claude outputs/qa-bug-report-2026-09-09.md` ซึ่งอ่านครบทั้งไฟล์แล้ว ส่วนบั๊ก 09-13 ทำงานจากรายละเอียด (repro + root cause + เลขข้อ) ที่ Rem ให้มาในข้อความสั่งงานโดยตรง ซึ่งมีรายละเอียดเทียบเท่าการอ่านจากไฟล์จริง

ทุกข้อ "fixed" ยืนยันด้วยการรันจริงผ่าน dev server (curl กับ backend :3000, เบราว์เซอร์จริงกับ frontend :9000) ไม่ใช่แค่อ่านโค้ด — วิธีทดสอบระบุไว้ในแต่ละข้อ

---

## จาก qa-bug-report-2026-09-13.md (ตามที่ Rem ให้รายละเอียดมา)

### 1. [CRITICAL] DELETE /portfolios/:id คืน 409/500 ถาวร — **fixed**
- Frontend (`PortfolioPage.vue`): `submitDelete` เดิม fire-and-forget แล้วโชว์ "ลบสำเร็จ" เสมอ → แก้เป็น await จริง + โชว์ error message จริงจาก backend เมื่อพัง
- Backend (`portfolios.service.ts`): `hasPortfolioActivity` เดิมนับ record ประวัติทุกอย่าง (รวมไม้ที่ปิด/หุ้นที่ขายหมดแล้ว) ทำให้พอร์ตที่เคยเทรดแม้แต่ครั้งเดียวลบไม่ได้อีกเลยตลอดกาล → แก้ให้บล็อกเฉพาะไม้ forex ที่ยังเปิด (`result_status: 'OPEN'`) และ lot หุ้นที่ยังเหลือ (`status: 'OPEN'`) เท่านั้น
- พบบั๊กซ้อนอีกจุด: schema มี FK `stock_sale_allocations.purchase_id` เป็น `onDelete: Restrict` ทำให้ cascade delete พัง 500 ทันทีที่พอร์ตมีประวัติขายหุ้น → แก้เป็น `Cascade` + สร้าง migration `20260913173430_fix_stock_sale_allocations_cascade_delete` (apply แล้วบน dev DB)
- **ทดสอบ:** สร้างพอร์ต INVESTOR → buy → sell หมด → DELETE → `200 {"message":"ลบพอร์ตสำเร็จ"}` (ทำซ้ำ 2 รอบกับพอร์ตคนละใบ ผ่านทั้งคู่)

### 2. [CRITICAL] POST stocks/sell คืน 500 ทุกครั้ง — **fixed**
- Root cause จริง: Prisma interactive-transaction timeout default (5s) ไม่พอสำหรับ transaction ที่มี round-trip เยอะไปยัง Neon (remote latency) → `sell()` ตายกลางทางด้วย "Transaction API error: Transaction not found"
- แก้ที่ `PrismaService` — เพิ่ม `transactionOptions: { timeout: 20000, maxWait: 10000 }` ระดับ client (ครอบคลุมทุก transaction ในแอป ไม่ใช่แค่ sell)
- **ทดสอบ:** buy → sell (partial + full) ผ่าน `201` ทุกครั้ง ไม่เกี่ยวกับบั๊ก #1 ตามที่สงสัยไว้ในรายงาน (Prisma transaction rollback หมดตอน timeout ไม่มี orphan record หลงเหลือ)

### 3. [HIGH] กราฟ "Portfolio Growth" หน้า Dashboard ว่างเปล่า — **fixed**
- Code ปัจจุบัน**ไม่ได้**ผูกกับ `/investor/portfolios/:id/timeline` ตามที่รายงานสงสัยแล้ว (มีคนแก้ให้ไปใช้ `analyticsStore` ที่ถูกต้องไปแล้วก่อนหน้านี้) แต่ root cause จริงคือ `DashboardPage.vue` ไม่เคยสั่ง `analyticsStore.initialize()` เลย กราฟเลยว่างตลอดยกเว้นบังเอิญเคยเปิดหน้า Analytics มาก่อนในเซสชันเดียวกัน
- แก้: เพิ่มเรียก `analyticsStore.initialize(port.id, port.portfolio_type)` ใน `loadPortfolioData()` (แบบไม่ await บล็อก goal/dividend loading อื่น — กัน regression กับเทสต์เดิม)
- **ทดสอบ:** สร้างพอร์ตใหม่ + buy หุ้น → เปิด `/Dashboard` จริงในเบราว์เซอร์ → กราฟแสดงเส้นข้อมูลจริงพร้อม label วันที่ถูกต้อง (screenshot ยืนยันแล้ว)

### 4. [HIGH] หน้า Portfolio list ตัวเลข Current/Net PnL ผิด — **fixed**
- ยืนยันบั๊กจริง: `current_balance` ของพอร์ต INVESTOR คือเงินสดอย่างเดียว ไม่รวมมูลค่าหุ้นที่ถืออยู่
- แก้ `PortfolioPage.vue`: ดึง `portfolio_value` (cash + market value ของ holdings) จาก investor-dashboard endpoint เดียวกับที่หน้า Dashboard ใช้ มาคำนวณ Current/Net PnL/growth% แทน `current_balance` ดิบ (เฉพาะพอร์ต INVESTOR — พอร์ต TRADER ใช้ current_balance เดิมถูกอยู่แล้ว)
- **ทดสอบ:** สร้างพอร์ต INVESTOR initial 10,000 → buy หุ้น 1,500 → `GET /portfolios` list คืน current_balance=8,500 (เงินสดล้วน, ดูเหมือนขาดทุน) แต่ `GET /investor/portfolios/:id/dashboard` คืน portfolio_value=11,822.7 (cash+holdings จริง) → ยืนยันว่า fix ดึงเลขที่ถูกมาใช้แล้ว

### 5. [MEDIUM] กราฟ "Account Growth" label เดือนเพี้ยน 1 เดือน — **fixed (แก้มาก่อนเซสชันนี้แล้ว)**
- ไล่โค้ดทั้ง `AnalyticsStore.ts` (`formatChartDateLabel` ใช้ `toLocaleDateString` ถูกต้องแล้ว) และ backend `trader-analytics.service.ts`/`investor-analytics.service.ts` (`performance()` คืน raw `Date` object ให้ frontend format เอง ไม่มีจุดไหนสร้าง date string เองแบบ `getMonth()` ไม่ +1 หลงเหลืออยู่)
- ไม่พบ pattern บั๊กที่รายงานอธิบายในโค้ดปัจจุบัน — ไม่ได้แก้อะไรเพิ่ม เพราะไม่มีอะไรให้แก้

### 6. [MEDIUM] Community Board Like ไม่เพิ่มยอด — **fixed (แก้มาก่อนเซสชันนี้แล้ว)**
- `posts.service.ts` `toggleLike()` และ `findAll()`/`mapPostWithReference()` ตรวจแล้วถูกต้องทั้งคู่ (increment จริง, คืนค่าจริงจาก DB ไม่ใช่ cache)
- **ทดสอบ:** สร้าง post จริง → `POST /posts/:id/like` → `{"liked":true,"likes_count":1}` → `GET /posts` (list ใหม่) → `likes_count:1` ตรงกัน ยืนยันว่า persist ถูกต้อง ไม่ใช่บั๊กที่ยังอยู่

### 7. [MEDIUM] QSelect dropdown ไม่ปิด/ไม่เปิด (Journal + Community + จุดอื่นๆ) — **not-fixed / ต้องเช็คในเบราว์เซอร์จริง**
- Reproduce ได้จริงผ่าน automation: `.q-menu` ค้างที่ `visibility:collapse`, `q-transition--fade-enter-from/active` ตลอดกาล ไม่มี `.q-list`/`.q-item` render เลย (`QVirtualScroll` render 0 แถว) — ตรงกับที่ทั้ง 2 รายงานเจอ
- ไล่ root cause ลึกถึง Quasar's `QVirtualScroll` + position-engine (`node_modules/quasar/src/.../position-engine.js`, `use-virtual-scroll.js`) แต่สุดท้ายพบว่า **tab ที่ automation ควบคุมมี `document.visibilityState === 'hidden'` ตลอดเวลา และ `requestAnimationFrame` ไม่ทำงานเลย (timeout 45 วินาทีรอ 1 เฟรม)** — เป็นพฤติกรรมปกติของ Chrome ที่ throttle/suspend tab พื้นหลัง ซึ่งจะทำให้ทุกอย่างที่พึ่ง rAF (รวม virtual-scroll) ค้างแบบเดียวกับที่สังเกตเห็น ไม่ว่าโค้ดจะถูกหรือผิด
- **สรุป:** ไม่มีหลักฐานที่เชื่อถือได้พอว่าเป็นบั๊กจริงสำหรับ user ที่เปิด tab ปกติ หรือเป็นแค่ artifact ของเครื่องมือทดสอบเอง (ทั้ง 09-09 และ 09-13 report ก็ใช้ browser automation แบบเดียวกันทดสอบ อาจเจอ confound เดียวกันโดยไม่รู้ตัว) — **ไม่ได้แก้โค้ดเพิ่ม** เพราะไม่อยากแก้บนสมมติฐานที่พิสูจน์ไม่ได้
- โค้ดปัจจุบันมี mitigation อยู่แล้วจากก่อนหน้านี้ (`JournalPage.vue` — `refreshMenuPosition()`/`updateMenuPosition()` nudge ผูกกับ `@popup-show`, มี comment อธิบาย root cause ตรงกับที่เจอ) — ไม่ได้แตะ/ลบทิ้ง เผื่อช่วย user จริงได้
- **ต้องทำ:** Rem หรือใครเปิดเบราว์เซอร์ปกติ (ไม่ใช่ automation) ลองกด New Trade → คลิก dropdown Pair/Strategy/ฯลฯ เองเพื่อยืนยันว่ายังพังจริงไหม

### 8. [LOW] Community comment ไม่ clear input/ไม่โชว์ทันที — **fixed (แก้มาก่อนเซสชันนี้แล้ว)**
- `CommunityPage.vue` submitComment เคลียร์ `commentInputs.value[postId] = ''` หลัง submit สำเร็จ, `CommunityStore.addComment()` push comment ใหม่เข้า `post.comments`/`selectedPost.comments` ทันที ตรวจแล้วถูกต้องทั้งคู่

### 9. [LOW] POST /watchlist/portfolio/:id ยัง 404 — **not-a-code-bug (data seeding gap)**
- Backend คืน 404 พร้อม message ชัดเจน (`"{symbol} ไม่มีอยู่ในรายการ Asset ของ Trader"` เป็นต้น) และ frontend (`WatchlistStore.addAsset` → `WatchlistPage.vue handleAdd`) catch + `$q.notify` error อยู่แล้วครบ ไม่ใช่ "ไม่มี error โชว์" ตามที่รายงานอธิบาย
- **root cause จริง:** ตาราง `assets`/`stocks` ใน dev DB (Neon) **ว่างเปล่า 0 แถวทั้งคู่** (ยังไม่เคย seed) ทุก symbol เลย 404 หมดไม่ว่าจะถูกหรือผิด — เป็นเรื่อง environment/data seeding ไม่ใช่โค้ดที่ต้องแก้ (ตรวจด้วย Prisma query ตรงกับ DB จริง)
- ไม่ได้แก้อะไร เพราะไม่มีบั๊กโค้ดให้แก้ — ถ้าต้องการให้ใช้งานได้จริงต้อง seed ตาราง `assets`/`stocks` ก่อน

### 10. [LOW] WatchlistPage.vue null.trim() TypeError — **fixed**
- ยืนยันบั๊กจริง (เลขบรรทัดขยับจากรายงานเพราะไฟล์แก้ไปหลายรอบ แต่บั๊กเดิมยังอยู่): `q-input clearable` ของช่องค้นหา (`v-model="search"`) เคลียร์ผ่านปุ่ม X แล้ว v-model ได้ `null` ไม่ใช่ `''` (พฤติกรรมมาตรฐานของ QInput) ทำให้ `manualItems` computed พัง
- แก้: `const keyword = (search.value ?? '').trim().toUpperCase();`
- **ทดสอบ:** ยืนยันโค้ดที่แก้ถูก deploy จริง (dev server serve จาก src ตรง) + type-check/lint/test ผ่านหมด — **ไม่สามารถ repro UI เต็มรูปแบบผ่านปุ่ม X ได้ในเซสชันนี้** เพราะ "ติดตามเอง" (manual watchlist) ว่าง 0 รายการ (ติด environment gap เดียวกับข้อ 9 — เพิ่มรายการเองไม่ได้เพราะตาราง asset ว่าง) เป็นการแก้ null-safety guard ความเสี่ยง regression ต่ำมาก ยืนยันด้วย static review + ผ่าน lint/type-check/test suite ทั้งหมด

---

## จาก Claude outputs/qa-bug-report-2026-09-09.md

### §1 [CRITICAL] Stock Terminal chart (lightweight-charts) pan/zoom ไม่ทำงาน — **not-fixed / ต้องเช็คในเบราว์เซอร์จริง**
- ไม่ได้ทดสอบในเซสชันนี้ — หลังเจอปัญหา rAF-stall จากข้อ 7 ด้านบน (tab automation ถูก throttle จน `requestAnimationFrame` ไม่ทำงานเลย) ประเมินว่าการทดสอบ `lightweight-charts` (ซึ่ง render ด้วย rAF เช่นกัน) ผ่าน automation ต่อจะได้ผลไม่น่าเชื่อถือเหมือนกัน เลยไม่เสียเวลาทดสอบแบบผิดๆ
- **ต้องทำ:** เช็คในเบราว์เซอร์จริง (ไม่ใช่ automation) — ลองปัด/scroll กราฟใน `/stock/:symbol` จริง

### §2 [CRITICAL] Journal q-select ทุกตัวเปิดเมนูไม่ขึ้น — **same issue as ข้อ 7 ด้านบน (09-13 report)** — not-fixed, ดูรายละเอียดในข้อ 7

### §3 [MEDIUM] Raw ISO timestamp โผล่บนแกน X ตอนมี data point เดียว — **fixed (แก้มาก่อนเซสชันนี้แล้ว)**
- `AnalyticsStore.ts` มี `formatChartDateLabel()` พร้อม comment อ้างอิงถึง QA bug นี้ตรงๆ ("§3 QA bug: ... จุดนี้ไม่เคยถูก format เป็นข้อความอ่านง่ายเลย") — format ด้วย `toLocaleDateString` ถูกต้อง ไม่มี raw ISO หลุดแล้ว
- **ทดสอบ:** สร้างพอร์ตใหม่ (มี data point เดียว/น้อย) → เปิด Dashboard จริง → เห็น label "Aug 14"/"Sep 14" ไม่ใช่ raw ISO string

### §4–§7 — **ไม่อยู่ในขอบเขตที่ Rem มอบหมายให้แก้ในงานนี้** (ไม่ได้อยู่ใน priority list ที่ Rem ระบุ 1-13 ตอนสั่งงาน) — skipped
- §4 [HIGH] News page โชว์ raw AI prompt เป็น summary — เกี่ยวพันกับ AI news enrichment service โดยตรง (เข้าข่าย AI scope ที่ขอให้ข้ามตามขอบเขตงาน) — **skipped-AI-scope**
- §5 [LOW] Stock workspace toggle no-op เวลาไม่มีพอร์ต Stock — สังเกตเห็นพฤติกรรมนี้จริงระหว่างทดสอบ (คลิก toggle Forex/Stock ไม่มีผลเวลาไม่มีพอร์ตโหมดนั้น) แต่ไม่ได้แก้ เพราะไม่อยู่ใน scope ที่มอบหมาย — **skipped (not-in-scope, confirmed still reproducible)**
- §6 [LOW/unconfirmed] double-submit บน Create Portfolio — ไม่ได้ตรวจ — **skipped (not-in-scope)**
- §7 [LOW/unconfirmed] Leaderboard "your rank" ไม่ตรง — ไม่ได้ตรวจ — **skipped (not-in-scope)**

---

## สรุปสถานะรวม

| # | บั๊ก | Severity | สถานะ |
|---|------|----------|--------|
| 13-#1 | DELETE portfolio 409/500 | CRITICAL | **fixed** |
| 13-#2 | POST sell 500 | CRITICAL | **fixed** |
| 13-#3 | Dashboard Portfolio Growth ว่าง | HIGH | **fixed** |
| 13-#4 | Portfolio list PnL ผิด | HIGH | **fixed** |
| 13-#5 | Account Growth month off-by-one | MEDIUM | fixed (ก่อนหน้านี้) |
| 13-#6 | Community Like ไม่เพิ่ม | MEDIUM | fixed (ก่อนหน้านี้) |
| 13-#7 / 09-09-§2 | QSelect dropdown ค้าง | MEDIUM/CRITICAL | **not-fixed** — ต้องเช็คเบราว์เซอร์จริง |
| 13-#8 | Community comment ไม่ clear | LOW | fixed (ก่อนหน้านี้) |
| 13-#9 | Watchlist add 404 | LOW | not-a-code-bug (seed data) |
| 13-#10 | WatchlistPage null.trim() | LOW | **fixed** |
| 09-09-§1 | Stock Terminal pan/zoom | CRITICAL | **not-fixed** — ต้องเช็คเบราว์เซอร์จริง |
| 09-09-§3 | Raw ISO timestamp | MEDIUM | fixed (ก่อนหน้านี้) |
| 09-09-§4 | News raw AI prompt | HIGH | skipped-AI-scope |
| 09-09-§5 | Stock toggle no-op | LOW | skipped (not-in-scope, ยังเจอจริง) |
| 09-09-§6 | Create Portfolio double-submit | LOW | skipped (not-in-scope) |
| 09-09-§7 | Leaderboard rank ไม่ตรง | LOW | skipped (not-in-scope) |

**ค้างจริงที่ต้องตามต่อ:** 13-#7 / 09-09-§2 (QSelect ค้าง) และ 09-09-§1 (Stock Terminal pan/zoom) — ทั้งคู่ CRITICAL ต่อ user แต่ไม่สามารถยืนยันได้อย่างน่าเชื่อถือผ่าน browser automation ในเซสชันนี้ เพราะ tab ที่ควบคุมถูก Chrome throttle จนพฤติกรรมที่พึ่ง `requestAnimationFrame` (virtual-scroll, chart rendering) ค้างหมดโดยไม่เกี่ยวกับโค้ดแอปเลย ต้องการคนเปิดเบราว์เซอร์ปกติทดสอบเพื่อยืนยัน
