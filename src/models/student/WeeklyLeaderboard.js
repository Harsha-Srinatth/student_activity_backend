import mongoose from "mongoose";

/** Snapshot of one student in the weekly top 30 */
const WeeklyLeaderboardStudentSchema = new mongoose.Schema(
  {
    studentid: { type: String, required: true },
    fullname: { type: String, required: true },
    programName: { type: String, default: "" },
    image: {
      url: { type: String, default: "" },
    },
    teachingPoints: { type: Number, default: 0 },
    projectsPoints: { type: Number, default: 0 },
    problemSolvingRank: { type: Number, default: 0 },
    extraCurricularPoints: { type: Number, default: 0 },
    coCurricularPoints: { type: Number, default: 0 },
    weightedPoints: { type: Number, default: 0 },
  },
  { _id: false }
);

const WeeklyLeaderboardSchema = new mongoose.Schema(
  {
    collegeId: { type: String, required: true, index: true },
    year: { type: Number, required: true },
    weekNumber: { type: Number, required: true },
    students: {
      type: [WeeklyLeaderboardStudentSchema],
      default: [],
      validate: [arr => arr.length <= 30, "At most 30 students per snapshot"],
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

WeeklyLeaderboardSchema.index({ collegeId: 1, year: 1, weekNumber: 1 }, { unique: true });

const WeeklyLeaderboard =
  mongoose.models.WeeklyLeaderboard || mongoose.model("WeeklyLeaderboard", WeeklyLeaderboardSchema);

export default WeeklyLeaderboard;
