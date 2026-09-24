"""FastAPI Standalone Microservice for Gemini Financial News Agent (V.5 Dual-Impact).

Provides:
- V.5 Dual-Sided Neutral Analysis (/ai/news/v5/analyze, /ai/news/v5/analyze-batch)
- V.4 Backward-Compatible Classification (/ai/news/classify, /ai/news/classify-batch)
- Multi-dimensional compliance scanning and health monitoring.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from gemini_news_classifier import GeminiNewsClassifier
from gemini_news_classifier_v5 import GeminiNewsAgentV5

app = FastAPI(
    title="Gemini Financial News Intelligence Agent (V.5 Dual-Impact)",
    description="Dual-sided, strictly neutral financial news analysis and classification powered by Google Gemini.",
    version="5.0.0",
)

# CORS configuration
allowed_origins_raw = os.environ.get("CORS_ORIGINS", "*")
allowed_origins = [orig.strip() for orig in allowed_origins_raw.split(",") if orig.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if "*" not in allowed_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

classifier_v4: Optional[GeminiNewsClassifier] = None
agent_v5: Optional[GeminiNewsAgentV5] = None


@app.on_event("startup")
def startup_event() -> None:
    global classifier_v4, agent_v5
    try:
        classifier_v4 = GeminiNewsClassifier.from_environment()
    except Exception as exc:
        print(f"V.4 Classifier initialization warning: {exc}")

    try:
        agent_v5 = GeminiNewsAgentV5.from_environment()
    except Exception as exc:
        print(f"V.5 Agent initialization warning: {exc}")


class ArticleRequest(BaseModel):
    article_id: Optional[str] = Field(None, description="Optional custom unique identifier")
    title: str = Field(..., max_length=1200, description="Headline or title")
    description: Optional[str] = Field("", max_length=2000, description="Summary or context")


class BatchArticleRequest(BaseModel):
    articles: List[ArticleRequest] = Field(..., min_length=1, max_length=50)


# V.4 Response Models
class ClassifyResponse(BaseModel):
    article_id: str
    sentiment: str
    importance: str
    confidence: float
    review_required: bool
    model: str
    prompt_version: str
    cached: Optional[bool] = False


class BatchClassifyResponse(BaseModel):
    results: List[ClassifyResponse]
    total: int
    review_count: int
    duration_ms: float


# V.5 Response Models
class ImpactDetailModel(BaseModel):
    target: str
    asset_class: str
    mechanism: str
    timeframe: str


class DualImpactModel(BaseModel):
    positive_impacts: List[ImpactDetailModel]
    negative_impacts: List[ImpactDetailModel]


class ReasoningStepsModel(BaseModel):
    key_facts: List[str]
    transmission_mechanism: str
    counter_perspective: str


class V5AnalysisResponse(BaseModel):
    article_id: str
    news_category: str
    importance: str
    market_stance: str
    confidence: float
    review_required: bool
    reasoning_steps: ReasoningStepsModel
    dual_impact_analysis: DualImpactModel
    uncertainties: List[str]
    neutrality_score: float
    compliance_disclaimer: str
    compliance_flags: List[str]
    model: str
    prompt_version: str
    cached: Optional[bool] = False


class V5BatchAnalysisResponse(BaseModel):
    results: List[V5AnalysisResponse]
    total: int
    review_count: int
    duration_ms: float


@app.get("/", include_in_schema=False)
def root():
    return {
        "service": "Gemini Financial News Intelligence Agent",
        "version": "V.5",
        "endpoints": {
            "v5_analyze": "/ai/news/v5/analyze",
            "v5_batch": "/ai/news/v5/analyze-batch",
            "v4_classify": "/ai/news/classify",
            "health": "/ai/news/health",
        },
        "docs": "/docs",
    }


@app.get("/ai/news/health", tags=["Health"])
def health_check():
    v5_status = agent_v5.health_check() if agent_v5 else {"status": "uninitialized"}
    v4_status = classifier_v4.health_check() if classifier_v4 else {"status": "uninitialized"}
    return {
        "status": "ready" if (agent_v5 and agent_v5.api_key) else "missing_api_key",
        "primary_agent": "V.5",
        "v5": v5_status,
        "v4_compat": v4_status,
    }


# V.5 Primary Endpoints
@app.post("/ai/news/v5/analyze", response_model=V5AnalysisResponse, tags=["V.5 Dual Impact Analysis"])
def analyze_article_v5(request: ArticleRequest):
    if not agent_v5 or not agent_v5.api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GEMINI_API_KEY is not configured on the server",
        )
    try:
        return agent_v5.analyze(
            title=request.title,
            description=request.description or "",
            article_id=request.article_id,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Inference error: {exc}")


@app.post("/ai/news/v5/analyze-batch", response_model=V5BatchAnalysisResponse, tags=["V.5 Dual Impact Analysis"])
def analyze_batch_v5(request: BatchArticleRequest):
    if not agent_v5 or not agent_v5.api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GEMINI_API_KEY is not configured on the server",
        )
    try:
        articles_data = [art.model_dump() for art in request.articles]
        return agent_v5.analyze_batch(articles_data)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Batch error: {exc}")


# V.4 Backward-Compatible Endpoints
@app.post("/ai/news/classify", response_model=ClassifyResponse, tags=["V.4 Backward Compatibility"])
def classify_article(request: ArticleRequest):
    # Try V.5 backward-compatible mapper first for superior reasoning
    if agent_v5 and agent_v5.api_key:
        try:
            return agent_v5.classify_backward_compatible(
                title=request.title,
                description=request.description or "",
                article_id=request.article_id,
            )
        except Exception:
            pass

    if not classifier_v4 or not classifier_v4.api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GEMINI_API_KEY is not configured on the server",
        )
    try:
        return classifier_v4.classify(
            title=request.title,
            description=request.description or "",
            article_id=request.article_id,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Inference error: {exc}")


@app.post("/ai/news/classify-batch", response_model=BatchClassifyResponse, tags=["V.4 Backward Compatibility"])
def classify_batch(request: BatchArticleRequest):
    if not classifier_v4 or not classifier_v4.api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GEMINI_API_KEY is not configured on the server",
        )
    try:
        articles_data = [art.model_dump() for art in request.articles]
        return classifier_v4.classify_batch(articles_data)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Batch error: {exc}")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
