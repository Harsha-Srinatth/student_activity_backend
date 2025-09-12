// src/utils/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
dotenv.config();

console.log("Cloud name:", process.env.CLOUDINARY_CLOUD_NAME);
console.log("CLOUDINARY_URL present:", !!process.env.CLOUDINARY_URL);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // should be dqfykfugz
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
export default cloudinary;