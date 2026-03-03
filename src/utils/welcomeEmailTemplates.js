/**
 * Attractive, role-specific welcome email HTML templates.
 * Each includes name, ID, and a distinct welcome message for the portal.
 */

const baseStyles = `
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #1f2937;
  max-width: 560px;
  margin: 0 auto;
`;

/** Student welcome email – friendly, achievement-focused */
export function getStudentWelcomeEmailHtml(fullname, studentid, programName = "") {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f3f4f6;">
  <div style="${baseStyles} padding:32px 24px;">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius:16px 16px 0 0; padding:28px 24px; text-align:center;">
      <h1 style="margin:0; color:#fff; font-size:24px; font-weight:700;">🎓 College360x</h1>
      <p style="margin:8px 0 0; color:rgba(255,255,255,0.9); font-size:14px;">Your learning journey starts here</p>
    </div>
    <div style="background:#fff; border-radius:0 0 16px 16px; padding:28px 24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
      <h2 style="margin:0 0 16px; font-size:20px; color:#111827;">Welcome, ${escapeHtml(fullname)}!</h2>
      <p style="margin:0 0 20px; font-size:16px; color:#4b5563;">Your <strong>student account</strong> has been created successfully. We're thrilled to have you on board.</p>
      <div style="background:#eff6ff; border-left:4px solid #3b82f6; padding:16px; border-radius:8px; margin:20px 0;">
        <p style="margin:0 0 8px; font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">Your Student ID</p>
        <p style="margin:0; font-size:18px; font-weight:700; color:#1d4ed8;">${escapeHtml(studentid)}</p>
        ${programName ? `<p style="margin:8px 0 0; font-size:14px; color:#4b5563;">Program: ${escapeHtml(programName)}</p>` : ""}
      </div>
      <p style="margin:20px 0 0; font-size:15px; color:#4b5563;">Use this ID to log in, track your progress, submit achievements, and connect with your faculty. If you have any questions, reach out to your mentor or department.</p>
      <p style="margin:24px 0 0; font-size:15px; color:#6b7280;">See you in class! ✨</p>
      <p style="margin:8px 0 0; font-size:14px; color:#9ca3af;">— The College360x Team</p>
    </div>
  </div>
</body>
</html>`;
}

/** Faculty welcome email – professional, mentoring-focused */
export function getFacultyWelcomeEmailHtml(fullname, facultyid, dept = "") {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f3f4f6;">
  <div style="${baseStyles} padding:32px 24px;">
    <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); border-radius:16px 16px 0 0; padding:28px 24px; text-align:center;">
      <h1 style="margin:0; color:#fff; font-size:24px; font-weight:700;">👩‍🏫 College360x Faculty</h1>
      <p style="margin:8px 0 0; color:rgba(255,255,255,0.9); font-size:14px;">Empowering education, one student at a time</p>
    </div>
    <div style="background:#fff; border-radius:0 0 16px 16px; padding:28px 24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
      <h2 style="margin:0 0 16px; font-size:20px; color:#111827;">Welcome, ${escapeHtml(fullname)}!</h2>
      <p style="margin:0 0 20px; font-size:16px; color:#4b5563;">Your <strong>faculty account</strong> is now active. You can manage students, approve submissions, and track progress from your dashboard.</p>
      <div style="background:#ecfdf5; border-left:4px solid #059669; padding:16px; border-radius:8px; margin:20px 0;">
        <p style="margin:0 0 8px; font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">Your Faculty ID</p>
        <p style="margin:0; font-size:18px; font-weight:700; color:#047857;">${escapeHtml(facultyid)}</p>
        ${dept ? `<p style="margin:8px 0 0; font-size:14px; color:#4b5563;">Department: ${escapeHtml(dept)}</p>` : ""}
      </div>
      <p style="margin:20px 0 0; font-size:15px; color:#4b5563;">Log in with your email and password to access approvals, student lists, and leave requests. Thank you for being part of our teaching community.</p>
      <p style="margin:24px 0 0; font-size:15px; color:#6b7280;">Let's make an impact together. 🚀</p>
      <p style="margin:8px 0 0; font-size:14px; color:#9ca3af;">— The College360x Team</p>
    </div>
  </div>
</body>
</html>`;
}

/** HOD welcome email – leadership-focused */
export function getHODWelcomeEmailHtml(fullname, hodId, department = "") {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f3f4f6;">
  <div style="${baseStyles} padding:32px 24px;">
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); border-radius:16px 16px 0 0; padding:28px 24px; text-align:center;">
      <h1 style="margin:0; color:#fff; font-size:24px; font-weight:700;">🏛️ College360x HOD Portal</h1>
      <p style="margin:8px 0 0; color:rgba(255,255,255,0.9); font-size:14px;">Department leadership & oversight</p>
    </div>
    <div style="background:#fff; border-radius:0 0 16px 16px; padding:28px 24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
      <h2 style="margin:0 0 16px; font-size:20px; color:#111827;">Welcome, ${escapeHtml(fullname)}!</h2>
      <p style="margin:0 0 20px; font-size:16px; color:#4b5563;">Your <strong>Head of Department</strong> account is ready. You now have access to faculty assignment, department analytics, and student overview.</p>
      <div style="background:#f5f3ff; border-left:4px solid #7c3aed; padding:16px; border-radius:8px; margin:20px 0;">
        <p style="margin:0 0 8px; font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">Your HOD ID</p>
        <p style="margin:0; font-size:18px; font-weight:700; color:#6d28d9;">${escapeHtml(hodId)}</p>
        ${department ? `<p style="margin:8px 0 0; font-size:14px; color:#4b5563;">Department: ${escapeHtml(department)}</p>` : ""}
      </div>
      <p style="margin:20px 0 0; font-size:15px; color:#4b5563;">Use the dashboard to assign faculty to sections, view performance, and manage announcements. We're glad to have you leading the way.</p>
      <p style="margin:24px 0 0; font-size:15px; color:#6b7280;">Lead with clarity. 📋</p>
      <p style="margin:8px 0 0; font-size:14px; color:#9ca3af;">— The College360x Team</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (str == null || str === "") return "";
  const s = String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
