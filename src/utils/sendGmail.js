import { transporter } from "./smtpTransporter.js";

export const sendEmail = async (to, subject, html) => {
  // Check if transporter is available (credentials configured)
  if (!transporter) {
    console.warn(`⚠️  Email sending skipped - SMTP not configured. Would send to: ${to}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"College Activity" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent successfully to: ${to}`);
  } catch (error) {
    // Log error but don't throw - email failure shouldn't break registration
    console.error("Email sending error:", error);
    throw error; // Re-throw so caller can handle if needed
  }
};
