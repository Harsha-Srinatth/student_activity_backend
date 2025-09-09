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
    req.user = decoded;
    next();
   }catch(error){
    console.error(error);
    return res.status(401).json({meassage : "Token is not valid"});
   }
};