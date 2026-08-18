"""
Trains the two classifiers used by ai-ml/inference/serve.py:

  1. urgency_model.joblib   -> predicts LOW / MEDIUM / HIGH / EMERGENCY
  2. specialty_model.joblib -> predicts suggested specialty

Features used:
  - symptoms   (free text, comma-separated -> TF-IDF, 1-2 grams)
  - severity   (1-10 slider from the frontend, passed through as a number)
  - duration   (one of the frontend's fixed dropdown options -> one-hot)
  - age        (optional, imputed with the training median if missing)

This mirrors the exact fields the frontend already collects in the
"Start Triage" form (frontend/src/App.jsx) and sends to POST /api/triage,
so no schema changes were needed anywhere else in the app.

Usage:
    cd ai-ml
    pip install -r requirements.txt
    python training/train_model.py --data datasets/sample_triage_dataset.csv
"""

import argparse
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
import joblib

URGENCY_LEVELS = ["LOW", "MEDIUM", "HIGH", "EMERGENCY"]


def build_pipeline():
    features = ColumnTransformer(
        transformers=[
            ("symptoms_tfidf", TfidfVectorizer(ngram_range=(1, 2), max_features=3000), "symptoms"),
            ("duration_ohe", OneHotEncoder(handle_unknown="ignore"), ["duration"]),
            ("severity", SimpleImputer(strategy="median"), ["severity"]),
            ("age", SimpleImputer(strategy="median"), ["age"]),
        ],
        remainder="drop",
    )
    return Pipeline([
        ("features", features),
        ("clf", LogisticRegression(max_iter=2000, class_weight="balanced")),
    ])


def train(data_path: str, models_dir: str):
    df = pd.read_csv(data_path)
    df["duration"] = df["duration"].fillna("")
    bad = set(df["urgency"].unique()) - set(URGENCY_LEVELS)
    assert not bad, f"urgency column has unexpected values: {bad}. Must be one of {URGENCY_LEVELS}"

    X = df[["symptoms", "duration", "severity", "age"]]

    # --- urgency model ---
    y_urgency = df["urgency"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_urgency, test_size=0.2, random_state=42, stratify=y_urgency
    )
    urgency_pipe = build_pipeline()
    urgency_pipe.fit(X_train, y_train)
    print("\n=== Urgency classification report ===")
    print(classification_report(y_test, urgency_pipe.predict(X_test), zero_division=0))
    joblib.dump(urgency_pipe, f"{models_dir}/urgency_model.joblib")
    print(f"Saved -> {models_dir}/urgency_model.joblib")

    # --- specialty model ---
    y_specialty = df["specialty"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_specialty, test_size=0.2, random_state=42
    )
    specialty_pipe = build_pipeline()
    specialty_pipe.fit(X_train, y_train)
    print("\n=== Specialty classification report ===")
    print(classification_report(y_test, specialty_pipe.predict(X_test), zero_division=0))
    joblib.dump(specialty_pipe, f"{models_dir}/specialty_model.joblib")
    print(f"Saved -> {models_dir}/specialty_model.joblib")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="datasets/sample_triage_dataset.csv")
    parser.add_argument("--models-dir", default="models")
    args = parser.parse_args()
    train(args.data, args.models_dir)
