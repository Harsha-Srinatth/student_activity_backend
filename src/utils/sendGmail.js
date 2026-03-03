import { transporter } from "./smtpTransporter.js";

/** Send emails when SMTP is configured. Set SEND_EMAILS=false to disable (e.g. when notifications are off). */
const isEmailSendingEnabled = () => {
  const v = (process.env.SEND_EMAILS || process.env.NOTIFICATIONS_ENABLED || "").toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  return true;
};

export const sendEmail = async (to, subject, html) => {
  if (!isEmailSendingEnabled()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`📧 Email skipped - SEND_EMAILS is disabled. Would send to: ${to}`);
    }
    return;
  }
  if (!transporter) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`⚠️  Email skipped - set EMAIL_USER and EMAIL_PASS in .env to send welcome emails. Would send to: ${to}`);
    }
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
