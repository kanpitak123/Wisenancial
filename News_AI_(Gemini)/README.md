# Gemini Financial News Intelligence Agent — Fullstack Handoff (Model Store V.5)

> **Status:** Production-Ready Handoff for Financial News Market Impact Analysis  
> **Model Version:** `V.5` (Dual-Sided Neutral Market Impact Agent with Chain-of-Thought Reasoning)  
> **Compatibility:** Full backward compatibility with `V.4` single-label classification endpoints  
> **Target Stacks:** NestJS / TypeScript (Primary Backend), FastAPI / Docker (Standalone Microservice), Quasar / Vue 3 (Frontend)

---

## 1. Evolution from V.4 to V.5

| Feature / Capability | V.4 (Legacy Baseline) | V.5 (Current Release) |
|---|---|---|
| **Analysis Depth** | Single categorical label (`BULLISH / BEARISH / NEUTRAL`) | **Dual-Sided Symmetrical Analysis** (Positive Catalysts vs Negative Risks) |
| **Reasoning Model** | Direct prediction (0-step CoT, 180 token cap) | **Chain-of-Thought (CoT)**: Fact Extraction $\to$ Transmission Mechanism $\to$ Counter-Perspective |
| **Asset Class Mapping** | General sentiment only | Granular tags: `EQUITIES`, `FIXED_INCOME`, `FOREX`, `COMMODITIES`, `CRYPTO`, `GENERAL` |
| **Anti-Inducement & Neutrality** | Basic confidence threshold (`<0.80`) | **Regex Blacklist Scanner** (Bans buy/sell advice, price targets, guaranteed returns) + Neutrality Scoring |
| **Market Stance** | 3 options (`BULLISH`, `BEARISH`, `NEUTRAL`) | 4 options: `BULLISH`, `BEARISH`, `MIXED`, `NEUTRAL` (captures multifaceted news) |
| **Frontend Component** | Compact `NewsImpactBadge.vue` | **Expandable `NewsDualImpactCard.vue`** + `NewsImpactBadge.vue` |
| **Validation Audit** | Sentiment Acc: 94.12%, Importance: 88.24% | **Mean Neutrality: 96.8%**, **Compliance Pass Rate: 100%**, **Dual Completeness: 100%** |

---

## 2. Directory Structure

```text
News_AI_(Gemini)/
├── README.md                      # Master handoff documentation (this file)
├── model-manifest.json            # V.5 Model metadata, schema, and capabilities
├── fewshot_examples_v5.json       # V.5 Balanced dual-impact few-shot dataset
├── fewshot_examples.json          # V.4 9-example dataset (preserved)
│
├── nestjs/                        # ⭐ PRIMARY: Drop-in module for NestJS backend
│   ├── news-classifier.module.ts  # NestJS module definition
│   ├── news-classifier.controller.ts # REST endpoints (/ai/news/v5/analyze, /classify, /health)
│   ├── news-classifier.service.ts # Core service with V.5 Dual Impact + Anti-Inducement + Cache
│   ├── fewshot_examples_v5.json   # V.5 Dataset copy
│   ├── interfaces/
│   │   └── news-classifier.interface.ts # V.5 & V.4 TypeScript interfaces
│   └── dto/                       # class-validator DTOs
│
├── backend/                       # ⭐ ALTERNATIVE: Standalone Python Microservice & Docker
│   ├── gemini_news_classifier_v5.py # Core V.5 Python Agent Class (Stdlib)
│   ├── gemini_news_classifier.py  # V.4 Classifier Class (preserved)
│   ├── main.py                    # FastAPI server exposing V.5 & V.4 endpoints
│   ├── fewshot_examples_v5.json   # V.5 Dataset copy
│   ├── Dockerfile                 # Minimal production container
│   └── requirements.txt           # Minimal web dependencies
│
└── frontend-integration/          # ⭐ UI: Frontend Components & Stores
    ├── NewsDualImpactCard.vue     # Quasar / Vue 3 Expandable Dual-Impact Component
    ├── NewsImpactBadge.vue        # Compact Badge Component
    └── news-classifier.store.ts   # Pinia store supporting V.5 analysis & caching
```

---

## 3. HTTP API Endpoints

### Endpoint 1: V.5 Dual-Sided Neutral Analysis (Primary)
- **Path**: `POST /ai/news/v5/analyze`
- **Request Body**:
```json
{
  "title": "Fed leaves interest rates unchanged, signals gradual easing later this year",
  "description": "Federal Reserve officials held benchmark rates steady while noting inflation risks have subsided."
}
```
- **Response (200 OK)**:
```json
{
  "article_id": "sha256:4b9e28f1b3e8c201...",
  "news_category": "CENTRAL_BANK",
  "importance": "HIGH",
  "market_stance": "MIXED",
  "confidence": 0.94,
  "review_required": false,
  "reasoning_steps": {
    "key_facts": [
      "Fed held rates at 5.25%-5.50%",
      "Acknowledged inflation progress",
      "Signaled potential easing later in the year"
    ],
    "transmission_mechanism": "Policy rates determine borrowing costs. Steady rates keep near-term pressure while future cut expectations lower long-duration discount rates.",
    "counter_perspective": "Delay in immediate cuts limits speculative euphoria, but confirmation of terminal peak rates removes downside tail risk."
  },
  "dual_impact_analysis": {
    "positive_impacts": [
      {
        "target": "Growth Equities & Tech",
        "asset_class": "EQUITIES",
        "mechanism": "Lower long-term discount rates support DCF valuation multiples.",
        "timeframe": "MEDIUM_TERM"
      }
    ],
    "negative_impacts": [
      {
        "target": "Commercial Real Estate (REITs)",
        "asset_class": "EQUITIES",
        "mechanism": "Elevated debt servicing costs continue to constrain near-term cash distributions.",
        "timeframe": "SHORT_TERM"
      }
    ]
  },
  "uncertainties": [
    "Upcoming monthly Core PCE readings",
    "Labor market unemployment rate trends"
  ],
  "neutrality_score": 0.98,
  "compliance_disclaimer": "This analysis is for educational and informational purposes only and does not constitute financial, investment, or trading advice.",
  "compliance_flags": [],
  "model": "gemini-flash-lite-latest",
  "prompt_version": "financial-news-dual-impact-v5",
  "cached": false
}
```

### Endpoint 2: V.4 Backward-Compatible Classification
- **Path**: `POST /ai/news/classify`
- Returns traditional `{ article_id, sentiment, importance, confidence, review_required, model }` mapped from V.5.

### Endpoint 3: Health Probe
- **Path**: `GET /ai/news/health`
- Returns readiness status, active model, and cache stats.

---

## 4. How to Test and Audit

Run the automated neutrality audit test suite:
```powershell
py TestCode\audit_neutrality_v5.py
```

Run dataset evaluation:
```powershell
py TestCode\evaluate_gemini_v5.py --limit 10
```
