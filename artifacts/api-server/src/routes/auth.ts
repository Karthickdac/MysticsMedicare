import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { verifyPassword, issueSessionCookie, clearSessionCookie } from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  issueSessionCookie(res, user.id);
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, staffId: user.staffId ? String(user.staffId) : null });
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

router.get("/auth/me", async (req, res) => {
  const u = req.user;
  if (!u) return res.status(401).json({ error: "Not authenticated" });
  res.json({ id: u.id, email: u.email, name: u.name, role: u.role, staffId: u.staffId ? String(u.staffId) : null });
});

export default router;
