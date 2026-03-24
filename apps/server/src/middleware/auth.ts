import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth';
import db from '../db';

export interface AuthRequest extends Request {
  currentUser: {
    id: string;
    email: string;
    name: string;
    image: string | null;
    role: string;
    banned: boolean | null;
  };
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      res.status(401).json({ error: 'Unauthorised' });
      return;
    }

    const user = session.user as AuthRequest['currentUser'];

    if (user.banned) {
      res.status(403).json({ error: 'Your account has been disabled.' });
      return;
    }

    // Retroactively promote ADMIN_EMAIL user in case env var was set after their first login
    if (
      process.env.ADMIN_EMAIL &&
      user.email === process.env.ADMIN_EMAIL &&
      user.role !== 'admin'
    ) {
      db.prepare(`UPDATE "user" SET role = 'admin' WHERE id = ?`).run(user.id);
      user.role = 'admin';
    }

    (req as AuthRequest).currentUser = user;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorised' });
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = (req as AuthRequest).currentUser;
  if (user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
}
