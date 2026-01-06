import mongoose from "mongoose";

const ClubDetailSchema = new mongoose.Schema({
    collegeId: { type: String, required: true },
    clubId: { type: String, required: true },
    clubName: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    members: [{studentid: { type: String, required: true } }],
    amounttojoin: { type: Number, required: true },
}, { _id: false, timestamps: true });

const ClubDetail = mongoose.model("ClubDetails", ClubDetailSchema);
export default ClubDetail;