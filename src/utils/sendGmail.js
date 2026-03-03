import { transporter } from "./smtpTransporter.js";

/** Only send emails when notifications are enabled (SEND_EMAILS=true or NOTIFICATIONS_ENABLED=true). Default: disabled. */
const isEmailSendingEnabled = () => {
  const v = (process.env.SEND_EMAILS || process.env.NOTIFICATIONS_ENABLED || "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
};

export const sendEmail = async (to, subject, html) => {
  if (!isEmailSendingEnabled()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`📧 Email skipped - notifications disabled (set SEND_EMAILS=true to enable). Would send to: ${to}`);
    }
    return;
  }
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
