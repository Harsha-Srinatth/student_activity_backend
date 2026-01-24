import { generateOtp, saveOtp, verifyOtp } from "../utils/otpHelper.js";

// Send OTP to mobile number
export const sendOtp = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ message: "Mobile number is required" });
    }

    // Generate OTP
    const otp = generateOtp();

    // Save OTP to Redis
    await saveOtp(mobile, otp);

    // In production, you would send this OTP via SMS service (Twilio, AWS SNS, etc.)
    // For now, we'll log it (remove in production)
    console.log(`OTP for ${mobile}: ${otp}`);

    res.json({
      success: true,
      message: "OTP sent successfully",
      // Remove this in production - only for development
      otp: process.env.NODE_ENV === "development" ? otp : undefined
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ message: "Failed to send OTP", error: error.message });
  }
};

// Verify OTP
export const verifyOtpController = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ message: "Mobile number and OTP are required" });
    }

    // Verify OTP
    const isValid = await verifyOtp(mobile, otp);

    if (!isValid) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    res.json({
      success: true,
      message: "OTP verified successfully"
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "Failed to verify OTP", error: error.message });
  }
};

