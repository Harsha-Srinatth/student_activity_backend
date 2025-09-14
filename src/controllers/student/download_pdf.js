import PDFDocument from "pdfkit";
import StudentDetails from "../../models/studentDetails.js";

export const generateStudentPortfolioPDF = async (req, res) => {
  try {
    const { studentid } = req.params;
    const student = await StudentDetails.findOne({ studentid });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    const filename = `${student.fullname.replace(" ", "_")}_Portfolio.pdf`;

    // Handle errors from pdfkit
    doc.on("error", (err) => {
      console.error("PDF generation error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Error generating PDF" });
      } else {
        res.end(); // just end the stream if headers are already sent
      }
    });

    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.setHeader("Content-Type", "application/pdf");

    doc.pipe(res);

    // ---- PDF Content ----
    doc.fontSize(20).text(student.fullname, { align: "center" });
    doc.fontSize(12).text(`${student.programName}, ${student.dept}`, { align: "center" });
    doc.moveDown();

    doc.fontSize(10).text(`Email: ${student.email} | Phone: ${student.mobileno}`);
    if (student.image?.url) {
      doc.image(student.image.url, 450, 50, { width: 80, height: 80 });
    }
    doc.moveDown();

    doc.fontSize(14).text("Certifications", { underline: true });
    student.certifications.forEach((cert) => {
      doc.fontSize(10).text(`- ${cert.title} (${cert.issuer}, ${new Date(cert.dateIssued).getFullYear()})`);
    });
    doc.moveDown();

    doc.fontSize(14).text("Workshops", { underline: true });
    student.workshops.forEach((w) => {
      doc.fontSize(10).text(`- ${w.title} (${w.organizer}, ${new Date(w.date).toDateString()})`);
    });
    doc.moveDown();

    doc.fontSize(14).text("Internships", { underline: true });
    student.internships.forEach((i) => {
      doc.fontSize(10).text(
        `- ${i.role} at ${i.organization} (${new Date(i.startDate).getFullYear()} - ${i.endDate ? new Date(i.endDate).getFullYear() : "Present"})`
      );
    });
    doc.moveDown();

    doc.fontSize(14).text("Projects", { underline: true });
    student.projects.forEach((p) => {
      doc.fontSize(10).text(`- ${p.title}: ${p.description}`);
    });

    doc.moveDown();
    doc.fontSize(8).text(`Generated on ${new Date().toDateString()}`, { align: "center" });

    // Finalize
    doc.end();
  } catch (err) {
    // Handle synchronous errors before PDF starts streaming
    if (!res.headersSent) {
      res.status(500).json({ message: "Error generating PDF", error: err.message });
    } else {
      console.error("Streaming error after headers sent:", err);
      res.end();
    }
  }
};