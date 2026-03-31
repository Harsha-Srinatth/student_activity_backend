"""
Placement prediction script.
Reads student feature JSON from stdin, loads placement_model.pkl,
runs prediction, and writes result JSON to stdout.

Training columns (in order):
  cgpa, project_score, sports_score, internships, certifications,
  workshops, clubs, problemSolvingRank, extraPoints, coPoints, attendance
Target: tier  (1 = Top MNCs, 2 = Product, 3 = Startup/Service)
"""

import sys
import json
import pickle
import os
import warnings
warnings.filterwarnings("ignore")

def main():
    try:
        raw = sys.stdin.read().strip()
        if not raw:
            raise ValueError("No input received from stdin")

        data = json.loads(raw)

        # Feature vector — order must match training columns exactly:
        # cgpa, teachingPoints, projectsPoints, problemSolvingRank,
        # extraCurricularPoints, coCurricularPoints, certifications,
        # internships, attendance
        features = [[
            float(data.get("cgpa", 0)),
            float(data.get("teachingPoints", 0)),
            float(data.get("projectsPoints", 0)),
            float(data.get("problemSolvingRank", 0)),
            float(data.get("extraCurricularPoints", 0)),
            float(data.get("coCurricularPoints", 0)),
            float(data.get("certifications", 0)),
            float(data.get("internships", 0)),
            float(data.get("attendance", 0)),
        ]]

        model_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "placement_model.pkl"
        )

        with open(model_path, "rb") as f:
            model = pickle.load(f)

        raw_class = int(model.predict(features)[0])

        # Model classes are 0-indexed: 0=Tier1(Top MNCs), 1=Tier2(Product), 2=Tier3(Startup)
        # Map to human-friendly tier number
        tier = raw_class + 1   # 1, 2, or 3

        # Tier probabilities (percentage), keyed by human tier number
        probs = {"1": 0.0, "2": 0.0, "3": 0.0}
        if hasattr(model, "predict_proba"):
            probas = model.predict_proba(features)[0]
            classes = list(model.classes_)
            for i, cls in enumerate(classes):
                human_tier = str(int(cls) + 1)   # shift 0→1, 1→2, 2→3
                probs[human_tier] = round(float(probas[i]) * 100, 1)
        else:
            probs[str(tier)] = 100.0

        t1 = probs.get("1", 0)
        t2 = probs.get("2", 0)
        t3 = probs.get("3", 0)

        # Feedback matching the user's logic
        if tier == 1:
            title   = "Tier 1 — Top MNCs"
            message = (
                f"You are highly competitive for Top MNCs ({t1:.1f}%). "
                "You are also eligible for Tier 2 and Tier 3 companies."
            )
            improve = (
                "Maintain your CGPA and keep sharpening problem-solving "
                "skills to stay at the top."
            )
            color = "emerald"

        elif tier == 2:
            title   = "Tier 2 — Product Companies"
            message = (
                f"Strong chances for Product-based companies ({t2:.1f}%). "
                "You are also eligible for Tier 3 companies."
            )
            improve = (
                "Improve your project score and competitive programming rank "
                "to qualify for Tier 1 companies."
            )
            color = "blue"

        else:
            title   = "Tier 3 — Startup / Service Companies"
            message = (
                f"Best chances for Startup and Service-based companies ({t3:.1f}%)."
            )
            improve = (
                "Improve CGPA, add more projects, and raise your coding rank "
                "to move to higher tiers."
            )
            color = "amber"

        result = {
            "tier": tier,
            "probabilities": probs,
            "title": title,
            "message": message,
            "improve": improve,
            "color": color,
        }

        print(json.dumps(result))
        sys.exit(0)

    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
