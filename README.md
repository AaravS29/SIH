# AI-Powered Triage & Referral Router

A student-built full-stack prototype for initial symptom triage and healthcare referral routing in Tier-2/Tier-3 access settings.

> **Medical disclaimer:** This is an educational prototype. It does not diagnose disease and does not replace professional medical advice, diagnosis, treatment, or emergency services. For severe or emergency symptoms, seek immediate professional care.

## Features

- Symptom and basic-information form
- Explainable LOW / MEDIUM / HIGH / EMERGENCY triage categories
- Suggested medical specialty
- Mock healthcare referral router
- SQLite persistence for triage requests and facilities
- REST API
- Responsive React frontend
- Offline browser speech input using the bundled Whisper model
- Optional ML urgency/specialty classifier (`ai-ml/`), layered on top of the rule engine with the rule engine acting as a safety net; see `ai-ml/README.md`

## Architecture

Frontend → Express API → Triage Service / Rule Engine → Referral Service → SQLite

The browser microphone is processed locally by the frontend. Audio is not sent to the backend for transcription.

## Stack

- React + Vite
- Node.js + Express
- SQLite + better-sqlite3
- Zod validation
- Transformers.js with a local `whisper-tiny.en` model
- Python scaffold for optional ML inference

## Run locally

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

The API runs at `http://localhost:5000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

### Microphone input

The frontend uses the browser Web Speech API when available. If it is unavailable or fails, the app uses the offline Whisper fallback. The fallback captures raw PCM audio locally, resamples it to 16 kHz, and transcribes it with the bundled model; it does not send audio to the backend.

Microphone access requires `http://localhost` or an HTTPS URL. If permission was denied previously, open the browser site settings, allow the microphone, reload the page, and try again. The browser may also block the microphone when another application is using it.

For **Firefox**, the offline Whisper path is selected automatically because Firefox does not provide the Chromium Web Speech API. Keep the app tab open while the model loads on first use, speak for at least one or two seconds, then press the stop button. Firefox uses single-threaded WASM for compatibility.

## Deploy publicly for phones and computers

The project has two parts. Deploy the **backend API** to a Node-compatible host first, then deploy the **frontend** to Vercel. Vercel provides HTTPS automatically, which is required for microphone access on phones.

### 1. Push the project to GitHub

From the project root:

```bash
git init
git add .
git commit -m "Prepare triage router for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Do not commit `.env`, credentials, API keys, or database files. The repository `.gitignore` already excludes these files.

### 2. Deploy the backend API

The repository includes `render.yaml` for a simple Render deployment. On Render, choose **New → Blueprint**, connect the GitHub repository, and select the repository. Render will detect the backend service configuration.

After the service is created, copy its public URL, for example:

```text
https://ai-triage-referral-router-api.onrender.com
```

Set the backend environment variables in the hosting dashboard:

| Variable | Value |
|---|---|
| `CLIENT_URL` | Your final Vercel URL, such as `https://your-app.vercel.app` |
| `DATABASE_PATH` | `./data/triage.db` |
| `USE_ML_SERVICE` | `false` |
| `ML_SERVICE_URL` | `http://localhost:8000` |
| `ML_TIMEOUT_MS` | `1500` |

The optional Python ML service is not required. With `USE_ML_SERVICE=false`, the Node rule engine handles triage and the safety logic remains active.

Check that the backend is healthy at:

```text
https://YOUR_BACKEND_HOST/api/health
```

### 3. Deploy the frontend to Vercel

In Vercel, choose **Add New → Project**, import the GitHub repository, and keep the repository root as the project root. The included `vercel.json` builds `frontend/` and serves `frontend/dist/`.

Add this Vercel environment variable before deploying:

```text
VITE_API_URL=https://YOUR_BACKEND_HOST/api
```

For example:

```text
VITE_API_URL=https://ai-triage-referral-router-api.onrender.com/api
```

Deploy the project and copy the generated HTTPS URL. Then return to the backend hosting dashboard and set `CLIENT_URL` to that exact Vercel URL. Redeploy or restart the backend after changing the variable.

If you use a custom domain, set `CLIENT_URL` to the custom HTTPS origin instead. Multiple allowed frontend origins can be entered as a comma-separated value.

### 4. Test from a phone

Open the Vercel HTTPS URL on the phone, allow microphone permission, and tap the microphone button. On the first use, the browser downloads and initializes the local Whisper model, so the first transcription may take longer. Use a recent Chrome, Edge, or Firefox browser and speak for at least one or two seconds before stopping.

If the form loads but triage submission fails, verify that `VITE_API_URL` points to the public backend URL rather than `localhost`, verify `/api/health`, and confirm that the backend `CLIENT_URL` exactly matches the Vercel origin.

## API

See `docs/API.md` for the endpoint contract. The main endpoints are:

- `GET /api/health`
- `GET /api/specialties`
- `POST /api/triage`
- `GET /api/referrals`

## Deployment limitations

The current backend uses SQLite. On free or ephemeral hosting, local filesystem data may be reset when the service restarts or redeploys. That is acceptable for a demonstration but not for production records. A production deployment should use a managed persistent database and approved healthcare data sources.

The bundled Whisper model increases the frontend download size and may be slow on low-end phones. A dedicated GPU is not required, but a modern phone and a stable connection for the first model load are recommended.

## Team workflow

Frontend work should stay primarily in `frontend/`, backend work in `backend/`, and future model work in `ai-ml/`. The API contract in `docs/API.md` is the shared boundary.

## Future improvements

- Better validated triage logic
- Formal ML model evaluation
- Authentication and role-based access if required
- More realistic facility data through an approved API
- Automated tests
- Managed persistent database
- Accessibility audit

## Privacy

Do not use real patient data. Do not commit credentials, API keys, or private tokens.
