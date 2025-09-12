import jwt from "jsonwebtoken";

export const checkauth = (req,res,next) => {
  try{ 
  if(!req.header('Authorization')){
    return res.status(401).json({meassage: " No authorization Header , access denied"});
  }
  const token = req.header('Authorization')?.split(' ')[1];
   if (!token){
    return res.status(401).json({meassage : "No token, authorization denied"});
   }
    const decoded  = jwt.verify(token,process.env.MY_SECRET_KEY);
    console.log("Decoded token:", decoded);   // 🔥 check if studentid is there
    req.user = decoded;
    next();
   }catch(error){
    console.error(error);
    return res.status(401).json({meassage : "Token is not valid"});
   }
};

export const requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  if (req.user.role !== role) return res.status(403).json({ message: "Forbidden" });
  next();
};
