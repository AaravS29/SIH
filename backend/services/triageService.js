const EMERGENCY = ['severe chest pain','difficulty breathing','severe difficulty breathing','unconscious','loss of consciousness','severe bleeding','stroke symptoms','seizure'];
const HIGH = ['chest pain','shortness of breath','breathing difficulty','weakness on one side','confusion','persistent vomiting','severe abdominal pain','fainting'];
const SPECIALTY_RULES = [
  { specialty: 'Cardiology / Emergency Care', terms: ['chest pain','palpitations','heart'] },
  { specialty: 'Respiratory / Emergency Care', terms: ['difficulty breathing','shortness of breath','breathing difficulty','wheezing'] },
  { specialty: 'Neurology / Emergency Care', terms: ['stroke','seizure','weakness on one side','confusion'] },
  { specialty: 'Dermatology', terms: ['rash','itching','skin'] },
  { specialty: 'Orthopedics', terms: ['joint pain','bone pain','back pain','fracture'] }
];
const URGENCY_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, EMERGENCY: 3 };
const normalize = s => String(s || '').trim().toLowerCase();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const USE_ML_SERVICE = process.env.USE_ML_SERVICE === 'true';
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 1500);

// The original explainable rule engine. This ALWAYS runs, even when the ML
// service is enabled — it doubles as the safety net that the ML prediction
// is checked against (see assessTriage below), matching the hybrid
// "ML + doctor-validated rules" approach described in the project brief.
function assessTriageRuleEngine(input) {
  const symptoms = input.symptoms.map(normalize);
  const text = symptoms.join(' ');
  let urgency = 'LOW';
  if (symptoms.some(s => EMERGENCY.some(t => s.includes(t))) || input.severity >= 10) urgency = 'EMERGENCY';
  else if (symptoms.some(s => HIGH.some(t => s.includes(t))) || input.severity >= 7) urgency = 'HIGH';
  else if (input.severity >= 4 || input.duration === 'more than 1 week') urgency = 'MEDIUM';

  let specialty = 'General Medicine';
  for (const rule of SPECIALTY_RULES) {
    if (rule.terms.some(term => text.includes(term))) { specialty = rule.specialty; break; }
  }
  return { urgency, specialty, source: 'rules' };
}

function explain(urgency) {
  const reason = urgency === 'EMERGENCY'
    ? 'Some reported features can be associated with situations that require immediate professional assessment.'
    : urgency === 'HIGH'
      ? 'The reported symptoms may require prompt professional evaluation.'
      : urgency === 'MEDIUM'
        ? 'The reported symptoms may benefit from an in-person medical consultation.'
        : 'The reported information does not indicate a high urgency level in this prototype, but professional advice is still appropriate if symptoms persist or worsen.';
  const recommendedAction = urgency === 'EMERGENCY' ? 'Seek emergency medical care now.' : urgency === 'HIGH' ? 'Seek urgent medical evaluation.' : urgency === 'MEDIUM' ? 'Schedule an in-person medical consultation.' : 'Monitor symptoms and consider a routine medical consultation if needed.';
  return { reason, recommendedAction };
}

// Calls the Python ML microservice (ai-ml/inference/serve.py). Returns null
// on any failure/timeout so the caller can fall back cleanly — the app must
// keep working even if the ML service isn't running.
async function callMlService(input) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symptoms: input.symptoms,
        age: input.age ?? null,
        duration: input.duration || '',
        severity: input.severity
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return { urgency: data.urgency, specialty: data.specialty, confidence: data.confidence, source: 'ml' };
  } catch {
    return null; // ML service down/slow/unreachable — fall back to rules only
  }
}

// Public entry point used by triageController.js.
// Hybrid strategy (matches the project's own design doc):
//   1. Always compute the rule engine result — it's the safety net.
//   2. If USE_ML_SERVICE=true, also ask the ML service.
//   3. Final urgency = the HIGHER of the two (never let ML silently
//      downgrade a case the rules flagged as risky).
//   4. Specialty and "source" come from whichever engine produced the
//      final urgency, so the explanation stays consistent.
export async function assessTriage(input) {
  const ruleResult = assessTriageRuleEngine(input);

  let final = ruleResult;
  let mlConfidence = null;
  let overriddenBySafetyNet = false;

  if (USE_ML_SERVICE) {
    const mlResult = await callMlService(input);
    if (mlResult) {
      mlConfidence = mlResult.confidence;
      if (URGENCY_RANK[ruleResult.urgency] > URGENCY_RANK[mlResult.urgency]) {
        final = ruleResult;
        overriddenBySafetyNet = true;
      } else {
        final = mlResult;
      }
    }
  }

  const { reason, recommendedAction } = explain(final.urgency);
  return {
    urgency: final.urgency,
    specialty: final.specialty,
    reason,
    recommendedAction,
    source: final.source,
    ...(mlConfidence !== null ? { confidence: mlConfidence } : {}),
    ...(overriddenBySafetyNet ? { overriddenBySafetyNet: true } : {}),
    safetyDisclaimer: 'This prototype provides preliminary guidance only and does not replace professional medical advice, diagnosis, or treatment.'
  };
}
