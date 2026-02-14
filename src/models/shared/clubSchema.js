import mongoose from "mongoose";

const ClubDetailSchema = new mongoose.Schema({
    collegeId: { type: String, required: true },
    clubDepartment: { type: String, required: true },
    clubId: { type: String, required: true, unique: true },
    clubName: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    members: [{studentid: { type: String, required: true } }],
    amounttojoin: { type: Number, required: true },
    facultyCoordinator: { type: String }, // facultyId of the faculty coordinator
    studentHead: { type: String }, // studentId of the student club head
}, { timestamps: true });

const ClubDetail = mongoose.model("ClubDetails", ClubDetailSchema);
export default ClubDetail;