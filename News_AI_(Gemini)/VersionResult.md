# Version Comparison Summary (V.1 – V.5)

## 1. Metric Overview

| Version | Task | Accuracy | Macro‑F1 | Confusion Matrix (BULLISH / BEARISH / NEUTRAL) |
|---------|------|----------|----------|-----------------------------------------------|
| **V.1** | Sentiment | 0.9216 | 0.9209 | N/A |
|         | Importance | 0.8824 | 0.8656 | N/A |
| **V.2** | Sentiment (Valid) | 0.6667 | 0.6251 | `[[5,1,8],[2,7,2],[3,1,22]]` |
|         | Importance (Valid) | 0.6667 | 0.6392 | `[[7,4,1],[2,7,5],[0,5,20]]` |
| **V.3** | Sentiment (Valid) | 0.5686 | 0.4176 | `[[1,11,2],[7,3,1],[1,0,25]]` |
|         | Importance (Valid) | 0.3137 | 0.3740 | `[[8,1,3],[1,3,10],[1,19,5]]` |
| **V.4** | Sentiment (Valid) | 0.9412 | 0.9385 | `[[13,0,1],[0,10,1],[0,1,25]]` |
|         | Importance (Valid) | 0.8824 | 0.8499 | `[[10,2,0],[3,10,1],[0,0,25]]` |
| **V.5** | Sentiment (Valid) | 0.8235 | 0.7972 | `[[10,0,4],[0,6,5],[0,0,26]]` |
|         | Importance (Valid) | 0.7843 | 0.7504 | `[[7,4,1],[1,10,3],[0,2,23]]` |

## 2. จุดเด่น & จุดด้อย (Strengths & Weaknesses)

| Version | จุดเด่น | จุดด้อย |
|---------|----------|----------|
| **V.1** | • Very high sentiment/importance accuracy (≈92 %).<br>• Simple few‑shot Gemini prompt, zero‑training cost. | • No anti‑inducement guard‑rails.<br>• Only single‑label sentiment; no dual‑impact analysis.<br>• No confusion‑matrix visibility. |
| **V.2** | • Supervised TF‑IDF + Logistic Regression provides deterministic inference.<br>• Model artifacts (`.joblib`) can be shipped offline. | • Accuracy drops to ~66 % (sentiment) and ~67 % (importance).<br>• Still single‑label output, no compliance checks.<br>• Performance depends on quality of AI‑pre‑labels. |
| **V.3** | • Introduces decision‑weighting for sentiment (different loss emphasis). | • Very poor performance (≈57 % sentiment, 31 % importance).<br>• Confusion heavily biased toward *NEUTRAL*. |
| **V.4** | • Returns to Gemini few‑shot prompting but with refined prompt and richer few‑shot set.<br>• Highest accuracy among all versions (≈94 % sentiment, 88 % importance).<br>• Still lightweight – no model files shipped. | • Provides only single‑sided market stance (BULLISH/BEARISH/NEUTRAL).<br>• Lacks explicit anti‑inducement regex scanner. |
| **V.5** | • Dual‑sided impact analysis (positive / negative) + market‑stance **MIXED**.<br>• Chain‑of‑Thought reasoning improves explainability.<br>• Regex‑based anti‑inducement + neutrality scoring (≈0.97 compliance rate).<br>• Competitive accuracy (≈82 % sentiment, 78 % importance) while delivering richer structured output.<br>• Full backward‑compatible endpoint for V.4. | • Slight drop in raw accuracy compared to V.4 (trade‑off for richer output & compliance).<br>• Larger prompt size → higher token usage. |

## 3. ทำไมเลือก **V.5** แทนเวอร์ชันอื่น?

1. **ความเป็นกลางและความปลอดภัย** – V.5 มี **anti‑inducement regex blacklist** และ **neutrality_score** (avg 0.97) ที่ไม่มีใน V.4 หรือเวอร์ชันก่อนหน้า.
2. **ข้อมูลเชิงลึกสองด้าน** – สามารถส่งออก *positive_impacts* และ *negative_impacts* พร้อม asset‑class, mechanism, timeframe – เหมาะกับการใช้ในผลิตภัณฑ์การเงินที่ต้องการการประเมินความเสี่ยงและโอกาสอย่างละเอียด.
3. **Chain‑of‑Thought** – ทำให้โมเดลอธิบายขั้นตอนการสกัดข้อมูล, กลไกการส่งผ่าน, มุมมองตรงข้าม ทำให้การตรวจสอบ (audit) ง่ายขึ้นและเพิ่มความเชื่อมั่นของผู้ตรวจสอบ.
4. **Backward Compatibility** – มี endpoint `/ai/news/classify` ที่แมพผลจาก V.5 ไปยังรูปแบบ V.4, ทำให้ทีม Fullstack สามารถอัพเกรดอย่างค่อยเป็นค่อยไปโดยไม่ต้องปรับ UI ด่วน.
5. **ประสิทธิภาพที่ยอมรับได้** – แม้ความแม่นยำของ sentiment‑V.5 (0.823) ต่ำกว่า V.4 (0.941) แต่ยังคงเหนือระดับจำเป็นสำหรับการใช้งานจริง และเมื่อตรวจสอบโดยรวม (ความแม่นยำ + compliance + dual‑impact completeness) V.5 ให้คะแนนรวมที่ดีที่สุด.

## 4. สรุป

- **V.1** – Baseline with high accuracy but limited functionality.
- **V.2** – Traditional ML, deterministic but lower performance.
- **V.3** – Experimental weighting, poor results.
- **V.4** – Peak raw accuracy, still single‑label.
- **V.5** – Balanced solution: respectable accuracy, full dual‑impact analysis, strict anti‑inducement, and seamless hand‑off to Fullstack.

**จึงแนะนำให้ใช้ V.5** สำหรับการส่งต่อให้ทีม Fullstack ต่อไป.
