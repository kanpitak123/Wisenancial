# Phase 3 Plan — Settings/Profile, Password Reset & Email Verification, Legal (B1/B2/B3)

Date: 2026-09-25. **Investigation + proposal only — no implementation code written**, per instructions. Builds on `Claude outputs/phase1-investigation.md` (which already established: no settings page exists, `GET/PATCH /users/me` + `DELETE /users/me/avatar` already exist and are unused by any page, no password-change/account-deletion endpoint exists, no password-reset flow exists, no email-verification exists, no email-sending library is even a dependency).

---

## B1 — Settings/Profile

### What already exists

- `GET /users/me`, `PATCH /users/me` (updates `username`, `full_name`, `bio`, `avatar_url`, `is_public_profile` — `UpdateUserDto`, `tradingjournal-backend/src/users/dto/update-user.dto.ts:11-52`), `DELETE /users/me/avatar` — all in `users.controller.ts:16-71`, all behind `JwtAuthGuard`, all currently unused by any frontend page.
- `refresh_tokens` table (`schema.prisma:194-218`) already has everything needed for session revocation: `user_id`, `family_id` (one per login/device), `revoked_at`. `RefreshTokenService.revokeFamily(familyId)` (`refresh-token.service.ts:178-183`) already revokes one family. **No "revoke every family for a user" method exists yet** — would be a small addition (`updateMany({ where: { user_id, revoked_at: null }, data: { revoked_at: now } })`), not a schema change.
- `users.password` (hashed, `bcrypt` already a dependency) — no separate password-history table.
- No export-data endpoint of any kind exists today. The closest precedent in the codebase is CSV *import* (`trades.controller.ts` around line 119) — confirms file-upload/response patterns aren't new to this codebase, but there's no existing export-my-data code to build on.
- No account-deletion endpoint, soft or hard, exists anywhere.
- `users` has **20 owned relations** (`schema.prisma:143-165`): `portfolios`, `subscriptions` (Stripe-linked, `onDelete: Cascade`), `trades`, `posts`, `comments`, `post_likes`, `chat_messages`, `user_missions`, `point_transactions`, `token_transactions`, `pinned_news`, `pinned_market_news`, `share_logs`, `watchlist`, `lesson_progress`, `readiness_assessments`, `coach_sessions`, `dividends`, `ai_usage_logs`, `refresh_tokens`, `broker_connections` (which itself holds encrypted broker credentials). A real account-deletion feature touches all of this.

### Gap

No frontend settings page at all, and 3 of the 4 requested backend capabilities (change password, export data, delete account) don't exist yet even as endpoints. Only "edit profile" is backend-ready today.

### Proposed design

**1. Edit profile** — build `SettingsPage.vue` on top of the *existing* `PATCH /users/me`. No backend work needed. New route (e.g. `/Settings`), reachable from wherever the user's avatar/account menu already lives.

**2. Change password**
- New `POST /users/me/password` (`JwtAuthGuard`), body: `{ currentPassword, newPassword }`. Verify `currentPassword` against `users.password` via `bcrypt.compare` before writing the new hash — this is a security-sensitive write, always requiring the current password, never trusting a bare "logged in" state alone.
- **On success, revoke every OTHER refresh-token family for that user** (all `family_id`s except the one the current request's access token was issued under, if that's determinable from the request — otherwise revoke all families and let this device's next silent-refresh attempt fail gracefully back to login, whichever is simpler to implement correctly). This is exactly what "revoke other refresh tokens when it changes" in the brief means: a stolen session shouldn't survive a password change.
- Rate-limit this endpoint (this repo already has `@nestjs/throttler` wired in for other routes, e.g. `auth.throttle.spec.ts` — same pattern applies here) since it's a password-guessing surface.

**3. Export my data (JSON)**
- New `GET /users/me/export` (`JwtAuthGuard`), returns a single JSON document assembling the user's own rows across the relations that are plausibly "their data" for a PDPA-style data-portability request: profile fields, `trades`, `portfolios`, `dividends`, `watchlist`, `posts`/`comments` they authored, `broker_connections` metadata (**never** the encrypted credential blobs — those aren't portable/meaningful to the user and re-exposing them, even encrypted, widens the attack surface for no benefit), `subscriptions`/`token_transactions` (financial history a user reasonably expects to see).
- **Open question for the user**: should this run synchronously (fine while accounts are small) or be queued/emailed as a downloadable link once ready (needed once trade/chat history gets large)? Not deciding here — flagging it as a real scaling question, not a code question.

**4. Delete account — the part genuinely requiring your decision, not mine**

Three open questions, posed rather than answered:

- **Hard delete vs soft delete?** Hard delete (`Cascade` already wired for most relations at the DB level, would just need `broker_connections`' encrypted credentials revoked/wiped and any Stripe subscription cancelled *before* the DB delete, not after) is simple and matches "the user asked to be forgotten" literally. Soft delete (`users.deleted_at`, keep the row, scrub PII fields, exclude from all normal queries) preserves referential integrity for things like `posts`/`comments` other users can still see, `token_transactions`/billing records that may have a legal retention requirement independent of the user's wishes (accounting/tax records), and makes "undo within N days" possible. **This is a real product/legal tradeoff, not an engineering one** — PDPA gives data subjects a right to erasure, but that right isn't absolute where retention is legally required (e.g., transaction/billing records), which argues for *some* soft-delete/anonymization step even under a "hard delete" policy.
- **Cascade behavior for content visible to other users?** If someone deletes their account, do their `posts`/`comments` on the Community Board disappear entirely (breaking other users' comment threads), get reassigned to a "deleted user" placeholder, or stay attributed but anonymized? This is a UX/community-policy call, not something to decide by default.
- **Grace period?** A "delete requested, will be purged in N days, cancel anytime before then" window is standard practice (protects against accidental/coerced deletion, gives time to export data first) but adds real state (`users.deletion_requested_at`, a scheduled job to actually purge) that doesn't exist today. Worth deciding whether this batch's user wants that complexity now or a simpler immediate-delete-with-confirmation-dialog first, with the grace period as a later iteration.

**My recommendation, offered not assumed**: soft-delete with a 14-day grace period and PII-scrubbing (not full row deletion) on actual purge, community content anonymized-but-kept (`"[deleted user]"` attribution) rather than removed — this is the most common pattern for apps with both social features and financial/billing records, but it's a genuine product call for the user to make, not something to build without sign-off.

---

## B2 — Password reset + email verification

### What already exists

- **Nothing.** No `Mailer`/email-sending code, no email provider dependency in `package.json` (checked: no `nodemailer`, `@sendgrid/mail`, `resend`, `@aws-sdk/client-ses`, `mailgun`), no token table for either reset or verification, no `users.email_verified_at` column, no relevant frontend pages.
- The `refresh_tokens` table's design (hashed-at-rest token, `expires_at`, single-use via `used_at`, `family_id` for bulk revocation) is the right pattern to mirror for BOTH reset and verification tokens — proven, already reviewed, no reason to invent a different token-storage shape for these.

### Proposed design

**`Mailer` interface** (the brief's own ask — build around this so a real provider can plug in later without a redesign):

```ts
// src/mail/mailer.interface.ts
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
```

- **Dev transport now**: `ConsoleMailer implements Mailer` — logs the message (to a logger, not to the console the credential-scan rule would flag) instead of sending. Nothing to configure, works immediately, matches "for now."
- **Real transport later**: a `SmtpMailer`/`ResendMailer`/etc. behind the same interface, selected via a `MAIL_TRANSPORT` env var (name only — no key chosen or assumed here, since "company domain" implies a specific provider decision the user hasn't made yet, and this whole item is explicitly gated on that in the standing rules ["skip anything that would need a new API key"]).
- Wire via a `MailModule` with `useFactory` picking the transport by env var, so nothing about the *calling* code (password-reset/verification services) needs to know or care which transport is live.

**Password reset flow**:
1. `POST /auth/forgot-password { email }` — always returns 200 regardless of whether the email exists (don't leak account existence). If it exists, generate a random token (crypto-random, ≥32 bytes), store **only its SHA-256 hash** (same reasoning as `refresh_tokens.token_hash` — the raw value has enough entropy that a slow hash isn't needed, and reversibility isn't wanted either way), `expires_at` = now + 30-60 min (short-lived, unlike a refresh token — this is a one-shot credential-recovery action, not an ongoing session), single-use via a `used_at` column. Send the raw token in a reset-link email via `Mailer`.
2. `POST /auth/reset-password { token, newPassword }` — hash the incoming token, look up an unexpired/unused row, verify, set new password hash, mark the token used, **revoke all refresh-token families for that user** (same reasoning as B1's change-password: a password reset is exactly the scenario where you want every existing session killed).
3. **Rate limiting**: both endpoints need it — `forgot-password` against enumeration/spam (rate-limit per IP and per email), `reset-password` against token-guessing (rate-limit per IP; the token's own entropy is the real defense, rate-limiting is defense-in-depth).

**Email verification flow**:
1. On signup, generate a similar hashed, expiring, single-use token; send a verification email; set `users.email_verified_at = null` until confirmed.
2. `GET /auth/verify-email?token=...` — hash, look up, verify, set `email_verified_at = now()`, mark token used.
3. **Open question, not decided here**: should unverified users be blocked from any features, or just shown a "please verify" banner? This app currently has no such gate anywhere — adding one is a product decision (it directly affects signup-to-first-value time), so this plan only proposes the *mechanism*, not whether/where to enforce it.

### Schema changes this would need (listed only, not applied)

```prisma
model password_reset_tokens {
  id         Int       @id @default(autoincrement())
  user_id    Int
  token_hash String    @db.VarChar(64)
  expires_at DateTime  @db.Timestamp(6)
  used_at    DateTime? @db.Timestamp(6)
  created_at DateTime  @default(now()) @db.Timestamp(6)
  users      users     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id])
}

model email_verification_tokens {
  id         Int       @id @default(autoincrement())
  user_id    Int
  token_hash String    @db.VarChar(64)
  expires_at DateTime  @db.Timestamp(6)
  used_at    DateTime? @db.Timestamp(6)
  created_at DateTime  @default(now()) @db.Timestamp(6)
  users      users     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id])
}
```

Plus one new column on `users`: `email_verified_at DateTime? @db.Timestamp(6)` (null = unverified).

**Not applied** — per the standing rules (no schema changes, no new migrations without asking first). Flagged here exactly as asked.

---

## B3 — Legal

See the four documents below. **Every one is explicitly marked as a draft requiring real legal review before use** — these are structurally complete and grounded in what the app *actually does* (checked against the real codebase: AI features that generate financial-adjacent content, Stripe billing, a Neon/Postgres database, broker credential storage, community features), not generic boilerplate, but they are not a substitute for a Thai-qualified lawyer's review, especially for the PDPA sections.

### 1. Terms of Service (draft)

> **⚠️ DRAFT — NOT LEGAL ADVICE. REQUIRES REVIEW BY A QUALIFIED LAWYER BEFORE PUBLICATION OR USE.**

**English:**

# Terms of Service — Wisenancial

*Last updated: [DATE] · Draft v0.1*

**1. Acceptance of Terms.** By creating an account or using Wisenancial ("the Service"), you agree to these Terms. If you do not agree, do not use the Service.

**2. What the Service Is.** Wisenancial is a trading and investment journal and analytics tool. It helps you record trades, track portfolio performance, and access market data, news, and AI-generated summaries. **The Service is not a broker, is not a financial advisor, and does not execute trades on your behalf.**

**3. No Investment Advice.** Nothing in the Service — including AI-generated summaries, risk analyses, "AI Picks," coaching content, or any other feature — constitutes financial, investment, tax, or legal advice. All content is for informational and educational purposes only. You are solely responsible for your own investment decisions. See the AI Disclaimer below, which applies throughout the Service.

**4. Accounts.** You must provide accurate information when registering and are responsible for keeping your login credentials secure. You must be of legal age in your jurisdiction to use the Service.

**5. Subscriptions and Payments.** Paid features are billed via our payment processor (Stripe). Fees, billing cycles, and refund terms are as displayed at the time of purchase. [Placeholder — refund policy to be confirmed with the user before publishing.]

**6. Broker Connections.** If you connect a third-party broker account, you authorize the Service to read your trading data for the purpose of importing it into your journal. Credentials are stored encrypted. You may disconnect at any time from account settings.

**7. User Content.** Content you post (journal entries, community posts, comments) remains yours. By posting in community areas, you grant the Service a license to display that content to other users as part of normal operation.

**8. Acceptable Use.** You agree not to misuse the Service, attempt to access other users' data, reverse-engineer the Service, or use it for any unlawful purpose.

**9. Disclaimers and Limitation of Liability.** The Service is provided "as is." Market data may be delayed or inaccurate. AI-generated content may be incorrect. To the maximum extent permitted by law, Wisenancial is not liable for trading losses, investment decisions, or damages arising from use of the Service. [Placeholder — liability cap and jurisdiction-specific carve-outs need legal input.]

**10. Termination.** You may delete your account at any time [see Privacy Policy for what happens to your data]. We may suspend or terminate accounts that violate these Terms.

**11. Changes to These Terms.** We may update these Terms; continued use after an update constitutes acceptance.

**12. Governing Law.** [Placeholder — to be specified; likely Thailand given the target market, but this must be a deliberate legal decision, not a default.]

**13. Contact.** [Placeholder — support/legal contact email.]

---

**Thai (ไทย):**

# ข้อกำหนดการให้บริการ — Wisenancial

*อัปเดตล่าสุด: [วันที่] · ฉบับร่าง v0.1*

**1. การยอมรับข้อกำหนด** การสร้างบัญชีหรือใช้งาน Wisenancial ("บริการ") ถือว่าท่านยอมรับข้อกำหนดนี้ หากไม่ยอมรับ กรุณางดใช้บริการ

**2. บริการนี้คืออะไร** Wisenancial เป็นเครื่องมือบันทึกการเทรด ติดตามพอร์ตการลงทุน และวิเคราะห์ข้อมูล ช่วยให้ท่านบันทึกรายการเทรด ติดตามผลตอบแทนของพอร์ต และเข้าถึงข้อมูลตลาด ข่าวสาร และสรุปที่สร้างโดย AI **บริการนี้ไม่ใช่โบรกเกอร์ ไม่ใช่ที่ปรึกษาทางการเงิน และไม่ดำเนินการซื้อขายแทนท่าน**

**3. ไม่ใช่คำแนะนำการลงทุน** เนื้อหาทุกส่วนในบริการ — รวมถึงสรุปที่สร้างโดย AI, การวิเคราะห์ความเสี่ยง, "AI Picks", เนื้อหาจากโค้ช หรือฟีเจอร์อื่นใด — ไม่ถือเป็นคำแนะนำทางการเงิน การลงทุน ภาษี หรือกฎหมาย เนื้อหาทั้งหมดมีไว้เพื่อการให้ข้อมูลและการศึกษาเท่านั้น ท่านเป็นผู้รับผิดชอบแต่เพียงผู้เดียวต่อการตัดสินใจลงทุนของท่าน โปรดดูคำปฏิเสธความรับผิดชอบเกี่ยวกับ AI ด้านล่าง ซึ่งมีผลบังคับใช้ตลอดทั้งบริการ

**4. บัญชีผู้ใช้** ท่านต้องให้ข้อมูลที่ถูกต้องเมื่อสมัครสมาชิก และรับผิดชอบในการรักษาความปลอดภัยของข้อมูลเข้าสู่ระบบ ท่านต้องมีอายุตามที่กฎหมายกำหนดในเขตอำนาจศาลของท่านจึงจะใช้บริการได้

**5. การสมัครสมาชิกแบบเสียเงินและการชำระเงิน** ฟีเจอร์แบบเสียเงินเรียกเก็บผ่านผู้ให้บริการชำระเงิน (Stripe) ค่าธรรมเนียม รอบการเรียกเก็บ และเงื่อนไขการคืนเงินเป็นไปตามที่แสดง ณ เวลาที่ซื้อ [ตัวยึด — นโยบายการคืนเงินต้องยืนยันกับผู้ใช้ก่อนเผยแพร่จริง]

**6. การเชื่อมต่อโบรกเกอร์** หากท่านเชื่อมต่อบัญชีโบรกเกอร์ภายนอก ท่านอนุญาตให้บริการอ่านข้อมูลการเทรดของท่านเพื่อนำเข้าสู่สมุดบันทึกของท่าน ข้อมูลรับรองตัวตนจะถูกเข้ารหัสก่อนจัดเก็บ ท่านสามารถยกเลิกการเชื่อมต่อได้ทุกเมื่อจากหน้าตั้งค่าบัญชี

**7. เนื้อหาของผู้ใช้** เนื้อหาที่ท่านโพสต์ (บันทึกการเทรด โพสต์ในชุมชน ความคิดเห็น) ยังคงเป็นของท่าน การโพสต์ในพื้นที่ชุมชนถือว่าท่านอนุญาตให้บริการแสดงเนื้อหานั้นแก่ผู้ใช้อื่นตามการทำงานปกติของระบบ

**8. การใช้งานที่เหมาะสม** ท่านตกลงจะไม่ใช้บริการในทางที่ผิด ไม่พยายามเข้าถึงข้อมูลของผู้ใช้อื่น ไม่ทำวิศวกรรมย้อนกลับกับบริการ และไม่ใช้เพื่อวัตถุประสงค์ที่ผิดกฎหมาย

**9. ข้อจำกัดความรับผิดชอบ** บริการนี้ให้บริการ "ตามสภาพที่เป็นอยู่" ข้อมูลตลาดอาจล่าช้าหรือไม่ถูกต้อง เนื้อหาที่สร้างโดย AI อาจผิดพลาด Wisenancial ไม่รับผิดชอบต่อความสูญเสียจากการเทรด การตัดสินใจลงทุน หรือความเสียหายที่เกิดจากการใช้บริการ เท่าที่กฎหมายอนุญาต [ตัวยึด — เพดานความรับผิดและข้อยกเว้นตามเขตอำนาจศาลต้องผ่านการตรวจสอบทางกฎหมาย]

**10. การยุติการใช้บริการ** ท่านสามารถลบบัญชีได้ทุกเมื่อ [ดูนโยบายความเป็นส่วนตัวสำหรับรายละเอียดว่าข้อมูลของท่านจะเป็นอย่างไร] เราอาจระงับหรือยุติบัญชีที่ละเมิดข้อกำหนดนี้

**11. การเปลี่ยนแปลงข้อกำหนด** เราอาจปรับปรุงข้อกำหนดนี้ การใช้บริการต่อหลังการปรับปรุงถือเป็นการยอมรับ

**12. กฎหมายที่ใช้บังคับ** [ตัวยึด — ต้องระบุ คาดว่าจะเป็นประเทศไทยตามกลุ่มเป้าหมาย แต่ต้องเป็นการตัดสินใจทางกฎหมายที่ชัดเจน ไม่ใช่ค่าเริ่มต้น]

**13. ติดต่อ** [ตัวยึด — อีเมลฝ่ายสนับสนุน/กฎหมาย]

---

### 2. Privacy Policy (draft, PDPA-oriented)

> **⚠️ DRAFT — NOT LEGAL ADVICE. REQUIRES REVIEW BY A QUALIFIED LAWYER (PDPA-SPECIALIZED) BEFORE PUBLICATION OR USE.**

**English:**

# Privacy Policy — Wisenancial

*Last updated: [DATE] · Draft v0.1*

This policy explains how Wisenancial collects, uses, and protects your personal data, in line with Thailand's Personal Data Protection Act (PDPA).

**1. Data We Collect.** Account data (name, username, email, hashed password); trading/investment data you enter (trades, portfolios, dividends); broker connection data (encrypted credentials, imported trade history) if you choose to connect a broker; usage data (AI feature usage, community posts/comments); payment data (handled by Stripe — we do not store your card details); technical data (IP address, device/browser info, for security and session management).

**2. Why We Collect It (Legal Basis).** To provide the Service you've signed up for (contract performance); to secure your account (legitimate interest); to process payments (contract performance); with your consent, for optional features (e.g. AI analysis of your portfolio, marketing communications if introduced later).

**3. AI Features.** Some features send your trade/portfolio data to third-party AI providers (currently Groq, Google Gemini, OpenAI, and Anthropic, used as configured) to generate summaries and analysis. [Placeholder — this needs the user's confirmation of exactly which providers are live in production before this section is finalized, since that determines which providers' own data-handling terms apply to your data.] We do not knowingly send this data for the providers' own model training beyond what each provider's own API terms specify.

**4. Data Sharing.** We share data with: Stripe (payments), the AI providers listed above (for AI features you use), our hosting/database provider (Neon, PostgreSQL hosting), and no one else, except as required by law.

**5. Data Retention.** [Placeholder — depends on the account-deletion design decided in B1. Financial/billing records may need to be retained longer than account data for legal/tax reasons even after account deletion — this needs a specific retention schedule, not a blanket policy.]

**6. Your Rights Under PDPA.** You have the right to: access your data (see "Export my data" in Settings, once built); rectify inaccurate data (edit profile); erase your data (delete account — subject to the retention exceptions noted above); withdraw consent for optional processing at any time; data portability (the JSON export); object to certain processing; lodge a complaint with Thailand's Personal Data Protection Committee (PDPC) if you believe your rights have been violated.

**7. Data Security.** Passwords are hashed (never stored in plain text). Broker credentials are encrypted at rest. [Placeholder — this section should name the actual encryption standards used, confirmed against the real implementation, before publishing — do not publish unverified security claims.]

**8. Children.** The Service is not directed at children under [age — placeholder, depends on jurisdiction-specific age of consent for data processing].

**9. Changes to This Policy.** We will notify users of material changes.

**10. Contact / Data Protection Officer.** [Placeholder — PDPA generally expects a designated contact point for data subject requests; who this is needs to be decided by the user, not assumed.]

---

**Thai (ไทย):**

# นโยบายความเป็นส่วนตัว — Wisenancial

*อัปเดตล่าสุด: [วันที่] · ฉบับร่าง v0.1*

นโยบายนี้อธิบายวิธีที่ Wisenancial เก็บรวบรวม ใช้ และคุ้มครองข้อมูลส่วนบุคคลของท่าน ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)

**1. ข้อมูลที่เราเก็บรวบรวม** ข้อมูลบัญชี (ชื่อ ชื่อผู้ใช้ อีเมล รหัสผ่านที่เข้ารหัส) ข้อมูลการเทรด/การลงทุนที่ท่านกรอกเอง (รายการเทรด พอร์ตการลงทุน เงินปันผล) ข้อมูลการเชื่อมต่อโบรกเกอร์ (ข้อมูลรับรองตัวตนที่เข้ารหัส ประวัติการเทรดที่นำเข้า) หากท่านเลือกเชื่อมต่อโบรกเกอร์ ข้อมูลการใช้งาน (การใช้ฟีเจอร์ AI โพสต์/ความคิดเห็นในชุมชน) ข้อมูลการชำระเงิน (จัดการโดย Stripe — เราไม่จัดเก็บข้อมูลบัตรของท่าน) ข้อมูลทางเทคนิค (IP address ข้อมูลอุปกรณ์/เบราว์เซอร์ เพื่อความปลอดภัยและการจัดการเซสชัน)

**2. เหตุผลในการเก็บรวบรวม (ฐานทางกฎหมาย)** เพื่อให้บริการตามที่ท่านสมัครใช้ (การปฏิบัติตามสัญญา) เพื่อรักษาความปลอดภัยบัญชีของท่าน (ประโยชน์โดยชอบด้วยกฎหมาย) เพื่อประมวลผลการชำระเงิน (การปฏิบัติตามสัญญา) และด้วยความยินยอมของท่านสำหรับฟีเจอร์ที่เป็นทางเลือก (เช่น การวิเคราะห์พอร์ตด้วย AI หรือการสื่อสารทางการตลาดหากมีในอนาคต)

**3. ฟีเจอร์ AI** บางฟีเจอร์ส่งข้อมูลการเทรด/พอร์ตของท่านไปยังผู้ให้บริการ AI ภายนอก (ปัจจุบันคือ Groq, Google Gemini, OpenAI และ Anthropic ตามที่ตั้งค่าไว้) เพื่อสร้างสรุปและบทวิเคราะห์ [ตัวยึด — ส่วนนี้ต้องได้รับการยืนยันจากผู้ใช้ว่าผู้ให้บริการรายใดใช้งานจริงใน production ก่อนสรุปเนื้อหาสุดท้าย เนื่องจากจะกำหนดว่าข้อกำหนดการจัดการข้อมูลของผู้ให้บริการรายใดมีผลกับข้อมูลของท่าน] เราจะไม่ส่งข้อมูลนี้ไปใช้ฝึกโมเดลของผู้ให้บริการนอกเหนือจากที่ระบุไว้ในข้อกำหนดการใช้ API ของผู้ให้บริการแต่ละราย

**4. การเปิดเผยข้อมูล** เราเปิดเผยข้อมูลแก่: Stripe (การชำระเงิน) ผู้ให้บริการ AI ที่ระบุข้างต้น (สำหรับฟีเจอร์ AI ที่ท่านใช้) ผู้ให้บริการโฮสติ้ง/ฐานข้อมูลของเรา (Neon, PostgreSQL) และไม่มีบุคคลอื่นใดอีก เว้นแต่กฎหมายกำหนด

**5. ระยะเวลาการเก็บรักษาข้อมูล** [ตัวยึด — ขึ้นอยู่กับการออกแบบการลบบัญชีที่ตัดสินใจใน B1 บันทึกทางการเงิน/การเรียกเก็บเงินอาจต้องเก็บรักษานานกว่าข้อมูลบัญชีด้วยเหตุผลทางกฎหมาย/ภาษี แม้หลังลบบัญชีแล้ว ต้องมีตารางระยะเวลาที่ชัดเจน ไม่ใช่นโยบายเหมารวม]

**6. สิทธิของท่านตาม PDPA** ท่านมีสิทธิ: เข้าถึงข้อมูลของท่าน (ดู "ส่งออกข้อมูลของฉัน" ในหน้าตั้งค่า เมื่อสร้างเสร็จ) แก้ไขข้อมูลที่ไม่ถูกต้อง (แก้ไขโปรไฟล์) ลบข้อมูล (ลบบัญชี — อยู่ภายใต้ข้อยกเว้นเรื่องการเก็บรักษาข้างต้น) ถอนความยินยอมสำหรับการประมวลผลที่เป็นทางเลือกได้ทุกเมื่อ การโอนย้ายข้อมูล (การส่งออกไฟล์ JSON) คัดค้านการประมวลผลบางประเภท และร้องเรียนต่อคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส./PDPC) หากท่านเชื่อว่าสิทธิของท่านถูกละเมิด

**7. ความปลอดภัยของข้อมูล** รหัสผ่านถูกเข้ารหัสแบบ hash (ไม่เก็บเป็นข้อความธรรมดา) ข้อมูลรับรองตัวตนของโบรกเกอร์ถูกเข้ารหัสขณะจัดเก็บ [ตัวยึด — ส่วนนี้ควรระบุมาตรฐานการเข้ารหัสจริงที่ใช้ ยืนยันกับการทำงานจริงของระบบก่อนเผยแพร่ — ห้ามเผยแพร่คำกล่าวอ้างด้านความปลอดภัยที่ยังไม่ได้ตรวจสอบ]

**8. เด็ก** บริการนี้ไม่ได้มุ่งเป้าไปยังเด็กอายุต่ำกว่า [อายุ — ตัวยึด ขึ้นอยู่กับอายุความยินยอมด้านการประมวลผลข้อมูลตามกฎหมายแต่ละเขตอำนาจ]

**9. การเปลี่ยนแปลงนโยบาย** เราจะแจ้งผู้ใช้เมื่อมีการเปลี่ยนแปลงที่มีนัยสำคัญ

**10. ติดต่อ / เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล** [ตัวยึด — โดยทั่วไป PDPA คาดหวังให้มีช่องทางติดต่อที่ชัดเจนสำหรับคำร้องของเจ้าของข้อมูล ต้องให้ผู้ใช้เป็นผู้ตัดสินใจว่าใครทำหน้าที่นี้ ไม่ใช่การสมมติเอาเอง]

---

### 3. AI Disclaimer (draft — to show at AI features)

> **⚠️ DRAFT — NOT LEGAL ADVICE. REQUIRES REVIEW BEFORE PUBLICATION OR USE.**

**English (short form, for inline display near AI-generated content):**

> **Not financial advice.** This content is generated by AI based on the data provided and may be incomplete or inaccurate. It is for informational purposes only and is not a recommendation to buy, sell, or hold any asset. Always do your own research and consult a licensed financial advisor before making investment decisions.

**Thai (ไทย, รูปแบบสั้นสำหรับแสดงข้างเนื้อหาที่สร้างโดย AI):**

> **ไม่ใช่คำแนะนำทางการเงิน** เนื้อหานี้สร้างโดย AI จากข้อมูลที่ได้รับ อาจไม่ครบถ้วนหรือไม่ถูกต้อง มีไว้เพื่อการให้ข้อมูลเท่านั้น ไม่ใช่คำแนะนำให้ซื้อ ขาย หรือถือครองสินทรัพย์ใดๆ โปรดศึกษาข้อมูลด้วยตนเองและปรึกษาที่ปรึกษาทางการเงินที่ได้รับอนุญาตก่อนตัดสินใจลงทุน

*(Implementation note, not a legal one: this repo already has `investmentGuardrail()`/`concisenessRule()` shared prompt fragments in `src/ai/ai-prompt.shared.ts` that bake similar constraints into the AI's own output — this disclaimer is a UI-level addition on top of that, not a replacement for it. Where exactly in the UI this should render — every AI card individually vs. one persistent banner per AI-containing page — is a design decision for whoever implements this, not decided here.)*

---

### 4. Signup Consent Checkbox (draft)

> **⚠️ DRAFT — REQUIRES REVIEW BEFORE USE.**

**English:**

> ☐ I agree to the [Terms of Service] and [Privacy Policy], including the use of AI features as described.

**Thai (ไทย):**

> ☐ ฉันยอมรับ [ข้อกำหนดการให้บริการ] และ [นโยบายความเป็นส่วนตัว] รวมถึงการใช้ฟีเจอร์ AI ตามที่อธิบายไว้

*(Should be a required, unticked-by-default checkbox on the registration form, per PDPA's requirement that consent be an affirmative, freely-given act — not pre-checked. `RegisterDto`/`RegisterPage.vue` don't currently have a field for this; adding one is implementation, not part of this investigation-only item.)*

---

## Summary of what needs the user's decision before any of B1-B3 becomes implementation work

1. **B1**: hard vs. soft delete, cascade behavior for community content, whether a grace period is wanted now or later.
2. **B1**: export-my-data — synchronous or queued/emailed?
3. **B2**: which real mail provider/transport for production (blocked on "company domain" per the original ask — nothing chosen here).
4. **B2**: whether/where to gate unverified-email users.
5. **B3**: every `[Placeholder]` in the four documents above — refund policy, liability cap, governing law/jurisdiction, exact AI providers live in production, data retention schedule, actual encryption standards to claim, age of consent, and who the designated contact/DPO is. **None of these were guessed at** — they're each flagged as needing a real answer from the user or counsel, not filled in with a plausible-sounding default.

---

## B1 — implementation status (2026-09-26)

Implemented per the decisions below. Everything except account deletion needs no schema change and is on `main`; account deletion (schema + migration + code + UI) is on branch `feat/account-deletion`, **migration not applied** — SQL awaiting review.

| Capability | Endpoint | Notes |
|---|---|---|
| Edit profile | existing `PATCH /users/me`, `DELETE /users/me/avatar` | UI only. `GET /users/me` now also returns `is_public_profile`. |
| Change password | `POST /auth/change-password` `{ current_password, new_password }` | Needs current password; wrong one = **400** (a 401 would trigger the client's force-logout). Revokes every OTHER refresh-token family; this device is identified through its refresh cookie. Throttled like login. |
| Export my data | `GET /users/me/export` | One JSON bundle, allow-listed columns, no password/Stripe ids/refresh tokens/broker credentials. `Cache-Control: no-store`. Throttled (5/hour/IP, `EXPORT_THROTTLE_*`). Synchronous. |
| Delete account | `POST /users/me/deletion` `{ password }` (branch `feat/account-deletion`) | Soft delete: `users.deletion_scheduled_at = now + 30 days`, all sessions revoked. Login before then clears it (response carries `account_deletion_cancelled: true`, Login page shows a notice). Daily `@Cron('0 3 * * *')` hard-deletes (cascade), logs only counts. |

Deviations from the plan above, on purpose:
- **Change-password lives at `/auth/change-password`, not `/users/me/password`.** The refresh cookie is scoped to path `/auth`, so only endpoints under it can tell which session is "this device"; widening the cookie path would expose the refresh token to every API route.
- **Deleting is refused (409) while a paid Stripe subscription is live**, and the purge job skips such accounts. No Stripe code was touched; the user must cancel the plan first. Consequence: a user who cancelled but is still inside a paid period must wait for `end_date`.
- Community content (posts/comments) stays visible during the grace period; only the public profile page returns 404. After the purge, cascade removes it.

Known limits: access tokens (15 min) issued before a password change / deletion request stay valid until they expire (no deny-list). The export is not paginated (fine up to tens of MB).

## B2 — implementation status (2026-09-27)

Endpoints (all under `/auth`): `POST forgot-password`, `reset-password`, `send-verification` (JWT), `verify-email`.

| Piece | Decision |
|---|---|
| Tokens | 256-bit random, only the SHA-256 is stored (`email_tokens`), single-use (atomic `used_at`), reset 30 min / verify 24 h. A new request voids the older unused link of that purpose. |
| Enumeration | `forgot-password` answers the same message before it even looks the account up, so neither the body nor the timing reveals whether the email exists. Rate-limited (per IP, plus per address: 3/hour and a 60 s cooldown counted from `email_tokens`); over the cap it silently sends nothing. |
| Reset | One transaction: consume token, set bcrypt hash, void other reset links, mark the address verified, revoke every refresh token. One 400 message for every invalid-link case. |
| Verification | The link only verifies while the account still has the address it was sent to. `register` sends the mail without waiting for it. |
| Unverified users | Can use everything except the AI routes that spend credits (`VerifiedEmailGuard`, 403 code `EMAIL_NOT_VERIFIED`; `/ai/models` and `/ai/credits` stay open). A banner with a resend button is shown. |
| AI gate switch | `REQUIRE_VERIFIED_EMAIL_FOR_AI`, **default off**; only the exact value `true` enables it. Enable only after a real mail transport is configured. |
| Mailer | `Mailer` abstract class, `MAIL_TRANSPORT` picks a transport from a registry; only `console` exists and it is the default. Dev logs the link (recipient masked); production never logs the body. Unknown value stops boot. |
| Existing users | The migration backfills `email_verified_at = created_at` (they registered before verification existed). Only new sign-ups start unverified. |

## Backlog (found, deliberately not done yet)

- **`POST /auth/register` reveals whether an email/username is taken** (409 `accountAlreadyExists`). This lets someone probe for registered emails even though `forgot-password` no longer does. The usual fix is to answer identically and send "you already have an account" to the existing address; that needs the real mail transport first. Pre-existing, left as is on purpose.
- Access tokens (15 min) issued before a password reset stay valid until they expire (no deny-list) - same limit as change-password.
- Real mail provider: add a transport to `MAIL_TRANSPORTS` in `src/mail/mail.module.ts`, set `MAIL_TRANSPORT`, then consider `REQUIRE_VERIFIED_EMAIL_FOR_AI=true`.
- Email templates are bilingual TH/EN in one message (no per-user locale is stored yet); plain text only.

## B3 — implementation status (2026-09-27)

Everything here is a **draft** — the texts are copied from the B3 documents above and still carry every `[Placeholder]`. Nothing was filled in or reworded legally.

| Piece | What shipped |
|---|---|
| `/terms`, `/privacy` | Public pages (no login), TH + EN, follow the app language (TH/EN switch on the page). A "DRAFT — pending legal review" banner is always on top, with the count of unresolved placeholders; every `[ ... ]` is highlighted, not hidden. Source: `src/constants/legal.content.ts`. |
| Footer links | Landing footer, the auth pages (Login/Register/forgot/reset/verify), the in-app layout, and the legal pages themselves. |
| AI disclaimer | One component (`WsAiDisclaimer`): short line "Not financial advice…" + link "Read the full disclaimer" to `/terms#ai-disclaimer` (the full draft AI Disclaimer is the last section of Terms). Now on AI Insights, Portfolio Advisor, Risk Analysis, AI Picks **and the AI summaries in News** (that one was missing). A coverage test fails if a new screen renders `.aiSummary` without it. |
| Signup consent | Required checkbox, unticked by default, links open in a new tab. The client reads the current terms version from the public `GET /legal/terms-version` (`Cache-Control: no-store`) and sends it back; the server rejects a mismatch (400), sets `accepted_at` itself and stores both. Sign-up is unavailable while the version cannot be loaded (retry button). **Migration `20260928000000_add_terms_acceptance_to_users` (on `feat/legal-consent`, applied when that branch was merged).** Two nullable columns on `users`: `accepted_terms_version`, `accepted_terms_at`. Included in the data export. |

Decisions worth knowing:
- Existing users are **not** backfilled: NULL/NULL = "no consent recorded". We do not claim a consent nobody gave.
- **Single source for the terms version: the backend** (`CURRENT_TERMS_VERSION` in `src/legal/legal.constants.ts`). The frontend has no copy; a test fails if a version literal or `TERMS_VERSION` reappears in frontend code. Trade-off: the version now proves "the server's current version at the time of signup", no longer "the version of the text the browser bundle displayed" - a browser holding a stale cached bundle would still record the new version. Bump the version only when the frontend text is deployed at the same time.
- The short AI line on the cards is our wording, not lawyer text; only the full disclaimer on the Terms page is the reviewed-candidate draft. Same for the Thai banner text.
- The links to `/terms` from the consent checkbox and the AI cards open in a new tab so a half-filled form or a paid analysis is not lost.

Backlog found while doing B3 (not done):
- **REQUIRED BEFORE LAUNCH, once the texts are final: re-consent prompt for existing users.** Existing accounts have no consent record (NULL/NULL). Needs a "please accept the updated terms" step on next login (and again whenever `CURRENT_TERMS_VERSION` changes), storing the same two columns. Deliberately not built yet - the texts are still drafts.
- **Advice wording (done, guarded by `advice-wording.spec.ts`):** the landing page (Thai only - it has no English copy) no longer promises "คำแนะนำ(การลงทุน) จาก AI"; the in-app labels that read as advice were reworded: "AI Portfolio Advisor / ที่ปรึกษาพอร์ต AI" -> "AI Portfolio Review / รีวิวพอร์ตด้วย AI", "Actionable Recommendations" -> "Points to Consider", DCA "Recommendations" -> "Observations", Momentum Radar "Near Recommended / Not Recommended" -> "Near Threshold / Below Threshold" (category keys unchanged), and the "recommendations" error/empty texts. **Not changed, owner decision:** the Stock Analysis technical labels "Strong Buy / Buy Signal / Sell Signal" and the analyst-rating badge (third-party data) - directive-sounding but indicator output, not our advice.
- `generateQuiz` exists in the AI store but no screen renders it yet — add the disclaimer (and the file to the coverage test list) when a quiz UI is built.
- Privacy Policy §6 says "Export my data … once built": the export now exists (`GET /users/me/export`); the wording is a lawyer/owner call.
- Every `[Placeholder]` in Terms/Privacy still needs a real answer (refund policy, liability cap, governing law, live AI providers, retention schedule, encryption standards, minimum age, contact/DPO, last-updated date).
