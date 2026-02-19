import mongoose from "mongoose";

// Reply Schema
const ReplySchema = new mongoose.Schema(
  {
    doubtId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doubt",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 2000,
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
      index: true,
    },
    createdByRole: {
      type: String,
      enum: ["student", "faculty", "hod"],
      default: "student",
    },
    collegeId: {
      type: String,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      // TTL: auto-delete replies after 3 days (259200 seconds)
      expires: 259200,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
ReplySchema.index({ doubtId: 1, createdAt: 1 });

// Doubt Schema
const DoubtSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 5000,
      trim: true,
    },
    tag: {
      type: String,
      required: true,
      enum: [
        "general",
        "academics",
        "placements",
        "exams",
        "events",
        "hostel",
        "library",
        "sports",
        "technical",
        "other",
      ],
      default: "general",
    },
    collegeId: {
      type: String,
      required: true,
      index: true,
    },
    createdBy: {
      type: String,
      required: true,
      index: true,
    },
    replyCount: {
      type: Number,
      default: 0,
    },
    isSolved: {
      type: Boolean,
      default: false,
    },
    solvedAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      // TTL: auto-delete doubts after 3 days (259200 seconds)
      expires: 259200,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
DoubtSchema.index({ collegeId: 1, createdAt: -1 });
DoubtSchema.index({ createdBy: 1, createdAt: -1 });
DoubtSchema.index({ collegeId: 1, createdBy: 1, createdAt: -1 });

export const Doubt = mongoose.model("Doubt", DoubtSchema);
export const Reply = mongoose.model("Reply", ReplySchema);
