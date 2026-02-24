import mongoose from "mongoose";
import { v4 as uuidv4 } from 'uuid';

const GroupSchema = new mongoose.Schema({
    collegeId: { type: String, required: true },
    groupId: { type: String, required: true, unique: true, default: uuidv4() },
    studentId: { type: String, required: true, index: true },
    groupName: { type: String, required: true },
    groupTopic: { type: String, required: true },
    groupDuration: { type: Number, required: true },
    groupStatus: { type: String, required: true, enum: ["on-going", "completed"], default: "on-going" },
    groupMembers: [{ studentId: { type: String, required: true } }],
    createdAt: { type: Date, default: Date.now},
}, { timestamps: true });

const Group = mongoose.model("Group", GroupSchema);
export default Group;