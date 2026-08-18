# AI/ML — Symptom-to-Urgency Model

This replaces the "future work" placeholder that used to live here. The
app's original explainable rule engine (`backend/services/triageService.js`)
is **still in the app and still runs on every request** — this ML layer sits
next to it, not instead of it. That's a deliberate hybrid design: a model
trained on a small hackathon-sized dataset can misclassify a serious case,
so the same doctor-validated keyword rules that used to be the *only*
triage logic are now also the **safety net** that checks the model's
output and force-escalates it when needed.

```
Frontend form  →  POST /api/triage  →  triageService.assessTriage()
                                          ├─ rule engine   (always runs)
                                          └─ ML service     (if enabled)
                                                 ↓
                                   final urgency = the HIGHER of the two
```

If the ML service is down, slow, or disabled, the app falls back to the
rule engine only — nothing breaks.

---

## 1. Where the training data comes from

There is **no real patient data anywhere in this repo** (see the privacy
note in the root `README.md` — that rule still applies). The model in
`ai-ml/datasets/sample_triage_dataset.csv` was built the way the original
idea brief suggested for a time-boxed build:

- **Public symptom-disease datasets** — e.g. Kaggle's "Disease Symptom
  Prediction" dataset and WHO symptom checklists, relabelled from disease
  names into the app's four urgency buckets (LOW / MEDIUM / HIGH /
  EMERGENCY) and its specialty categories.
- **Synthetic cases** — additional rows written to match patterns an
  Indian Tier-2/3 patient or ASHA worker might actually type, to cover
  urgency levels that were underrepresented in the public data.
- **The existing rule engine's own keyword lists** — every emergency/high
  keyword already in `triageService.js` (`severe chest pain`, `unconscious`,
  `seizure`, etc.) has at least one matching row in the dataset, so the ML
  model and the rule engine agree on the clear-cut cases and only add value
  on the ambiguous ones.

**60 rows is a demo-sized dataset, not a production one.** Swap in a larger
one before this goes anywhere near real use — see "Improving the model"
below.

## 2. Where the data is collected in the app (the form)

Nothing about the frontend changed. The existing "Start Triage" form in
`frontend/src/App.jsx` (the `Triage` component) already collects exactly
the fields the model needs:

| Form field | Sent as | Used by the model as |
|---|---|---|
| Symptoms (comma-separated textarea) | `symptoms: string[]` | TF-IDF text features |
| Age (optional number) | `age` | numeric feature |
| Duration (dropdown: *Less than 1 day / 1–3 days / 4–7 days / more than 1 week*) | `duration` | one-hot categorical feature |
| Severity (1–10 slider) | `severity` | numeric feature |
| Existing conditions, medications, location | — | stored, not currently fed to the model |

That payload is validated by `backend/utils/validation.js` (`triageSchema`)
exactly as before, then passed into `triageService.assessTriage()`, which is
now `async` so it can optionally call the ML service.

## 3. How the model was built

Two scikit-learn pipelines, trained on the same feature set:

- **`urgency_model.joblib`** → predicts LOW / MEDIUM / HIGH / EMERGENCY
- **`specialty_model.joblib`** → predicts the suggested specialty

Pipeline per model (`ai-ml/training/train_model.py`):

```
ColumnTransformer
 ├─ symptoms  → TfidfVectorizer(ngram_range=(1,2), max_features=3000)
 ├─ duration  → OneHotEncoder
 ├─ severity  → SimpleImputer (median)
 └─ age       → SimpleImputer (median)
        ↓
LogisticRegression(class_weight="balanced")
```

Logistic Regression over TF-IDF was chosen over fine-tuning a transformer
(e.g. DistilBERT, mentioned in the original tech-stack notes) because with
a dataset this size a linear model trains in seconds on a laptop CPU,
doesn't need a GPU, and is far easier to explain to judges/reviewers than
a black-box transformer — matching the "explainable AI" requirement in the
feature list. `ai-ml/training/` is where a transformer version would go if
the dataset grows enough to justify it (roughly 300+ labeled rows per
urgency class is the rule of thumb).

### The safety net (`ai-ml/utils/safety_net.py`)

The EMERGENCY / HIGH keyword lists and specialty rules are copied
**exactly** from `triageService.js` into this Python file — on purpose,
not imported cross-language, so a diff in a code review is the only way
they can drift apart silently. At inference time:

1. The ML model predicts urgency + specialty.
2. The same keyword rules run over the raw symptom text.
3. If the rules would flag a **higher** urgency than the model did, the
   rules win. The model is never allowed to talk the system out of an
   urgency the rules would have caught on their own — it can only add
   nuance on top of what the rules already treat as clear-cut.

This mirrors section 9 of the original idea brief ("AI misclassifying a
serious case as low-risk → hybrid model with conservative rule-based
safety net").

## 4. Running it

### Train

```bash
cd ai-ml
pip install -r requirements.txt
python training/train_model.py --data datasets/sample_triage_dataset.csv
```

This writes `models/urgency_model.joblib` and `models/specialty_model.joblib`
(already included in this repo, pre-trained on the sample dataset — retrain
once you have your own data).

### Serve

```bash
cd ai-ml
uvicorn inference.serve:app --port 8000 --reload
```

Check it's up: `curl http://localhost:8000/health`

### Turn it on in the backend

In `backend/.env`:

```
USE_ML_SERVICE=true
ML_SERVICE_URL=http://localhost:8000
ML_TIMEOUT_MS=1500
```

Restart the backend (`npm run dev`). Nothing else changes — same API
contract (`docs/API.md`), same frontend, same response shape, with two
additions when the ML path is used: `source: "ml"` and `confidence: <0-100>`
in the response.

Set `USE_ML_SERVICE=false` (or just don't run the Python service) to fall
back to the original rule-engine-only behavior at any time.

## 5. Improving the model

- Replace `datasets/sample_triage_dataset.csv` with a larger labeled set —
  same four columns (`symptoms,age,duration,severity,urgency,specialty`) —
  and rerun `train_model.py`.
- Every real triage request the app processes is already saved to SQLite
  (`triage_requests` table via `triageController.js`). Once real usage
  produces doctor-confirmed outcomes, that table is the natural source for
  a feedback-loop retraining set — the doc's original "Step 5" idea.
- Any model that touches real patient triage decisions needs a proper
  clinical safety/bias/calibration review before real-world use — this
  scaffold is a hackathon/demo starting point, not a validated medical
  device.
