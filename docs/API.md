# API Documentation

Base URL: `http://localhost:5000/api`

## GET /health
Returns `{ "status": "ok", "service": "triage-api" }`.

## GET /specialties
Returns the available specialty labels.

## POST /triage
Accepts symptoms, optional age/duration/conditions/medications/location, and required severity (1-10). Returns urgency, specialty, reason, recommended action, safety disclaimer, and mock referral options.

If `USE_ML_SERVICE=true` (see `ai-ml/README.md`), the response also includes:
- `source`: `"ml"` or `"rules"` — which engine produced the final urgency
- `confidence`: 0-100, only present when `source` is `"ml"`
- `overriddenBySafetyNet`: `true`, only present when the rule engine escalated over the ML prediction

## GET /referrals
Optional query parameters: `specialty`, `location`, `urgency`.
