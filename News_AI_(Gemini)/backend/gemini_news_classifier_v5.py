"""Server-side Gemini V.5 Dual-Sided Neutral Market Impact Agent.

Key Features:
- Chain-of-Thought (CoT) reasoning for financial transmission mechanisms.
- Forced symmetrical dual-impact extraction (positive catalysts vs negative risks).
- Granular asset-class mapping: EQUITIES, FIXED_INCOME, FOREX, COMMODITIES, CRYPTO.
- Anti-inducement regulatory compliance guardrails (bans buy/sell directional steering).
- Automated post-generation bias and forbidden-advisory term scanner.
- Strict JSON schema enforcement via Gemini responseJsonSchema.
- SHA-256 in-memory deduplication cache.
- Exponential backoff with jitter for transient 429/5xx errors.
- Fully self-contained standard library implementation.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, TypedDict
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

MODEL = "gemini-flash-lite-latest"
PROMPT_VERSION = "financial-news-dual-impact-v5"

CATEGORIES = (
    "MACROECONOMIC",
    "CENTRAL_BANK",
    "CORPORATE_EARNINGS",
    "GEOPOLITICAL_COMMODITIES",
    "REGULATORY_LEGAL",
    "GENERAL_FINANCIAL",
)
IMPORTANCE = ("HIGH", "MEDIUM", "LOW")
MARKET_STANCES = ("BULLISH", "BEARISH", "MIXED", "NEUTRAL")
ASSET_CLASSES = ("EQUITIES", "FIXED_INCOME", "FOREX", "COMMODITIES", "CRYPTO", "GENERAL")
TIMEFRAMES = ("SHORT_TERM", "MEDIUM_TERM")

DEFAULT_CONFIDENCE_THRESHOLD = 0.80
DEFAULT_NEUTRALITY_THRESHOLD = 0.85
DEFAULT_CACHE_TTL_SECONDS = 86400

EXAMPLES_PATH = Path(__file__).resolve().parent.parent / "fewshot_examples_v5.json"
if not EXAMPLES_PATH.is_file():
    EXAMPLES_PATH = Path(__file__).with_name("fewshot_examples_v5.json")
if not EXAMPLES_PATH.is_file():
    EXAMPLES_PATH = Path(__file__).resolve().parent.parent.parent / "Model Store" / "V.5" / "fewshot_examples.json"

# Strict regulatory compliance blacklist (English and Thai advisory keywords)
FORBIDDEN_ADVISORY_PATTERNS = [
    r"\b(should|must|ought to)\s+(buy|sell|purchase|short|accumulate|dump)\b",
    r"\b(strong|definite)\s+(buy|sell)\b",
    r"\b(guaranteed\s+(return|returns|profit|profits|upside|gain|gains)|(return|returns|profit|profits|upside|gain|gains)\s+(is|are)?\s*guaranteed)\b",
    r"\btarget\s+price\s+of\s+[\$0-9]",
    r"\ball-in\b",
    r"\bcannot\s+lose\b",
    r"ควรซื้อ",
    r"น่าเก็งกำไร",
    r"ควรรีบขาย",
    r"น่าทยอยสะสม",
    r"เป้าหมายราคาที่",
    r"ฟันธงว่าขึ้น",
    r"ฟันธงว่าลง",
    r"ตกรถ",
    r"ดอยแน่นอน",
]


class ImpactDetail(TypedDict):
    target: str
    asset_class: str
    mechanism: str
    timeframe: str


class DualImpactAnalysis(TypedDict):
    positive_impacts: List[ImpactDetail]
    negative_impacts: List[ImpactDetail]


class ReasoningSteps(TypedDict):
    key_facts: List[str]
    transmission_mechanism: str
    counter_perspective: str


class V5AnalysisResult(TypedDict):
    article_id: str
    news_category: str
    importance: str
    market_stance: str
    confidence: float
    review_required: bool
    reasoning_steps: ReasoningSteps
    dual_impact_analysis: DualImpactAnalysis
    uncertainties: List[str]
    neutrality_score: float
    compliance_disclaimer: str
    compliance_flags: List[str]
    model: str
    prompt_version: str
    cached: Optional[bool]


class GeminiNewsAgentV5:
    """Production-grade financial news analysis agent with two-sided impact and strict neutrality."""

    def __init__(
        self,
        api_key: str,
        model: str = MODEL,
        examples_path: Optional[Path] = None,
        confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
        neutrality_threshold: float = DEFAULT_NEUTRALITY_THRESHOLD,
        cache_ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS,
        max_retries: int = 3,
        timeout_seconds: int = 40,
    ) -> None:
        key = api_key.strip()
        if not key:
            raise ValueError("GEMINI_API_KEY is required")
        self.api_key = key
        self.model = model.strip() or MODEL
        self.confidence_threshold = confidence_threshold
        self.neutrality_threshold = neutrality_threshold
        self.cache_ttl_seconds = cache_ttl_seconds
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds

        path_to_try = examples_path or EXAMPLES_PATH
        if not path_to_try.is_file():
            # Fallback path discovery
            alt_paths = [
                Path(__file__).resolve().parent / "fewshot_examples_v5.json",
                Path(__file__).resolve().parent.parent / "Model Store" / "V.5" / "fewshot_examples.json",
                Path(os.getcwd()) / "Model Store" / "V.5" / "fewshot_examples.json",
            ]
            for p in alt_paths:
                if p.is_file():
                    path_to_try = p
                    break

        if not path_to_try.is_file():
            raise FileNotFoundError(f"V.5 few-shot examples file not found at: {path_to_try}")

        self.examples: List[Dict[str, Any]] = json.loads(path_to_try.read_text(encoding="utf-8"))
        self._cache: Dict[str, Tuple[Dict[str, Any], float]] = {}

    @classmethod
    def from_environment(cls) -> "GeminiNewsAgentV5":
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            # Check project root env file if available
            root_env = Path(__file__).resolve().parent.parent.parent / "env"
            if root_env.is_file():
                for line in root_env.read_text(encoding="utf-8").splitlines():
                    if line.startswith("GEMINI_API_KEY="):
                        api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break

        model = os.environ.get("GEMINI_MODEL", MODEL).strip()
        threshold = float(os.environ.get("CLASSIFIER_CONFIDENCE_THRESHOLD", DEFAULT_CONFIDENCE_THRESHOLD))
        neutrality_threshold = float(os.environ.get("AGENT_NEUTRALITY_THRESHOLD", DEFAULT_NEUTRALITY_THRESHOLD))
        cache_ttl = int(os.environ.get("CLASSIFIER_CACHE_TTL_SECONDS", DEFAULT_CACHE_TTL_SECONDS))
        max_retries = int(os.environ.get("GEMINI_MAX_RETRIES", 3))
        timeout = int(os.environ.get("GEMINI_TIMEOUT_SECONDS", 40))

        return cls(
            api_key=api_key,
            model=model,
            confidence_threshold=threshold,
            neutrality_threshold=neutrality_threshold,
            cache_ttl_seconds=cache_ttl,
            max_retries=max_retries,
            timeout_seconds=timeout,
        )

    def analyze(
        self,
        title: str,
        description: str = "",
        article_id: Optional[str] = None,
    ) -> V5AnalysisResult:
        """Perform comprehensive, dual-sided, strictly neutral market impact analysis."""
        compact_title = self._compact(title, limit=1200)
        compact_desc = self._compact(description, limit=2000)

        if not compact_title and not compact_desc:
            raise ValueError("title or description is required for analysis")

        resolved_id = article_id or self._generate_id(compact_title, compact_desc)

        # 1. Deduplication Cache Check
        cache_key = self._generate_id(compact_title, compact_desc)
        now = time.time()
        if self.cache_ttl_seconds > 0 and cache_key in self._cache:
            cached_data, expires_at = self._cache[cache_key]
            if now < expires_at:
                result_copy = dict(cached_data)
                result_copy["article_id"] = resolved_id
                result_copy["cached"] = True
                return result_copy  # type: ignore[return-value]
            del self._cache[cache_key]

        # 2. Build Prompt & Enforce Strict JSON Schema
        prompt_text = self._build_prompt(resolved_id, compact_title, compact_desc)
        schema = self._get_v5_schema()

        payload = {
            "contents": [{"parts": [{"text": prompt_text}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": schema,
                "temperature": 0.1,
                "maxOutputTokens": 1000,
            },
        }

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?"
            + urlencode({"key": self.api_key})
        )
        request = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        # 3. Call Gemini with retry & exponential backoff
        response_data = self._call_with_retry(request)

        # 4. Extract structured payload
        candidate = response_data.get("candidates", [{}])[0]
        parts = candidate.get("content", {}).get("parts", [])
        text = "".join(str(part.get("text", "")) for part in parts)
        if not text:
            raise RuntimeError("Empty response received from Gemini API")

        parsed = json.loads(text)

        # 5. Anti-Inducement & Neutrality Compliance Scan
        full_generated_text = json.dumps(parsed, ensure_ascii=False)
        compliance_flags = self._scan_anti_inducement(full_generated_text)

        confidence_val = parsed.get("confidence", 0.85)
        if not isinstance(confidence_val, (int, float)):
            confidence_val = 0.75
        confidence = max(0.0, min(1.0, float(confidence_val)))

        neutrality_score = float(parsed.get("neutrality_score", 0.95))
        if compliance_flags:
            # Penalize neutrality score if forbidden advisory words are detected
            neutrality_score = min(neutrality_score, 0.60)

        review_required = (
            confidence < self.confidence_threshold
            or neutrality_score < self.neutrality_threshold
            or bool(compliance_flags)
        )

        result: V5AnalysisResult = {
            "article_id": str(parsed.get("article_id") or resolved_id),
            "news_category": str(parsed.get("news_category") or "GENERAL_FINANCIAL"),
            "importance": str(parsed.get("importance") or "MEDIUM"),
            "market_stance": str(parsed.get("market_stance") or "NEUTRAL"),
            "confidence": round(confidence, 4),
            "review_required": review_required,
            "reasoning_steps": parsed.get("reasoning_steps") or {
                "key_facts": [],
                "transmission_mechanism": "",
                "counter_perspective": "",
            },
            "dual_impact_analysis": parsed.get("dual_impact_analysis") or {
                "positive_impacts": [],
                "negative_impacts": [],
            },
            "uncertainties": parsed.get("uncertainties") or [],
            "neutrality_score": round(neutrality_score, 4),
            "compliance_disclaimer": str(
                parsed.get("compliance_disclaimer")
                or "This analysis is for educational and informational purposes only and does not constitute financial, investment, or trading advice."
            ),
            "compliance_flags": compliance_flags,
            "model": self.model,
            "prompt_version": PROMPT_VERSION,
            "cached": False,
        }

        # 6. Populate cache
        if self.cache_ttl_seconds > 0:
            self._cache[cache_key] = (result, now + self.cache_ttl_seconds)
            if len(self._cache) > 5000:
                first_k = next(iter(self._cache))
                del self._cache[first_k]

        return result

    def classify_backward_compatible(
        self,
        title: str,
        description: str = "",
        article_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Provides backward-compatible V.4-style output format mapped from V.5."""
        analysis = self.analyze(title=title, description=description, article_id=article_id)
        # Map V.5 market_stance to V.4 sentiment
        stance = analysis["market_stance"]
        sentiment = stance if stance in ("BULLISH", "BEARISH", "NEUTRAL") else "NEUTRAL"

        return {
            "article_id": analysis["article_id"],
            "sentiment": sentiment,
            "importance": analysis["importance"],
            "confidence": analysis["confidence"],
            "review_required": analysis["review_required"],
            "model": analysis["model"],
            "prompt_version": analysis["prompt_version"],
            "cached": analysis.get("cached", False),
            "dual_impact": analysis["dual_impact_analysis"],
            "reasoning": analysis["reasoning_steps"],
        }

    def analyze_batch(self, articles: List[Dict[str, str]]) -> Dict[str, Any]:
        """Analyze multiple articles sequentially with rate guard."""
        start_time = time.time()
        results: List[V5AnalysisResult] = []
        review_count = 0

        for item in articles:
            res = self.analyze(
                title=item.get("title", ""),
                description=item.get("description", ""),
                article_id=item.get("article_id"),
            )
            if res["review_required"]:
                review_count += 1
            results.append(res)

        return {
            "results": results,
            "total": len(results),
            "review_count": review_count,
            "duration_ms": round((time.time() - start_time) * 1000, 2),
        }

    def health_check(self) -> Dict[str, Any]:
        return {
            "status": "ready" if bool(self.api_key) else "missing_api_key",
            "version": "V.5",
            "prompt_version": PROMPT_VERSION,
            "model": self.model,
            "examples_count": len(self.examples),
            "cached_entries": len(self._cache),
            "confidence_threshold": self.confidence_threshold,
            "neutrality_threshold": self.neutrality_threshold,
        }

    def _build_prompt(self, article_id: str, title: str, description: str) -> str:
        article = {"article_id": article_id, "title": title, "description": description}
        examples_str = json.dumps(self.examples, ensure_ascii=False, separators=(",", ":"))
        article_str = json.dumps(article, ensure_ascii=False, separators=(",", ":"))

        return f"""You are an objective financial analytics AI agent. Your mission is to analyze financial and macroeconomic news by rigorously identifying BOTH positive catalysts (upside opportunities) and negative risks (downside pressure) across global markets, sectors, and asset classes.

STRICT REGULATORY & NEUTRALITY MANDATE:
1. NON-ADVISORY: You MUST NOT give financial, trading, or investment advice. Never tell users to buy, sell, accumulate, or hold any asset. Never provide price targets.
2. BALANCED SYMMETRY: Financial events create winners and losers. You must present both Bull and Bear transmission mechanisms with equal analytical rigor.
3. GROUNDED IN FACTS: Base reasoning strictly on facts provided in the text and standard economic principles. Do not extrapolate unfounded rumors.
4. PROBABILISTIC FRAMING: Use conditional language ("may support...", "presents downside risk to...") rather than definitive certainties.
5. Return JSON only conforming to the schema.

Few-shot reference demonstrations:
{examples_str}

Unlabeled target article to analyze:
{article_str}"""

    def _get_v5_schema(self) -> Dict[str, Any]:
        impact_item_schema = {
            "type": "object",
            "properties": {
                "target": {"type": "string"},
                "asset_class": {"type": "string", "enum": list(ASSET_CLASSES)},
                "mechanism": {"type": "string"},
                "timeframe": {"type": "string", "enum": list(TIMEFRAMES)},
            },
            "required": ["target", "asset_class", "mechanism", "timeframe"],
        }

        return {
            "type": "object",
            "properties": {
                "article_id": {"type": "string"},
                "news_category": {"type": "string", "enum": list(CATEGORIES)},
                "importance": {"type": "string", "enum": list(IMPORTANCE)},
                "market_stance": {"type": "string", "enum": list(MARKET_STANCES)},
                "confidence": {"type": "number"},
                "reasoning_steps": {
                    "type": "object",
                    "properties": {
                        "key_facts": {"type": "array", "items": {"type": "string"}},
                        "transmission_mechanism": {"type": "string"},
                        "counter_perspective": {"type": "string"},
                    },
                    "required": ["key_facts", "transmission_mechanism", "counter_perspective"],
                },
                "dual_impact_analysis": {
                    "type": "object",
                    "properties": {
                        "positive_impacts": {"type": "array", "items": impact_item_schema},
                        "negative_impacts": {"type": "array", "items": impact_item_schema},
                    },
                    "required": ["positive_impacts", "negative_impacts"],
                },
                "uncertainties": {"type": "array", "items": {"type": "string"}},
                "neutrality_score": {"type": "number"},
                "compliance_disclaimer": {"type": "string"},
            },
            "required": [
                "article_id",
                "news_category",
                "importance",
                "market_stance",
                "confidence",
                "reasoning_steps",
                "dual_impact_analysis",
                "uncertainties",
                "neutrality_score",
                "compliance_disclaimer",
            ],
        }

    def _scan_anti_inducement(self, text: str) -> List[str]:
        flags: List[str] = []
        for pattern in FORBIDDEN_ADVISORY_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                flags.append(f"Forbidden advisory pattern detected: '{pattern}'")
        return flags

    def _call_with_retry(self, request: Request) -> Dict[str, Any]:
        for attempt in range(self.max_retries + 1):
            try:
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    return json.load(response)
            except HTTPError as error:
                is_retryable = error.code in {429, 500, 502, 503, 504}
                if not is_retryable or attempt == self.max_retries:
                    raise
                delay = (2.0 * (2**attempt)) + random.uniform(0.2, 0.8)
                time.sleep(delay)
            except Exception:
                if attempt == self.max_retries:
                    raise
                time.sleep(2.0 * (2**attempt))
        raise RuntimeError("Retry loop exhausted unexpectedly")

    @staticmethod
    def _compact(value: Optional[str], limit: int = 1200) -> str:
        return " ".join(str(value or "").split())[:limit]

    @staticmethod
    def _generate_id(title: str, description: str) -> str:
        digest = hashlib.sha256(f"{title}|{description}".encode("utf-8")).hexdigest()
        return f"sha256:{digest}"
