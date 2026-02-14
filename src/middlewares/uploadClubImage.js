import cloudinary from "../utils/cloudinary.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "clubs",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    public_id: `club-${Date.now()}-${file.originalname.split(".")[0]}`,
    transformation: [
      {
        width: 800,
        height: 600,
        crop: "limit",
        quality: "auto",
      },
    ],
  }),
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

export default upload;

