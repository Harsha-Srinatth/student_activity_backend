import mongoose from "mongoose";

const CollegeSchema = new mongoose.Schema({
    collegeId: { type: String, required: true, unique: true, index: true },
    collegeName: { type: String, required: true },
    collegeAddress: { type: String, required: true },
    collegeCity: { type: String, required: true },
    collegeState: { type: String, required: true },
    collegeCountry: { type: String, required: true },
    collegeZip: { type: String, required: true },
    collegePhone: { type: String, required: true },
    collegeEmail: { type: String, required: true },
}, 
{ _id: false, timestamps: true }
);

const College = mongoose.model("College", CollegeSchema);
export default College;