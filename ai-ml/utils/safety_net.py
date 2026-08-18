"""
Shared rule-based safety net.

This mirrors backend/services/triageService.js EMERGENCY / HIGH keyword
lists EXACTLY. It is intentionally duplicated (not imported across
languages) so the Python inference service and the Node rule engine can
never silently drift apart without someone noticing in a code review.

If you edit one list, edit the other.
"""

EMERGENCY = [
    "severe chest pain", "difficulty breathing", "severe difficulty breathing",
    "unconscious", "loss of consciousness", "severe bleeding",
    "stroke symptoms", "seizure",
]

HIGH = [
    "chest pain", "shortness of breath", "breathing difficulty",
    "weakness on one side", "confusion", "persistent vomiting",
    "severe abdominal pain", "fainting",
]

SPECIALTY_RULES = [
    ("Cardiology / Emergency Care", ["chest pain", "palpitations", "heart"]),
    ("Respiratory / Emergency Care", ["difficulty breathing", "shortness of breath", "breathing difficulty", "wheezing"]),
    ("Neurology / Emergency Care", ["stroke", "seizure", "weakness on one side", "confusion"]),
    ("Dermatology", ["rash", "itching", "skin"]),
    ("Orthopedics", ["joint pain", "bone pain", "back pain", "fracture"]),
]


def normalize(symptoms):
    return " ".join(str(s).strip().lower() for s in symptoms)


def check_safety_net(symptoms, severity=None):
    """Returns (forced_urgency_or_None, matched_terms)."""
    text = normalize(symptoms)
    matched = [t for t in EMERGENCY if t in text]
    if matched or (severity is not None and severity >= 10):
        return "EMERGENCY", matched
    matched = [t for t in HIGH if t in text]
    if matched or (severity is not None and severity >= 7):
        return "HIGH", matched
    return None, []


def rule_based_specialty(symptoms):
    text = normalize(symptoms)
    for specialty, terms in SPECIALTY_RULES:
        if any(term in text for term in terms):
            return specialty
    return "General Medicine"
