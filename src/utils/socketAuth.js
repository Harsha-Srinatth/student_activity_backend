import jwt from "jsonwebtoken";

/**
 * Authenticate socket connection using JWT token
 * @param {string} token - JWT token from handshake
 * @returns {Object|null} - Decoded user data or null if invalid
 */
export const authenticateSocket = (token) => {
  try {
    if (!token) {
      return null;
    }
    
    // Remove 'Bearer ' prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;
    
    const decoded = jwt.verify(cleanToken, process.env.MY_SECRET_KEY);
    return decoded;
  } catch (error) {
    console.error("Socket authentication error:", error.message);
    return null;
  }
};

