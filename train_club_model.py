# """
# Train the club joiner prediction model.
# Generates 50,000 synthetic records using the user's exact probability logic,
# trains a LogisticRegression pipeline (with LabelEncoder for dept),
# and saves the model as club_prediction_model.pkl.

# Run once:  python train_club_model.py
# """

# import pandas as pd
# import numpy as np
# import random
# import pickle
# from sklearn.linear_model import LogisticRegression
# from sklearn.preprocessing import StandardScaler
# from sklearn.pipeline import Pipeline

# random.seed(42)
# np.random.seed(42)

# # ── 1. Generate training data ────────────────────────────────────────────────
# RECORDS = 50000
# DEPTS   = ["CSE", "ECE", "MECH", "CIVIL", "IT"]
# DEPT_MAP = {d: i for i, d in enumerate(DEPTS)}

# data = []
# for _ in range(RECORDS):
#     cgpa           = round(random.uniform(5.5, 10), 2)
#     projects       = random.randint(0, 6)
#     workshops      = random.randint(0, 10)
#     certifications = random.randint(0, 8)
#     internships    = random.randint(0, 3)
#     coPoints       = random.randint(0, 100)
#     extraPoints    = random.randint(0, 100)
#     rank           = random.randint(0, 500)
#     semester       = random.randint(1, 8)
#     dept           = random.choice(DEPTS)

#     score = (
#         cgpa * 2 +
#         projects * 3 +
#         workshops * 1.5 +
#         certifications * 2 +
#         internships * 4 +
#         coPoints * 0.05 +
#         extraPoints * 0.05
#     )
#     prob   = 1 / (1 + np.exp(-score / 10))
#     joined = 1 if random.random() < prob else 0

#     data.append([
#         cgpa, projects, workshops, certifications, internships,
#         coPoints, extraPoints, rank, semester,
#         DEPT_MAP[dept],   # encode dept as int, same as club_predict.py
#         joined,
#     ])

# columns = [
#     "cgpa", "projects", "workshops", "certifications", "internships",
#     "coPoints", "extraPoints", "rank", "semester", "dept_encoded", "joined",
# ]
# df = pd.DataFrame(data, columns=columns)
# print(f"Dataset: {len(df)} rows  |  joined=1: {df.joined.sum()}  joined=0: {(df.joined==0).sum()}")

# # ── 2. Train ─────────────────────────────────────────────────────────────────
# FEATURE_COLS = [
#     "cgpa", "projects", "workshops", "certifications", "internships",
#     "coPoints", "extraPoints", "rank", "semester", "dept_encoded",
# ]
# X = df[FEATURE_COLS].values
# y = df["joined"].values

# pipeline = Pipeline([
#     ("scaler", StandardScaler()),
#     ("lr",     LogisticRegression(max_iter=500, random_state=42)),
# ])
# pipeline.fit(X, y)

# # Quick accuracy check
# preds    = pipeline.predict(X)
# accuracy = (preds == y).mean()
# print(f"Training accuracy: {accuracy:.4f}")

# # ── 3. Save ───────────────────────────────────────────────────────────────────
# with open("club_prediction_model.pkl", "wb") as f:
#     pickle.dump(pipeline, f)

# print("Saved: club_prediction_model.pkl")
