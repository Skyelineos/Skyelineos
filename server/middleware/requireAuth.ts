import { Request, Response, NextFunction } from "express";
import { auth as adminAuth } from "../firebaseAdmin";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    (req as any).user = decoded; // uid, email, custom claims
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}