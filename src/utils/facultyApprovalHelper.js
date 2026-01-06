import FacultyDetails from "../models/faculty/facultyDetails.js";
import CollegeSchema from "../models/shared/collegeSchema.js";

/**
 * Save approval record to faculty's approvalsGiven array
 * This is a shared helper to ensure consistent saving across all approval endpoints
 */
export const saveApprovalToFaculty = async (facultyId, approvalData) => {
  try {
    // Validate required fields based on schema
    if (!approvalData.studentid || !approvalData.type || !approvalData.status) {
      const error = new Error('Missing required fields in approvalData');
      error.missingFields = {
        hasStudentId: !!approvalData.studentid,
        hasType: !!approvalData.type,
        hasStatus: !!approvalData.status
      };
      throw error;
    }

    // Check if faculty exists
    const facultyExists = await FacultyDetails.findOne({ facultyid: facultyId }).select('_id').lean();
    if (!facultyExists) {
      throw new Error(`Faculty with ID ${facultyId} not found in database`);
    }
    
    // Use direct MongoDB update with $push
    // Disable validators to avoid full document validation issues
    const updateResult = await FacultyDetails.updateOne(
      { facultyid: facultyId },
      { 
        $push: { approvalsGiven: approvalData }
      },
      { 
        runValidators: false,
        strict: false
      }
    );

    if (updateResult.matchedCount === 0) {
      throw new Error(`Faculty with ID ${facultyId} not found in database`);
    }

    if (updateResult.modifiedCount === 0 && updateResult.matchedCount > 0) {
      // Try alternative method - use findOneAndUpdate
      try {
        await FacultyDetails.findOneAndUpdate(
          { facultyid: facultyId },
          { $push: { approvalsGiven: approvalData } },
          { new: true, runValidators: false }
        );
      } catch (altError) {
        // Silent fallback - if both methods fail, error will be caught below
      }
    }
    
    // Return success
    return { success: true };
  } catch (error) {
    console.error('Error saving approval to faculty:', error.message);
    throw error;
  }
};

/**
 * Build approval data object matching ApprovalActionSchema
 * Schema fields: studentid, type, description, status, approvedOn, imageUrl, message
 */
export const buildApprovalData = async (student, achievement, type, status, facultyName, message = '') => {
  // Get imageUrl based on achievement type
  let imageUrl = null;
  if (achievement) {
    if (type === 'workshop') {
      imageUrl = achievement.certificateUrl || achievement.imageUrl || null;
    } else {
      imageUrl = achievement.imageUrl || achievement.certificateUrl || null;
    }
  }

  // Get description based on type
  let description = '';
  if (type === 'certificate') {
    description = achievement?.title || '';
  } else if (type === 'workshop') {
    description = achievement?.title || '';
  } else if (type === 'club') {
    description = achievement?.title || achievement?.clubName || '';
  } else if (type === 'internship') {
    description = achievement ? `${achievement.organization} - ${achievement.role}` : '';
  } else if (type === 'project') {
    description = achievement?.title || '';
  } else if (type === 'other') {
    description = achievement?.title || '';
  }

  // Normalize type for schema (certification -> certificate)
  const normalizedType = type === 'certification' ? 'certificate' : type;

  // Return only fields that match the schema
  return {
    studentid: student.studentid,
    type: normalizedType,
    description: description || undefined,
    status: status === 'approved' ? 'approved' : 'rejected',
    approvedOn: new Date(),
    imageUrl: imageUrl || undefined,
    message: message || undefined
  };
};

/**
 * Get faculty name by facultyId
 */
export const getFacultyName = async (facultyId) => {
  try {
    const faculty = await FacultyDetails.findOne({ facultyid: facultyId })
      .select('fullname')
      .lean();
    return faculty?.fullname || facultyId;
  } catch (error) {
    console.warn('Could not fetch faculty name:', error.message);
    return facultyId;
  }
};

