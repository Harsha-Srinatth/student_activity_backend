"""
Club joiner prediction script.
Reads JSON from stdin, loads the existing club_prediction_model.pkl,
runs predict_proba for every student, writes result JSON to stdout.

Same stdin/stdout pattern as predict.py (placement model).

Feature columns sent by Node.js (must match what the model was trained on):
  cgpa, projects, workshops, certifications, internships,
  coPoints, extraPoints, rank, semester, dept_encoded

Input JSON:
{
  "students": [
    {
      "studentid": "24B91A54Q0",
      "fullname":  "Rahul Kumar",
      "dept":      "CSE",
      "semester":  "3",
      "cgpa":       7.5,
      "coPoints":   65,
      "extraPoints":45,
      "rank":       120,
      "projects":   2,
      "certifications": 3,
      "workshops":  4,
      "internships":1,
      "profileImage": null
    },
    ...
  ]
}

Output JSON:
{
  "predictedStudents": 42,
  "confidence": 0.67,
  "topStudents": [...],
  "breakdown": { "eligible": 120, "likelyToJoin": 42, "unlikely": 78 }
}
"""

import sys
import json
import pickle
import os
import warnings
warnings.filterwarnings("ignore")

# Fixed dept encoding — matches the order used during training
DEPT_MAP = {"CSE": 0, "ECE": 1, "MECH": 2, "CIVIL": 3, "IT": 4}


def encode_dept(dept_str):
    d = str(dept_str or "").strip().upper()
    return DEPT_MAP.get(d, 5)   # 5 = OTHER / unknown


def get_semester(raw):
    """Parse semester from strings like '3', '3-4', 'Sem 3'."""
    for token in str(raw or "0").replace("-", " ").split():
        try:
            return int(token)
        except ValueError:
            pass
    return 0


def build_feature_vector(student):
    """
    Feature order (10 columns) — must match training:
      cgpa, projects, workshops, certifications, internships,
      coPoints, extraPoints, rank, semester, dept_encoded
    """
    return [
        float(student.get("cgpa",           0) or 0),
        float(student.get("projects",        0) or 0),
        float(student.get("workshops",       0) or 0),
        float(student.get("certifications",  0) or 0),
        float(student.get("internships",     0) or 0),
        float(student.get("coPoints",        0) or 0),
        float(student.get("extraPoints",     0) or 0),
        float(student.get("rank",            0) or 0),
        float(get_semester(student.get("semester", 0))),
        float(encode_dept(student.get("dept", ""))),
    ]


def load_model(model_path):
    """
    Load the pkl file.
    Supports:
      - plain sklearn model  (e.g. LogisticRegression / RandomForest saved directly)
      - bundle dict          { "pipeline": ..., "le_dept": ... }
    Returns the callable model object.
    """
    with open(model_path, "rb") as f:
        obj = pickle.load(f)

    if isinstance(obj, dict) and "pipeline" in obj:
        return obj["pipeline"]   # our bundle format
    return obj                   # plain sklearn model


def main():
    try:
        raw = sys.stdin.read().strip()
        if not raw:
            raise ValueError("No input received from stdin")

        data     = json.loads(raw)
        students = data.get("students", [])

        if not students:
            print(json.dumps({
                "predictedStudents": 0,
                "confidence"       : 0.0,
                "topStudents"      : [],
                "breakdown"        : {"eligible": 0, "likelyToJoin": 0, "unlikely": 0},
            }))
            sys.exit(0)

        # ── Load existing model ───────────────────────────────────────────
        model_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "club_prediction_model.pkl"
        )
        model = load_model(model_path)

        # ── Build feature matrix ──────────────────────────────────────────
        feature_matrix = [build_feature_vector(s) for s in students]

        # ── predict_proba ─────────────────────────────────────────────────
        if hasattr(model, "predict_proba"):
            proba_matrix = model.predict_proba(feature_matrix)
            classes      = list(model.classes_)
            join_col     = classes.index(1) if 1 in classes else len(classes) - 1
            join_probs   = [float(row[join_col]) for row in proba_matrix]
        else:
            preds      = model.predict(feature_matrix)
            join_probs = [float(p) for p in preds]

        # ── Assemble scored list ──────────────────────────────────────────
        scored = []
        for student, prob in zip(students, join_probs):
            p = round(prob, 2)
            scored.append({
                "studentid"   : student.get("studentid",    ""),
                "fullname"    : student.get("fullname",     "Unknown"),
                "dept"        : student.get("dept",         ""),
                "semester"    : student.get("semester",     ""),
                "cgpa"        : student.get("cgpa",         0),
                "profileImage": student.get("profileImage", None),
                "probability" : p,
                "score"       : int(round(p * 100)),
            })

        scored.sort(key=lambda x: x["probability"], reverse=True)

        predicted_students = int(round(sum(s["probability"] for s in scored)))
        likely   = [s for s in scored if s["probability"] >= 0.40]
        unlikely = [s for s in scored if s["probability"] <  0.40]

        top_half   = scored[: max(1, len(scored) // 2)]
        confidence = round(
            sum(s["probability"] for s in top_half) / len(top_half), 2
        )

        print(json.dumps({
            "predictedStudents": predicted_students,
            "confidence"       : confidence,
            "topStudents"      : scored[:10],
            "breakdown"        : {
                "eligible"    : len(scored),
                "likelyToJoin": len(likely),
                "unlikely"    : len(unlikely),
            },
        }))
        sys.exit(0)

    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
