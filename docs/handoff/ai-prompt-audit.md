# AI Prompt Audit — Wisenancial / TradingJournal

วันที่ตรวจ: 2026-08-27
ขอบเขต: ทุก prompt (system + user) ที่ส่งให้ LLM จริง ทั้ง backend/frontend ที่ประกอบ prompt เหล่านั้น
สถานะ: **รายงานอย่างเดียว — ยังไม่ได้แก้โค้ด AI จริงตัวใดเลย** รอ Rem อนุมัติ scope ตามข้อ 4

---

## สรุปสำหรับ Rem (อ่าน 30 วินาที)

1. **prompt จริงที่ยิงเข้า LLM มีทั้งหมด 8 จุด** อยู่ใน backend ล้วน (`tradingjournal-backend/src/ai/*.service.ts`) ยิงผ่าน `AiManagerService.executeAiRequest` (ผู้ใช้เลือกโมเดล จ่ายเครดิต) หรือ `executeSystemAiRequest` (ระบบเลือกเอง ไม่คิดเงินผู้ใช้ — ใช้แค่จุดเดียวคือ news enrichment อัตโนมัติ)
2. **เรื่องที่ต้องแก้ความเข้าใจก่อน**: 2 ใน 3 ฟีเจอร์ที่ระบุมาในโจทย์ ("AI Insights" บน StockAnalysisPage/StockTerminal และ "Watchlist AI Radar") **ไม่ได้เรียก LLM เลย** — เป็นคำนวณตัวเลขล้วนๆ ที่ติดป้าย "AI" ไว้เฉยๆ (ดูข้อ 0) ส่วน "AI Insights" ที่เรียก LLM จริงอยู่ที่ **AnalyticsPage.vue** (การ์ดวิเคราะห์กราฟในแท็บ Analytics ของทั้ง Trader/Investor) ไม่ใช่หน้า Stock Terminal
3. **ปัญหาที่กระทบมากที่สุด 3 อันดับแรก** (รายละเอียดเต็มในขั้นที่ 2):
   - AI Picks (`getGrowthRecommendations`) ให้ LLM "แนะนำหุ้น 4-5 ตัว" **โดยไม่ป้อนข้อมูลราคา/ปัจจัยพื้นฐานจริงเข้าไปเลยแม้แต่ตัวเดียว** — โมเดลต้องเดาเอาจากความรู้เก่า (knowledge cutoff) แล้วเราขอแค่ "อย่าโกหกว่ามีราคาสด" แทนที่จะแก้ที่ต้นตอคือป้อนข้อมูลจริง
   - AI Risk Analysis ให้กติกาตัดสิน risk อิงตัวเลข beta/D-E/P-E (`>1.2`, `>1.0`, `>30`) แต่ **frontend ไม่เคยส่งค่าพวกนี้ไปเลย** (`AnalyticsPage.vue:246-263` ส่งแค่ symbol/quantity/weight/currentPrice) โมเดลจึงตัดสิน risk จากฟิลด์ที่เป็น `null` ทุกครั้ง — บั๊กจริง ไม่ใช่แค่ prompt ไม่ดี
   - ภาษา output ไม่คงเส้นคงวาข้ามฟีเจอร์: บางจุดบังคับ "Reply in Thai" ตายตัว (ไม่สนภาษาที่ผู้ใช้ตั้งในแอป), บางจุดไม่พูดถึงภาษาเลย, บางจุดฝากความหวังไว้กับฟิลด์ข้อมูลแทนคำสั่งจริง — ผู้ใช้ไทยรายย่อยจะเจอคำตอบสลับภาษาแบบสุ่มตามฟีเจอร์
4. Anthropic provider (`claude-sonnet-5`, โมเดลแพงสุด) **ไม่ได้ใช้ค่า default กลาง** (`DEFAULT_TEMPERATURE`/`DEFAULT_MAX_OUTPUT_TOKENS`) เหมือน 3 เจ้าที่เหลือ แต่ hardcode ของตัวเอง (`temperature ?? 0.2`, `max_tokens ?? 1200`) — ตอนนี้ยังไม่ระเบิดเพราะทุก caller ส่ง `maxOutputTokens` มาเองอยู่แล้ว แต่เป็นกับดักที่รอวันมีจุดใหม่ไม่ส่งค่ามา แล้ว Claude จะถูกตัดคำตอบที่ 1200 token ทั้งที่เจ้าอื่นได้ 4096

---

## ขั้นที่ 0 — ก่อนอื่น: อันไหน "AI" จริง (มี prompt), อันไหนแค่ป้าย

| ฟีเจอร์ตามที่ผู้ใช้เห็น | เรียก LLM จริงไหม | endpoint จริง | ไฟล์ backend |
|---|---|---|---|
| "AI S1/S2/R1/R2" บน StockAnalysisPage/StockTerminal (`fetchAIAnalysis`) | **ไม่** — คำนวณ support/resistance จาก min/max ของราคาปิด 20/90 วันจาก Yahoo history + RSI ล้วนๆ | `GET /market/analysis/:symbol` | `market/market.service.ts:328` `getTechnicalAnalysis()` |
| "Watchlist AI Radar" | **ไม่** — จัดหมวด Upside/Downside/Near/Not-recommended จาก % เปลี่ยนแปลงราคาช่วง 1D/1W/1M ล้วนๆ | `GET /stocks/radar` | `stocks/stocks.service.ts:367` `getRadar()` |
| "AI Picks" (growth recommendations) | **ใช่** | `GET /ai/recommendations/growth` | `ai/ai-recommendation.service.ts` |
| "AI Insights" (การ์ดวิเคราะห์กราฟ) | **ใช่** — อยู่ที่ AnalyticsPage.vue ไม่ใช่ StockAnalysisPage/Terminal | `POST /ai/analyze` | `ai/ai.service.ts:31` `analyzeChart()` |
| AI Portfolio Advisor | **ใช่** | `POST /ai/portfolio/:id/review` | `ai/ai.service.ts:65` `reviewPortfolio()` |
| AI Risk Analysis | **ใช่** | `POST /ai/portfolio/risk-analysis` | `ai/ai-risk.service.ts:15` `analyze()` |
| ข่าว: AI enrichment (summary/trend/sentiment) | **ใช่** (auto ตอน sync ข่าว + user-triggered) | ภายใน (cron/news pipeline) / `POST /ai/news/enrich` | `ai/ai.service.ts:173,204` |
| Education quiz | **ใช่** | `POST /ai/education/quiz` | `ai/ai-education.service.ts:13` `generateQuiz()` |

**นัยสำคัญ**: ถ้า Rem ตั้งใจให้ StockAnalysisPage/StockTerminal และ Watchlist มี "AI จริง" วิเคราะห์ (ไม่ใช่แค่คำนวณเลข) ต้องตัดสินใจแยกว่าจะ (ก) ปล่อยไว้แบบเดิมแต่เลิกเรียกว่า "AI" กันผู้ใช้เข้าใจผิด/เสี่ยงประเด็น กลต. เรื่องโฆษณาเกินจริง หรือ (ข) เพิ่ม LLM เข้าไปจริงๆ ในจุดนี้ (เพิ่ม scope งานใหม่ ไม่ใช่แค่ tune prompt เดิม) — ทั้งสองทางเป็นการตัดสินใจเชิงผลิตภัณฑ์ ไม่ใช่เรื่อง prompt engineering ล้วนๆ จึงแยกไว้ในข้อ 4

---

## ขั้นที่ 1 — รายการ prompt จริงทั้งหมด (8 จุด)

โครงกลางที่ทุกจุดใช้ร่วมกัน (`ai/providers/ai-provider.interface.ts:35-39`):
```
DEFAULT_TEMPERATURE = 0.3
DEFAULT_MAX_OUTPUT_TOKENS = 4096      // เพิ่งปรับจาก 2048
AI_REQUEST_TIMEOUT_MS = 30_000
```
โมเดล default ต่อ provider (`ai/ai.models.ts:34-73`): groq → `openai/gpt-oss-20b`, gemini → `gemini-3.6-flash`, openai → `gpt-4o`, anthropic → `claude-sonnet-5`. ลำดับ fallback ของงานระบบ (`AI_SYSTEM_FALLBACK_ORDER`): groq → gemini → openai → anthropic (ถูกไปแพง)

---

### 1) Chart Insight — `ai.service.ts:42-54` (`analyzeChart`)

**System prompt (ทั้งหมด, verbatim):**
```
You are a professional financial analytics coach. Reply in Thai as valid JSON only: {"insight":"concise actionable analysis grounded only in supplied data"}.
```

**User prompt (ทั้งหมด, verbatim — เป็น JSON.stringify ของ):**
```json
{
  "portfolioType": "<TRADER|INVESTOR>",
  "chartType": "<key>",
  "data": "<ข้อมูลกราฟดิบจาก store>",
  "extraContext": {}
}
```

- Context ที่ป้อน: ข้อมูลกราฟของพอร์ตผู้ใช้เอง (equity curve, win rate ฯลฯ — คำนวณจากเทรด/ historical จริงในระบบ) **ไม่มีราคาหุ้นสด/ข่าว** เพราะฟีเจอร์นี้วิเคราะห์พฤติกรรม/ผลงานพอร์ต ไม่ใช่ตัวหุ้น จึงสมเหตุสมผลที่ไม่มีราคาสด
- Output format: JSON เดี่ยว field เดียว `{"insight": string}` — ไม่มี schema บังคับความยาว/โครงสร้างย่อย
- temperature: default (0.3), maxOutputTokens: **800**
- โมเดล: ผู้ใช้เลือกเอง (`executeAiRequest`)

---

### 2) Portfolio Review — Trader — `ai.service.ts:93-113` (`reviewPortfolio`)

**System prompt:**
```
You are a disciplined trading coach. Return valid JSON only.
```

**User prompt (JSON.stringify):**
```json
{
  "task": "Review trader performance and journal behavior",
  "requiredShape": {
    "summary": "string",
    "strengths": ["string"],
    "weaknesses": ["string"],
    "riskWarnings": ["string"],
    "actionableRecommendations": ["string"],
    "disciplineScore": "number 0-100"
  },
  "trades": "<รายการเทรดจริงของผู้ใช้ หรือค่าที่ frontend ส่งมา>",
  "analytics": "<ผล AnalyticsService.overview() จริง>"
}
```

- Context: เทรดจริง + analytics ที่คำนวณจากฐานข้อมูลของระบบเอง (ไม่ใช่ราคาตลาดสด แต่เป็นข้อมูลพฤติกรรมผู้ใช้จริง ตรงตามวัตถุประสงค์ฟีเจอร์)
- Output: JSON schema ชัดเจน 6 field รวม array of string 4 ชุด + ตัวเลข 1 ตัว
- maxOutputTokens: **1400**, temperature default

---

### 3) Portfolio Review — Investor — `ai.service.ts:138-158`

**System prompt:**
```
You are a professional portfolio advisor. Do not predict prices. Return valid JSON only.
```

**User prompt (JSON.stringify):**
```json
{
  "task": "Review investor portfolio health, diversification, and risk",
  "requiredShape": {
    "summary": "string",
    "diversificationScore": "number 0-100",
    "riskProfile": "CONSERVATIVE|MODERATE|AGGRESSIVE",
    "concentrationRisks": ["string"],
    "strengths": ["string"],
    "actionableRecommendations": ["string"]
  },
  "holdings": "<StockPurchasesService.getHoldings() จริง>",
  "analytics": "<AnalyticsService.overview() จริง>"
}
```

- Context: holdings จริงของผู้ใช้ (backend ไปดึงเอง ไม่ใช่ frontend ยัดมา) — เป็นจุดเดียวใน 8 จุดที่มีคำเตือน "Do not predict prices" ชัดเจนใน system prompt
- Output: JSON 6 field, `riskProfile` เป็น enum ปิด
- maxOutputTokens: **1400**

---

### 4) News Enrichment — ระบบ (auto, ไม่คิดเงินผู้ใช้) — `ai.service.ts:181-195`

**System prompt:**
```
You are a financial news analyst. Return valid JSON only with aiSummary, aiTrend, aiImpactProbability, stockImpactAnalysis, sector, importance, sentiment and aiTranslatedSummary.
```

**User prompt (JSON.stringify):**
```json
{
  "language": "<en|th>",
  "headline": "<ตัดที่ 300 ตัวอักษร>",
  "summary": "<ตัดที่ 800 ตัวอักษร>",
  "content": "<ตัดที่ 1500 ตัวอักษร>"
}
```

- Context: เนื้อข่าวจริงจาก news pipeline (สด ตามรอบ sync ข่าว) — เป็นจุดเดียวที่ป้อน "ข้อมูลดิบภายนอก" (ข่าว) เข้า prompt จริง
- Output: บอกแค่ *ชื่อ field* ที่ต้องมี ไม่ได้บอก type/ค่าที่ยอมรับได้ (เช่น `aiTrend` ต้องเป็น `UP|DOWN|SIDEWAY`, `importance` ต้องเป็น `HIGH|MEDIUM|LOW` — ผู้ใช้รู้จาก `normalizeNewsResult()` ที่ validate เอาเองฝั่ง backend ไม่ได้รู้จาก prompt) เสี่ยงให้โมเดลตอบค่านอกขอบเขตแล้วโดน fallback เงียบๆ
- **ไม่มีคำสั่งเรื่องภาษา output เลย** ทั้งที่ `language` เป็น field สำคัญที่ส่งเข้าไป — ฝากความหวังไว้กับโมเดลว่าจะ "เดา" ว่าต้องตอบภาษาไหนจาก field ข้อมูล ไม่ใช่จากคำสั่ง
- maxOutputTokens: **1000**, ใช้ `executeSystemAiRequest` (fallback ข้าม 4 provider ได้อัตโนมัติ)

---

### 5) News Enrichment — user-triggered (คิดเครดิต) — `ai.service.ts:214-228`

System prompt และ user prompt **เหมือนข้อ 4 ทุกตัวอักษร** เพียงแต่ยิงผ่าน `executeAiRequest` (ผู้ใช้เลือกโมเดล, คิดเงิน, ไม่ fallback ข้าม provider) แทน `executeSystemAiRequest`

---

### 6) AI Picks — `ai-recommendation.service.ts:49-73` (`getGrowthRecommendations`)

**System prompt:**
```
You are a quantitative growth-stock analyst. Return a valid JSON array only. Do not invent live prices or precise current metrics.
```

**User prompt (ทั้งหมด, verbatim — เป็น natural-language template ไม่ใช่ JSON.stringify แบบจุดอื่น):**
```
Recommend 4-5 publicly traded growth companies across diverse sectors.
Return ONLY a JSON array with:
[{
  "symbol":"string",
  "name":"string",
  "sector":"string",
  "reasoning":{
    "growth":"string",
    "profit":"string",
    "customerBase":"string",
    "liquidity":"string"
  },
  "aiSummary":"string"
}]
State uncertainty when current data is unavailable. Do not guarantee returns.
```

- **Context ที่ป้อน: ไม่มีเลย** — ไม่มีราคาหุ้น ไม่มี fundamentals ไม่มีข่าว ไม่มี sector allocation ปัจจุบันของผู้ใช้ ไม่มีวันที่ปัจจุบัน โมเดลเดาหุ้น "growth" ล้วนจากความจำเก่าตอนเทรน (knowledge cutoff) แล้วแต่งเหตุผล 4 ด้านขึ้นมาเอง — นี่คือจุดเสี่ยง hallucination สูงสุดในทั้ง 8 จุด เพราะไม่มี "ของจริง" ให้ยึดเลยแม้แต่ตัวเดียว
- Output: JSON array, ไม่มีการปิด `symbol` ไว้เฉพาะตลาดไทย/ตลาดที่ระบบรองรับจริง (ผู้ใช้อาจได้หุ้นสหรัฐฯ ที่ไม่มีในระบบให้ซื้อขายต่อ)
- ไม่มีคำสั่งภาษา output เลย (ต่างจาก analyzeChart ที่บังคับไทยตายตัว)
- maxOutputTokens: **1800**, ระบบเลือกโมเดลเอง ไม่ให้ผู้ใช้เลือก (`GROWTH_MODEL_PREFERENCE`: gemini → groq เท่านั้น ไม่ไล่ถึง openai/anthropic)

---

### 7) AI Risk Analysis — `ai-risk.service.ts:22-45` (`analyze`)

**System prompt:**
```
You are a portfolio risk analyst. Return valid JSON only and rely only on supplied data.
```

**User prompt (JSON.stringify):**
```json
{
  "task": "Assess portfolio risk",
  "requiredShape": {
    "riskLevel": "Low|Moderate|Aggressive",
    "riskScore": "number 0-100",
    "analysisSummary": "string",
    "keyRiskFactors": ["string"]
  },
  "rules": {
    "highBeta": ">1.2",
    "highDebtToEquity": ">1.0",
    "highPe": ">30",
    "concentration": "large portfolio weights"
  },
  "holdings": "<normalizeWeights() ของ holdings ที่ frontend ส่งมา>"
}
```

- **บั๊กจริง ไม่ใช่แค่ prompt ไม่ดี**: `rules` อ้างอิง `beta`/`debtToEquity`/`peRatio` แต่ frontend (`AnalyticsPage.vue:246-263`, `riskHoldings` computed) ส่งมาแค่ `symbol`, `quantity`, `weight`, `currentPrice` เท่านั้น — ไม่เคยแนบ beta/D-E/P-E เลยสักครั้ง ทำให้ `normalizeWeights()` (`ai-risk.service.ts:80-95`) เซ็ตทุกตัวเป็น `null` เสมอ โมเดลจึงประเมิน risk จาก `rules` ที่ไม่มีข้อมูลมาเทียบได้จริง (มีแต่ concentration/weight ที่พอใช้ได้) — commnet ใน `AiRiskAnalysisCard.vue:6-7` เข้าใจผิดว่า "backend เป็นคนไปดึง fundamentals เอง" ทั้งที่ backend ไม่ได้ดึงอะไรเลย แค่ pass-through
- Output: JSON 4 field, enum ปิดสำหรับ `riskLevel`
- maxOutputTokens: **1200**

---

### 8) Education Quiz — `ai-education.service.ts:20-41` (`generateQuiz`)

**System prompt:**
```
You create finance education quizzes. Return valid JSON only.
```

**User prompt (JSON.stringify):**
```json
{
  "task": "Generate exactly 2 multiple-choice questions",
  "lessonTitle": "<จาก lesson ในระบบ>",
  "lessonDescription": "<จาก lesson ในระบบ>",
  "requiredShape": {
    "questions": [
      {
        "question": "string",
        "options": ["string", "string", "string", "string"],
        "correctAnswer": "integer 0-3",
        "explanation": "string"
      }
    ]
  }
}
```

- Context: เนื้อหาบทเรียนจริงจากระบบ (ไม่ใช่ market data — ไม่จำเป็นสำหรับฟีเจอร์นี้)
- Output: JSON schema ชัดเจนที่สุดในทั้ง 8 จุด (มี validation ฝั่ง backend ตรวจซ้ำครบ: จำนวนคำถาม, จำนวนตัวเลือก, ช่วงคำตอบ)
- ไม่มีคำสั่งภาษาเลย — พึ่งพาว่าโมเดลจะ "ตอบตามภาษาของ lessonTitle/lessonDescription" เอง (ใช้ได้ในทางปฏิบัติเพราะโมเดล modern ทำแบบนี้เป็นปกติ แต่ไม่ใช่การบังคับ)
- maxOutputTokens: **1200**, โมเดล default: gemini → groq → ตัวแรกที่มี (ผู้ใช้เลือกเองไม่ได้เหมือนกับ AI Picks)

---

## Provider layer — ความสม่ำเสมอของค่า default

| Provider | temperature fallback | maxOutputTokens fallback | ใช้ค่ากลางจาก `ai-provider.interface.ts` ไหม |
|---|---|---|---|
| Groq (`groq.provider.ts:47-48`) | `DEFAULT_TEMPERATURE` (0.3) | `DEFAULT_MAX_OUTPUT_TOKENS` (4096) | ใช่ |
| Gemini (`gemini.provider.ts:68-70`) | `DEFAULT_TEMPERATURE` | `DEFAULT_MAX_OUTPUT_TOKENS` | ใช่ (มี `thinkingLevel: 'low'` เสริมเพื่อกัน thinking token แย่ง budget) |
| OpenAI (`openai.provider.ts:64-65`) | `DEFAULT_TEMPERATURE` | `DEFAULT_MAX_OUTPUT_TOKENS` | ใช่ |
| **Anthropic** (`anthropic.provider.ts:36-38`) | **hardcode `0.2`** | **hardcode `1200`** | **ไม่ — ไม่ import ค่ากลางเลย** |

ตอนนี้ไม่ระเบิดเพราะทั้ง 8 จุด (ยกเว้นไม่มี) ส่ง `maxOutputTokens` เองครบทุกครั้ง (800-1800) ซึ่งต่ำกว่า 1200 อยู่แล้วในบางจุด แต่สูงกว่าในบางจุด (1400/1800 > 1200) — **หมายความว่าถ้า Claude ถูกเลือกเป็นโมเดลสำหรับ reviewPortfolio (1400) หรือ growth recommendations (1800) ค่า `maxOutputTokens` จาก caller จะ override 1200 อยู่แล้วก็จริง แต่ตัวเลข hardcode 1200/0.2 ที่ไม่ตรงกับนโยบายกลางยังเป็นหนี้ทางเทคนิคที่ต้องแก้** เผื่อวันที่มี caller ใหม่ไม่ส่งค่ามา (ตอนนั้น Claude จะได้ 1200 ในขณะที่ 3 เจ้าที่เหลือได้ 4096 — ไม่ fair และเสี่ยง parse error สูงกว่าที่ควร)

---

## ขั้นที่ 2 — ปัญหาเรียงตามผลกระทบ

### 🔴 กระทบสูง

**P1. AI Picks ไม่มีข้อมูลจริงประกอบเลยแม้แต่ตัวเดียว** (จุดที่ 6)
ฟีเจอร์นี้คือ "แนะนำหุ้น" ตรงตัว — ความเสี่ยง hallucination และคำแนะนำที่ล้าสมัย/ผิดจริงสูงสุดในระบบ ทั้งที่เป็นฟีเจอร์ที่มีโอกาสถูกผู้ใช้เอาไปตัดสินใจซื้อขายจริงมากที่สุด แก้ prompt อย่างเดียวไม่พอ (บอก "อย่าเดา" ไม่ทำให้ข้อมูลมีจริงขึ้นมา) ต้องแก้ที่ data pipeline ควบคู่ (ดูข้อ 4 ว่า Rem จะเอาข้อมูลจากไหน เพราะ Finnhub ถูกบล็อกที่ระดับ network — ใช้ Yahoo Finance ที่ระบบมีอยู่แล้วแทนได้)

**P2. AI Risk Analysis ตัดสินจาก field ที่เป็น null เสมอ** (จุดที่ 7)
`rules.highBeta/highDebtToEquity/highPe` ใน prompt อ้างเกณฑ์ที่ไม่มีทางถูกเทียบได้จริง เพราะ frontend ไม่เคยส่ง beta/D-E/P-E — โมเดลน่าจะ "เดา" ค่าเหล่านี้จากชื่อหุ้น/sector ในความจำเก่า (อีก hallucination point ที่ซ่อนอยู่) แล้วอ้างว่าประเมินตามกติกาที่ให้ไป ทั้งที่ไม่มีข้อมูลจริงมาเทียบเลย — เป็นบั๊ก data flow ที่ต้องแก้ก่อนจะพูดเรื่อง prompt

**P3. ภาษา output ไม่สม่ำเสมอข้าม 8 จุด**
- จุดที่ 1 (analyzeChart): บังคับ "Reply in Thai" ตายตัวไม่ว่า UI ผู้ใช้ตั้งเป็นภาษาอะไร
- จุดที่ 4/5 (news): ส่ง `language` เป็นข้อมูลแต่ไม่มีคำสั่งให้ตอบภาษานั้นจริงๆ
- จุดที่ 2/3/6/7/8: ไม่พูดถึงภาษาเลย
ผลคือผู้ใช้ที่ตั้งแอปเป็นอังกฤษจะได้ chart insight เป็นไทยเสมอ (จุด 1) แต่ risk analysis/growth picks อาจสลับไปมาระหว่างไทย-อังกฤษตามอารมณ์โมเดล — ประสบการณ์ไม่นิ่ง

**P4. ไม่มีจุดไหนระบุ "กลุ่มเป้าหมาย" หรือขอบเขตคำแนะนำการเงินชัดเจน ยกเว้นจุดเดียว**
มีแค่จุดที่ 3 (Investor review) ที่เขียน "Do not predict prices" ส่วนอีก 7 จุดไม่มี guardrail แบบนี้เลย โดยเฉพาะจุดที่ 6 (AI Picks) ที่เนื้องานคือ "แนะนำหุ้นให้ซื้อ" ตรงๆ แต่ไม่มีประโยคทำนอง "นี่ไม่ใช่คำแนะนำการลงทุน" หรือ "เหมาะกับนักลงทุนรายย่อยไทยที่ยังไม่มีประสบการณ์" ไว้กันเลย — เสี่ยงประเด็นกฎหมาย/ความคาดหวังผิดพลาดของผู้ใช้มากที่สุดในบรรดา 8 จุด

### 🟡 กระทบปานกลาง

**P5. AI Picks ใช้ prompt style ต่างจาก 7 จุดที่เหลือ**
7 จุดส่ง `prompt` เป็น `JSON.stringify({...})` (data-first, โมเดลอ่านง่ายเป็น structured input) ส่วนจุดที่ 6 ใช้ natural-language template string ผสม JSON literal ในก้อนข้อความเดียว — สไตล์ไม่เหมือนกันทำให้พฤติกรรมข้าม 4 provider (groq/gemini/openai/anthropic) ต่างกันได้มากกว่าจุดอื่น เพราะแต่ละเจ้า parse free-text instruction ปนโครงสร้างได้ไม่เท่ากัน

**P6. News enrichment ไม่บอก enum ที่ยอมรับได้ใน prompt**
system prompt บอกแค่ *ชื่อ field* (`aiTrend`, `importance`, `sentiment`) ไม่บอกว่าต้องเป็นค่าไหนได้บ้าง (`UP|DOWN|SIDEWAY`, `HIGH|MEDIUM|LOW`, `BULLISH|BEARISH|NEUTRAL`) ทั้งที่ backend มี validation รออยู่แล้ว (`normalizeNewsResult`) — ถ้าโมเดลตอบนอกชุดนี้ backend เงียบๆ fallback ไปค่า default โดยผู้ใช้ไม่รู้ตัว เสียโอกาสได้คำตอบที่ถูกต้องเพราะ prompt ไม่ได้บอกขอบเขตให้ชัดตั้งแต่แรก

**P7. maxOutputTokens ต่อจุดอาจตึงเกินไปสำหรับโมเดล verbose**
`analyzeChart` (800), `enrichNews` (1000), `risk`/`quiz` (1200) ค่อนข้างน้อยเมื่อโมเดลที่ผู้ใช้เลือกได้เป็น GPT-4o/Claude ที่มักตอบยาวกว่า groq/gemini — ยิ่งมี array of string หลายชุด (`strengths`, `weaknesses`, `keyRiskFactors` ฯลฯ) ยิ่งเสี่ยงชนเพดานแล้วโดน `AiResponseParseError` (ระบบ retry ข้าม provider ได้ก็จริง แต่กับ `executeAiRequest` ที่ผู้ใช้เลือกโมเดลเอง **ไม่มี fallback ข้าม provider** — พังแล้วจบเลย เสียเครดิตไปฟรีๆ ด้วย เพราะ pricing คิดจาก token ที่ใช้จริงก่อนจะรู้ว่า parse ไม่ผ่าน)

**P8. Anthropic provider ไม่ผูกกับค่า default กลาง** (รายละเอียดในตารางด้านบน)

### 🟢 กระทบต่ำ (แต่ควรรู้ไว้)

**P9. ไม่มีจุดไหนใส่ตัวอย่าง output (few-shot) เลยแม้แต่จุดเดียว** — ทุกจุดพึ่ง `requiredShape`/schema อธิบายด้วยคำเท่านั้น ปกติโมเดลรุ่นใหม่ (ที่ใช้ในระบบนี้ทั้งหมด) ทำตาม schema-only ได้ดีอยู่แล้วสำหรับ JSON ธรรมดา แต่จุดที่ schema ซับซ้อน/ซ้อนกัน (growth recommendations ที่มี `reasoning` เป็น object ซ้อน) อาจได้ประโยชน์จากตัวอย่าง 1 ชุด

**P10. `data`/`extraContext` ใน `analyzeChart` ไม่บังคับรูปร่าง** (DTO รับ `unknown`) — ยืดหยุ่นเกินไปจนโมเดลอาจได้ payload ที่หน้าตาไม่เหมือนกันทุกครั้งตาม `chartType` โดยไม่มีคำอธิบายว่าแต่ละ `chartType` หมายถึงอะไร

---

## ขั้นที่ 3 — Prompt เวอร์ชันเสนอใหม่ (ก่อน/หลัง)

หลักที่ใช้ทุกจุด: (1) เปิดด้วย role + กลุ่มเป้าหมายเฉพาะ ("นักลงทุนรายย่อยไทย") (2) แยก instruction/schema ออกจากข้อมูลจริงให้ชัด (3) บังคับภาษา output ด้วยตัวแปรเดียวกันทุกจุด (4) ใส่ guardrail "ห้ามฟันธงซื้อ/ขาย, ใช้เฉพาะตัวเลขที่ให้มา, บอกความไม่มั่นใจถ้าข้อมูลไม่พอ" เป็นบรรทัดมาตรฐานซ้ำทุกจุด (5) enum ที่ยอมรับได้ต้องอยู่ใน prompt ไม่ใช่แค่ใน validation code

### 1) Chart Insight

**ก่อน:**
```
System: You are a professional financial analytics coach. Reply in Thai as valid JSON only: {"insight":"concise actionable analysis grounded only in supplied data"}.
User: {"portfolioType":...,"chartType":...,"data":...,"extraContext":{}}
```

**หลัง (เสนอ):**
```
System:
You are a financial analytics coach for Thai retail investors using a personal trading/investing journal app.
Audience: individual, non-professional investors. Never phrase output as investment advice ("buy", "sell", "you should"); frame findings as observations about the user's own recorded data only.
Output language: {{outputLanguage}} — always match this exactly, regardless of the data's language.
Rules:
- Use only the numbers present in the supplied data. Never invent, estimate, or round figures that are not given.
- If the data is insufficient to draw a conclusion, say so explicitly instead of guessing.
Return valid JSON only, matching exactly: {"insight": string}
The insight must be 2-4 sentences, concrete, and reference at least one specific number from the supplied data.

User: {"portfolioType":..., "chartType":..., "data":..., "extraContext":{}}
```
เหตุผล: `{{outputLanguage}}` มาจากค่าที่ frontend รู้อยู่แล้ว (`languageStore.isThai`) ส่งต่อเป็น field ใน request แทนการ hardcode "Thai" ในโค้ด — แก้ P3 ตรงจุด, เพิ่ม guardrail กันฟันธงซื้อขาย (P4), บังคับอ้างตัวเลขจริงกันหลอน

### 2/3) Portfolio Review (Trader/Investor)

**ก่อน (Investor):**
```
System: You are a professional portfolio advisor. Do not predict prices. Return valid JSON only.
```

**หลัง (เสนอ, ใช้โครงเดียวกันทั้ง Trader/Investor เปลี่ยนแค่ persona/schema):**
```
System:
You are a portfolio review assistant for Thai retail investors. You are not a licensed financial advisor and must not give direct buy/sell instructions or predict future prices/returns — only assess what already happened and what is currently observable in the supplied data.
Output language: {{outputLanguage}}.
Base every claim strictly on the "holdings"/"trades" and "analytics" fields provided — do not use outside knowledge about these symbols (e.g. do not assume a company's current news, price target, or fundamentals beyond what's in the data).
Return valid JSON only, matching exactly this shape: {{requiredShape}}
```
เหตุผล: ย้าย "Do not predict prices" (เดิมมีแค่จุดเดียว) ให้เป็น guardrail มาตรฐานทั้งคู่ (P4), เพิ่ม "ห้ามใช้ความรู้นอกเหนือข้อมูลที่ให้" กันโมเดลผสมความจำเก่าเรื่องหุ้นตัวนั้นเข้ากับข้อมูลจริงของผู้ใช้ (เสี่ยง hallucination แบบผสมข้อมูลจริง+เดา ซึ่งอันตรายกว่าเดาล้วนๆ เพราะดูน่าเชื่อถือกว่า)

### 4/5) News Enrichment (system + user-triggered)

**ก่อน:**
```
System: You are a financial news analyst. Return valid JSON only with aiSummary, aiTrend, aiImpactProbability, stockImpactAnalysis, sector, importance, sentiment and aiTranslatedSummary.
```

**หลัง (เสนอ):**
```
System:
You are a financial news analyst summarizing news for Thai retail investors.
Base your analysis strictly on the headline/summary/content provided — do not use outside knowledge about the company beyond this article.
Write aiSummary and stockImpactAnalysis in the language given by "language" ("th" or "en") — this is a hard requirement, not a suggestion.
aiTranslatedSummary must always be in Thai, regardless of "language" (used as a Thai fallback when the article itself is in English).
Return valid JSON only, matching exactly:
{
  "aiSummary": string,
  "aiTrend": "UP" | "DOWN" | "SIDEWAY",
  "aiImpactProbability": number (0-100),
  "stockImpactAnalysis": string,
  "sector": string,
  "importance": "HIGH" | "MEDIUM" | "LOW",
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "aiTranslatedSummary": string
}
If uncertain about impact, prefer a value near 50 and say so in stockImpactAnalysis rather than guessing confidently.
```
เหตุผล: ใส่ enum จริงเข้า prompt (แก้ P6), บังคับทิศทางภาษาให้ชัดทั้งสองฟิลด์ที่เกี่ยวกับภาษาแทนการฝากไว้กับ field ข้อมูล (แก้ P3+ความกำกวมของ `aiTranslatedSummary`), เพิ่มคำแนะนำเรื่องความไม่มั่นใจแทนการฟันธง `aiImpactProbability` มั่วๆ

### 6) AI Picks — จุดที่ต้องแก้แรงที่สุด

**ก่อน:** (ตามขั้นที่ 1 ข้อ 6 — ไม่มีข้อมูลจริงเลย)

**หลัง (เสนอ — แต่ **ใช้ไม่ได้จริงจนกว่าจะมี data pipeline ป้อนราคา/fundamentals จริงเข้ามาก่อน** ดูข้อ 4):**
```
System:
You are a quantitative growth-stock screener for Thai retail investors. You must only reason about the specific candidate stocks provided in "candidates" — do not suggest any symbol that is not in that list.
This is educational screening output, not investment advice. Never use words like "buy", "recommend buying", or promise returns.
Output language: {{outputLanguage}}.
Return valid JSON only, matching exactly:
[{
  "symbol": string,               // must be one of candidates[].symbol
  "name": string,
  "sector": string,
  "asOf": string,                 // echo candidates[].asOf for this symbol, unchanged
  "reasoning": {
    "growth": string,             // must cite a specific number from candidates[].metrics
    "profit": string,
    "customerBase": string,
    "liquidity": string
  },
  "aiSummary": string
}]

User:
{
  "task": "Rank and explain the 4-5 strongest growth candidates from the list below, based only on the metrics given.",
  "candidates": [
    { "symbol": "...", "name": "...", "sector": "...", "asOf": "2026-08-27",
      "metrics": { "revenueGrowthYoY": 0.32, "netMargin": 0.18, "peRatio": 41.2, "currentPrice": 123.4, "volume30d": ... } },
    ...
  ]
}
```
เหตุผล: เปลี่ยนงานจาก "จำหุ้นเก่งๆ มาแนะนำ" (ต้องพึ่งความจำเก่าล้วนๆ) เป็น "จัดอันดับ/อธิบายจากรายชื่อผู้สมัครที่ระบบคัดมาแล้วพร้อมตัวเลขจริง" (screening ไม่ใช่ generation) — แก้ hallucination ที่ต้นตอ ไม่ใช่แค่บอกให้ระวัง `candidates` ควรมาจาก Yahoo Finance ที่ระบบมีอยู่แล้ว (เช่นคัดจาก `stocks.service.ts` listing ที่มีอยู่ ไม่ต้องพึ่ง Finnhub ที่ถูกบล็อก) — **นี่คืองาน implementation เพิ่ม ไม่ใช่แค่แก้ข้อความ prompt** ต้อง Rem อนุมัติ scope ก่อน

### 7) AI Risk Analysis

**ก่อน:** (ตามขั้นที่ 1 ข้อ 7 — rules อ้าง field ที่เป็น null เสมอ)

**หลัง (เสนอ, สมมติว่า beta/D-E/P-E ถูกป้อนจริงแล้วหลังแก้บั๊ก data flow — ดูข้อ 4):**
```
System:
You are a portfolio risk analyst for Thai retail investors. Use only the numeric rules and holdings data provided — do not infer a stock's beta, debt-to-equity, or P/E from your own knowledge if the field is null; instead exclude that stock from the relevant rule and note the gap in analysisSummary.
Output language: {{outputLanguage}}.
Return valid JSON only, matching exactly: {{requiredShape}}

User:
{
  "task": "Assess portfolio risk using only the rules and holdings below",
  "rules": { "highBeta": ">1.2", "highDebtToEquity": ">1.0", "highPe": ">30", "concentration": "single holding weight > 25%" },
  "holdings": [...]   // เหมือนเดิม แต่รับประกันว่า beta/debtToEquity/peRatio มีค่าจริงแล้ว
}
```
เหตุผล: เพิ่มประโยคชัดเจนห้ามเดาค่า fundamentals ที่เป็น null (กันหลอนกรณีข้อมูลยังไม่ครบระหว่างที่ค่อยๆ เติม data pipeline), ปรับ `concentration` ให้เป็นตัวเลขจริง (`>25%`) แทนคำกว้างๆ "large portfolio weights" ที่โมเดลต้องตีความเอง

### 8) Education Quiz

**ก่อน:** (ตามขั้นที่ 1 ข้อ 8 — ดีอยู่แล้วเมื่อเทียบกับจุดอื่น)

**หลัง (เสนอ, ปรับเล็กน้อย):**
```
System:
You create finance education quizzes for Thai retail investors learning to invest.
Output language: {{outputLanguage}} (match the language of lessonTitle/lessonDescription unless outputLanguage says otherwise).
Return valid JSON only, matching exactly: {{requiredShape}}
Each question must test understanding of a concept in lessonDescription — do not introduce facts, numbers, or terminology not present in lessonTitle/lessonDescription.
```
เหตุผล: จุดนี้ปัญหาน้อยที่สุด แค่เพิ่ม "ห้ามใส่ความรู้นอกบทเรียน" กันโมเดลยัด fact ทางการเงินทั่วไปที่อาจไม่ตรงบริบทบทเรียน + บังคับภาษาให้สอดคล้องกับนโยบายกลาง

---

## ขั้นที่ 4 — สิ่งที่ต้องให้ Rem ตัดสินใจก่อนแก้จริง

1. **"AI Insights"/"AI Radar" ที่ไม่ใช่ LLM จริง (ขั้นที่ 0)** — จะคงป้ายว่า "AI" ต่อไปทั้งที่เป็นคณิตศาสตร์ล้วนๆ, เปลี่ยนคำที่ใช้ในหน้าเว็บ (เช่น "Momentum Radar" แทน "AI Radar"), หรืออยากให้เพิ่ม LLM เข้าไปจริงในสองจุดนี้ (งาน scope ใหม่)?
2. **AI Picks (P1)** — เห็นด้วยไหมที่จะเปลี่ยนจาก "ให้โมเดลนึกหุ้นเอง" เป็น "ให้ระบบคัด candidate list จาก Yahoo Finance ก่อน แล้วให้โมเดลจัดอันดับ/อธิบาย"? ถ้าเห็นด้วย ต้องตกลงต่อว่าจะคัด candidate จากไหน (ใช้ listing table ที่มีอยู่, จำกัดเฉพาะตลาดไหน, กี่ตัว) — เป็นงาน implementation เพิ่ม ไม่ใช่แค่แก้ prompt
3. **AI Risk Analysis (P2)** — ต้องแก้ frontend ให้ส่ง beta/debtToEquity/peRatio จริง (ดึงจากไหน — ระบบมี fundamentals อยู่แล้วในหน้า StockAnalysisPage ใช้ endpoint เดิมได้ไหม) มิฉะนั้น prompt เวอร์ชันใหม่ในข้อ 3.7 ก็แค่ทำให้โมเดล "ยอมรับว่าไม่มีข้อมูล" แทนที่จะเดา — ดีขึ้นแต่ยังไม่ใช่ fix ที่สมบูรณ์
4. **นโยบายภาษา output (P3)** — เห็นด้วยไหมที่จะให้ทุก endpoint AI รับ `outputLanguage` เป็น parameter เดียวกัน (มาจาก `languageStore` ฝั่ง frontend) แทนที่จะบังคับ/ปล่อยเดาแบบตอนนี้? กระทบ DTO ทุกตัวที่ยังไม่มี field นี้ (analyzeChart, reviewPortfolio, risk-analysis, growth, quiz)
5. **Guardrail "ไม่ใช่คำแนะนำการลงทุน" (P4)** — อยากให้ข้อความนี้ปรากฏใน prompt เท่านั้น (ควบคุมพฤติกรรมโมเดล) หรืออยากให้ปรากฏเป็น disclaimer UI ที่หน้าเว็บด้วย (กันด้านกฎหมาย/ผู้ใช้เข้าใจผิดในระดับ product ไม่ใช่แค่ prompt)? ถ้าใช่ ต้องกำหนด tone ที่ต้องการ (เข้มงวดแบบ "ห้ามพูดคำว่าซื้อ/ขายเด็ดขาด" หรือแค่ "เตือนแบบอ่อนๆ พอ")
6. **maxOutputTokens ต่อจุด (P7)** — จะขยับเพดานของจุดที่ตึง (analyzeChart 800, news 1000, risk/quiz 1200) ขึ้นแค่ไหน หรือใช้อีกทางคือสั่งในprompt ให้แต่ละ string field สั้นลง (เช่น "ไม่เกิน 40 คำต่อ field") แทนการเพิ่ม token budget? สองทางนี้กระทบต้นทุนเครดิตต่างกัน (เพดานสูงขึ้น = โมเดลมีที่ตอบยาวขึ้น = ต้นทุนเฉลี่ยสูงขึ้นแม้จะไม่ชนเพดานทุกครั้ง)
7. **Anthropic provider ไม่ผูก default กลาง (P8)** — นี่เป็น bug เชิงเทคนิคล้วนๆ (ไม่ใช่การตัดสินใจเชิงผลิตภัณฑ์) เสนอแก้ให้ import `DEFAULT_TEMPERATURE`/`DEFAULT_MAX_OUTPUT_TOKENS` เหมือน 3 provider ที่เหลือ — ขอ sign-off แค่ "ทำได้เลยไหม" เพราะไม่กระทบพฤติกรรมปัจจุบัน (ทุก caller ส่งค่าเองอยู่แล้ว) มีแต่ได้ (กันปัญหาในอนาคต)

รอ Rem ตอบข้อ 1-6 (เป็นการตัดสินใจเชิงผลิตภัณฑ์/scope) ก่อนจะเริ่มแก้ไฟล์ AI จริง ส่วนข้อ 7 เป็น pure bugfix แก้ได้ทันทีถ้า Rem โอเค

---

## สิ่งที่ทำไปแล้วจริง (ปิดงาน 7 เฟส — 2026-08-28)

ส่วนนี้บันทึก **สิ่งที่โค้ดเป็นอยู่จริงหลังแก้** ไม่ใช่แผน — หลายจุดต่างจากที่เสนอไว้ข้างบน
เพราะพอลงมือแล้วพบว่าของจริงไม่เป็นอย่างที่คิด จุดที่ต่างเขียนกำกับไว้ทุกจุด

| ข้อ | เรื่อง | commit |
|---|---|---|
| 1 | Anthropic provider ผูกค่า default กลาง (P8) | `c3c30aa` |
| 2 | เลิกเรียกฟีเจอร์ที่ไม่ใช่ LLM ว่า "AI" | `7c05ad5` + `5c39d8e` |
| 3 | `outputLanguage` ทุก endpoint (P3) | `24daaa9` |
| 4 | Guardrail คำแนะนำลงทุน + disclaimer บน UI (P4) | `2119e75` |
| 5 | ต่อ P/E + beta จริงเข้า Risk Analysis (P2) | `77bb3d1` |
| 6 | AI Picks ใช้ candidate list จริง (P1 + P5) | `67e61ab` + `ce3b70e` |
| 7 | เพดาน token + บรรทัดคุมความยาว (P7) | `07d66e8` |

คำถามในหัวข้อ "ขั้นที่ 4" ถูกตอบครบทั้ง 7 ข้อระหว่างทาง (ข้อ 1 = เปลี่ยนคำ, ข้อ 2 = ทำ candidate list, ข้อ 3 = ส่งเฉพาะ P/E+beta ก่อน, ข้อ 4 = ใช่, ข้อ 5 = ทั้ง prompt และ UI, ข้อ 6 = ทำทั้งสองทางคู่กัน, ข้อ 7 = ทำได้เลย)

### 1) Anthropic provider — `c3c30aa`

`anthropic.provider.ts` เลิก hardcode `1200`/`0.2` เปลี่ยนไปใช้ `DEFAULT_MAX_OUTPUT_TOKENS`/`DEFAULT_TEMPERATURE` เหมือนอีก 3 provider

**เจอเพิ่มระหว่างแก้ (ไม่ได้อยู่ในรายงาน)**: provider นี้ไม่ได้ตั้ง `AI_REQUEST_TIMEOUT_MS` ตอนสร้าง client ด้วย — SDK ของ Anthropic ตั้ง timeout เริ่มต้นไว้ที่ **10 นาที** ขณะที่อีก 3 เจ้าใช้ 30 วินาที คำขอที่ค้างจึงค้างยาวกว่าที่อื่น 20 เท่า ใส่ให้ครบไปพร้อมกัน

### 2) เลิกเรียกสิ่งที่ไม่ใช่ LLM ว่า "AI" — `7c05ad5`, `5c39d8e`

- `WatchlistPage.vue` — "AI Radar" → **"Momentum Radar"** (คำนวณจาก % การเปลี่ยนแปลงราคาย้อนหลังล้วน ๆ ดู `stocks.service.ts` `buildRadarEntry`)
- `StockAnalysisPage.vue` — เส้นแนวรับ/แนวต้านที่เดิมติดป้าย AI → **"Range S1/S2/R1/R2"** (min/max ของกรอบราคา 20/90 วัน + RSI แบบ Wilder) พร้อมคอมเมนต์อธิบายที่มาไว้ในโค้ด
- `AssetExplorerPage.vue` (ฝั่ง Trader) — เป็นส่วนขยายที่ Rem อนุมัติทีหลัง จึงแยกเป็น `5c39d8e` ไม่ปนกับก้อนแรก

### 3) `outputLanguage` — `24daaa9`

เพิ่ม `ai-prompt.shared.ts` เป็นที่รวมชิ้นส่วน prompt: `resolveOutputLanguage()` (`:25`) + `outputLanguageRule()` (`:40`) ทุก endpoint รับ `outputLanguage` แล้ว (`growth` รับทาง query string เพราะเป็น GET ไม่มี body)

**กับดักที่เจอ**: `AnalyzeChartDto` ถูกประกาศไว้ **สองที่** — `ai.types.ts` (ตัวที่ `ai.service.ts` import) กับ `dto/ai.dto.ts` (ตัวที่ `ValidationPipe` ใช้จริง) เติมแค่ที่เดียวจะ typecheck ไม่ผ่านหรือโดน `forbidNonWhitelisted` ตีกลับ 400 แล้วแต่ว่าลืมที่ไหน

ฝั่งหน้าบ้าน `AiStore.outputLanguage()` **อ่าน `languageStore` ตอนเรียกทุกครั้ง ไม่ cache** — ผู้ใช้สลับภาษากลางคันแล้วกดใหม่ต้องได้ภาษาใหม่ทันที

### 4) Guardrail + disclaimer — `2119e75`

- `investmentGuardrail()` (`ai-prompt.shared.ts:59`) ใส่ครบทุกจุด **ยกเว้น quiz** (เป็นเนื้อหาบทเรียน ไม่ใช่คำแนะนำลงทุน) — มีเทสล็อกข้อยกเว้นนี้ไว้ที่ `ai-education.service.spec.ts` ไม่ให้ใครเผลอเติมทีหลัง
- `screeningOnlyGuardrail()` (`:89`) เป็นชั้นที่สองเฉพาะ AI Picks
- `WsAiDisclaimer.vue` — คำเตือนอยู่ที่เดียวแล้วให้ 4 หน้าเรียกใช้ วางไว้ **เหนือ** ผลวิเคราะห์ ไม่ใช่ตัวเล็ก ๆ ท้ายการ์ด
- ไม่ได้ทำเป็น i18n key เพราะโปรเจกต์นี้ไม่ได้ใช้ vue-i18n จริง (`src/i18n/` เป็น scaffold ที่ไม่มีใครเรียก — `useI18n`/`$t(` = 0 ที่ใช้) ของจริงคือ `LanguageStore` component นี้จึงเดินตามนั้นเหมือนทั้งโปรเจกต์

### 5) P/E + beta เข้า Risk Analysis — `77bb3d1`

scope ถูกลดเหลือ `peRatio` + `beta` (Rem เลือกทางเลือก C) — `debtToEquity` ยกไปเป็น backlog ท้ายไฟล์นี้

- `GET /stocks/fundamentals?symbols=A,B,C` → `market-data.service.ts` `getRiskFundamentals()` (`:414`) ยิง Yahoo **ครั้งเดียวต่อ 40 symbol** แคช 5 นาที
- `AnalyticsPage.vue` `riskHoldings` แนบค่าจริงแล้ว, `debtToEquity: null` เป็นของที่ตั้งใจ
- watcher เฝ้า **"รายชื่อ symbol ที่เรียงแล้ว"** ไม่ใช่ `holdings` ทั้งก้อน — ราคาขยับทุกรอบ poll แต่ P/E กับ beta ไม่ได้เปลี่ยนตาม
- prompt เพิ่มกฎ null (`ai-risk.service.ts`) และเปลี่ยน `concentration` จาก "large portfolio weights" เป็น `single holding weight >25%`

**สองเรื่องที่ค้นพบระหว่างทางและมีผลต่อการออกแบบ**:
1. `quote()` แบบไม่ระบุ `fields` **ไม่คืน `beta`** มาให้เลย (ทดสอบแล้วทั้งฝั่ง US และ `.BK`) ต้องระบุชื่อ field ตรง ๆ
2. แต่การระบุ `fields` ทำให้ Yahoo คืน **เฉพาะ** ที่ขอ — `marketCap` หายไปทันที จึง **ห้าม** ไปเติม `fields` ใน `getListingMetrics()` ที่มีอยู่ (ตาราง listing จะพังทั้ง marketCap/dividendYield/volume) เป็นเหตุผลที่ `getRiskFundamentals()` เป็นฟังก์ชัน+cache แยกต่างหาก ไม่ใช่การขยายของเดิม

### 6) AI Picks — `67e61ab`, `ce3b70e`

**จุดที่แผนข้างบน (ข้อ 3.6) ใช้จริงไม่ได้**: แผนสมมติว่า candidate metrics ดึงจาก listing ที่มีอยู่ได้ทั้งชุด — ทดสอบแล้วไม่จริง

| metric | ดึงยังไงได้จริง |
|---|---|
| `peRatio`, `currentPrice`, `marketCap`, `avgDailyVolume3M` | `quote()` batch ได้ |
| `revenueGrowthYoY`, `netMargin` | **`quoteSummary()` ทีละ symbol เท่านั้น** — ส่ง array เข้าไปมันโยน error ตรง ๆ |
| `volume30d` | **ไม่มีอยู่จริงใน Yahoo** ของที่มีคือ `averageDailyVolume10Day` / `averageDailyVolume3Month` |

ชนกำแพงเดียวกับ `debtToEquity` แต่ตัดสินใจต่างกัน เพราะ **เจ้าของรายชื่อต่างกัน**: holdings ของการ์ดความเสี่ยงเป็นพอร์ตส่วนตัว จำนวนคุมไม่ได้ แคชร่วมกันไม่ได้ ส่วน candidate ของ AI Picks เป็นชอร์ตลิสต์ ~12 ตัวที่เซิร์ฟเวอร์คัดเอง ทุกคนใช้ร่วมกัน และงบเปลี่ยนไตรมาสละครั้ง → แคช 12 ชม. + concurrency 5 = **~12 request ต่อ 12 ชม. ทั้งระบบ** (วัดจริง: 15 symbol ที่ concurrency 5 = 867ms, ล้มเหลว 0, หุ้นไทยมีข้อมูลครบ 6/6)

โครงที่ได้ (Rem อนุมัติ):
- `stocks.service.ts` `getGrowthCandidates()` (`:403`) — ขั้น 1 `getListingMetrics()` batch ทั้ง universe คัดเหลือ `GROWTH_CANDIDATE_LIMIT = 12` (`:129`) ขั้น 2 `market-data.service.ts` `getGrowthFundamentals()` (`:479`) เฉพาะ 12 ตัวนั้น
- ขั้น 1 คัดด้วย **สภาพคล่อง ไม่ใช่การเติบโต** โดยตั้งใจ — ตอนนั้นยังไม่มีตัวเลขการเติบโตในมือ
- โควตาไทย/global แบ่งครึ่ง และให้ฝั่งที่เหลือเติมโควตาที่อีกฝั่งใช้ไม่หมด (ต่างจาก `pickEvenly` ของ radar ที่ไม่เติมกลับ)
- `ai-recommendation.service.ts` `reconcile()` (`:190`) — **ตัดหุ้นที่ไม่ได้อยู่ใน candidate list ทิ้ง** และเขียนทับ `symbol/name/sector/asOf/metrics` ด้วยของฝั่งเซิร์ฟเวอร์เสมอ โมเดลมีสิทธิ์แต่งแค่ `reasoning` กับ `aiSummary`
- candidate < `MIN_GROWTH_CANDIDATES = 5` (`:43`) → โยน `GROWTH_CANDIDATES_UNAVAILABLE` **โดยไม่เรียก LLM** ห้ามถอยกลับไปให้โมเดลนึกหุ้นเอง
- user prompt เปลี่ยนเป็น `JSON.stringify` เหมือนอีก 7 จุด — **ปิด P5 ไปในตัว**

**ดีกว่าที่แผนเสนอ**: แผนให้โมเดล echo `asOf` กลับมา ของจริงดึง `defaultKeyStatistics.mostRecentQuarter` มาเองในคำขอเดียวกับ `financialData` (ไม่เพิ่ม request เลย) ได้วันปิดไตรมาสจริง เช่น PTT `2026-06-30`, AAPL `2026-06-27` แล้วเซิร์ฟเวอร์เป็นคนกรอก โมเดลแตะไม่ได้

`ce3b70e` เอาวันที่นั้นขึ้นหน้าจอ — ต่อท้าย `WsAiDisclaimer` ในกล่องเดิม (prop `note`) ไม่ใช่แถบที่สอง แต่ละหุ้นปิดไตรมาสคนละวัน จึงยึด **วันเก่าสุด** แล้วต่อท้ายว่า "หรือใหม่กว่า" ซึ่งเป็นคำพูดที่จริงกับทุกใบ

### 7) เพดาน token + ความยาว — `07d66e8`

| จุด | เดิม | ใหม่ |
|---|---|---|
| `analyzeChart` | 800 | 1200 |
| news enrichment (ทั้งอัตโนมัติและกดเอง) | 1000 | 1400 |
| risk / quiz | 1200 | 1600 |
| portfolio review (trader + investor) | 1400 | 1800 |
| AI Picks | 1800 | 2400 |

สองแถวล่างไม่ได้อยู่ในแผน เพิ่มเพราะ: review มี string array 4 ชุด + summary, ส่วน AI Picks output ก้อนใหญ่สุดในระบบ (5 หุ้น × (4 เหตุผล + สรุป) = 25 ฟิลด์ข้อความ) แถมโมเดลตัวแรกคือ **gemini ที่หัก thinking token จากเพดานเดียวกันนี้** (ดูคอมเมนต์ใน `gemini.provider.ts`)

**ข้อกังวลเรื่องต้นทุนในรายงานเดิม (ขั้นที่ 4 ข้อ 6) ไม่เป็นจริง**: ตรวจ `ai-manager.service.ts` แล้วพบว่าเครดิตคิดจาก `result.usage` คือ token ที่ใช้จริง ไม่ใช่จากเพดาน เพดานที่เหลือไม่ได้ใช้จึงไม่มีต้นทุน — ความเสี่ยงเป็นข้างเดียว (คำตอบโดนตัด = parse ไม่ผ่าน = เสียเครดิตฟรีโดยไม่มี fallback ข้าม provider)

แต่เพดานที่สูงขึ้นแปลว่าโมเดล verbose จะเขียนยาวขึ้นจริง จึงมาคู่กับ `concisenessRule()` (`ai-prompt.shared.ts:81`) — ~40 คำต่อฟิลด์, array นับเป็นรายไอเทม, และย้ำว่า **นับแยกรายฟิลด์ ไม่ใช่โควตารวมของทั้ง object** เพราะ schema ซ้อนอย่าง `reasoning` ของ AI Picks ถ้าโมเดลตีความเป็นโควตารวมมันจะเททั้งหมดลง `growth` แล้วอีกสามช่องเหลือห้วน ๆ (จุดนั้นมีบรรทัดระบุชื่อ 4 sub-field เพิ่มอีกชั้น)

ใส่ครบทุกจุดรวม quiz — ข้อยกเว้น "จุดที่เป็นตัวเลข/enum ล้วน" ที่เผื่อไว้ไม่มีอยู่จริงสักจุด (quiz มี `explanation` เป็นฟรีเท็กซ์)

### สถานะเทสตอนปิดงาน

backend jest **283 ผ่าน** · frontend vitest **413 ผ่าน** · `tsc`/`vue-tsc`/`eslint`/`quasar build` ผ่านหมด
(`test/app.e2e-spec.ts` ยังมี error `supertest` 2 บรรทัดที่ค้างมาก่อนหน้างานนี้ ไม่ได้แตะ)

---

## รอดำเนินการ — debtToEquity

**สถานะ**: ยกออกจากเฟส 5 โดยตั้งใจ (Rem อนุมัติทางเลือก C — ส่ง `peRatio` + `beta` ก่อน)
ตอนนี้ `AnalyticsPage.vue` ส่ง `debtToEquity: null` เข้า `/ai/portfolio/risk-analysis` เสมอ
คอลัมน์ D/E ในตารางของ `AiRiskAnalysisCard.vue` จึงยังขึ้น "—" ทุกแถว — **เป็นของที่ค้างไว้ ไม่ใช่บั๊ก**

บันทึกไว้ให้คนที่มาทำต่อไม่ต้องขุดใหม่ (สำรวจเมื่อ 2026-08-27):

### ทำไมถึงยกไป

`peRatio` กับ `beta` ดึงรวมทีเดียวได้จาก `yahooFinance.quote(symbols, { fields })` — request เดียวจบไม่ว่าพอร์ตจะกี่ตัว
แต่ `debtToEquity` มีเฉพาะใน `quoteSummary()` → `financialData.debtToEquity` ซึ่ง **Yahoo ไม่มีรูปแบบ batch ให้เลย ยิงได้ทีละ symbol เท่านั้น**

ทางเดิมที่มีอยู่ (`GET /assets/valuation/:symbol` → `assets.service.ts` `getSymbolValuation`) ยิง `quoteSummary` + `quote` = 2 request ต่อหุ้น และ **ไม่มี cache สักชั้น** → พอร์ต 20 ตัว = 40 request ทุกครั้งที่กดวิเคราะห์ ความเสี่ยงคือโดนบล็อกซ้ำรอย finnhub.io ที่ตอนนี้ยิงไม่ออกแล้ว

### ⚠️ บั๊กหน่วยที่ต้องแก้ตอนทำจริง (ห้ามลืม)

Yahoo คืน `debtToEquity` มาเป็น **เปอร์เซ็นต์ ไม่ใช่ ratio ดิบ** — ยิงจริงแล้วได้:

| symbol | `financialData.debtToEquity` | D/E จริง |
|---|---|---|
| AAPL | `78.445` | 0.78 |
| PTT.BK | `58.869` | 0.59 |

กติกาใน prompt (`ai-risk.service.ts`) เขียนว่า `highDebtToEquity: '>1.0'`
**ถ้าเอาค่าดิบจาก Yahoo ยัดเข้าไปตรง ๆ หุ้นเกือบทุกตัวจะเข้าเกณฑ์ "หนี้สูง" ทันที** ต้องหารด้วย 100 ก่อนส่ง หรือเปลี่ยนเกณฑ์เป็น `>100` (แนะนำให้หารก่อนส่ง เพื่อให้ตัวเลขที่โชว์ในตารางของการ์ดเป็น D/E ที่คนอ่านงบคุ้นเคย)

### แนวทางที่แนะนำตอน implement

- **จำกัด concurrency ~5 พร้อมกัน** ไม่ใช่ปล่อย `Promise.all` ทั้งพอร์ตทีเดียว
- **cache TTL ยาว ≥12 ชม.** — D/E เปลี่ยนตามงบรายไตรมาส ไม่ใช่รายนาที ต่างจาก `RISK_FUNDAMENTAL_TTL_MS` (5 นาที) ที่ตั้งไว้สำหรับราคา/P-E ควรแยก cache กันคนละตัว
- **ทดสอบ rate limit ของ `quoteSummary` แยกก่อนต่อเข้าโปรดักชัน** — ยังไม่เคยวัดว่ายิงถี่แค่ไหนถึงโดนตัด
- prompt รองรับอยู่แล้ว: มีบรรทัดสั่งว่าฟิลด์ที่เป็น `null` ให้ตัดหุ้นตัวนั้นออกจากกติกาข้อนั้นแล้วบอกช่องว่างใน `analysisSummary` แทนการเดา — ต่อ D/E เข้ามาแล้วไม่ต้องแก้ prompt ส่วนนี้

### จุดที่ต้องแตะตอนทำจริง

- `market-data.service.ts` — เพิ่มฟังก์ชันคู่กับ `getRiskFundamentals()` (แยก cache/TTL)
- `stocks.controller.ts` — `GET /stocks/fundamentals` ต่อ field เพิ่ม
- `stocks.service.ts` (frontend) + `RiskFundamental` — เพิ่ม field
- `AnalyticsPage.vue` `riskHoldings` — เลิกส่ง `null` ตายตัว
- `AiRiskAnalysisCard.vue` — ลบหมายเหตุที่บอกว่าคอลัมน์ D/E ยังว่างโดยตั้งใจ
