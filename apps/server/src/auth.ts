import { betterAuth, APIError } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { admin } from 'better-auth/plugins';
import db from './db';

export const auth = betterAuth({
  database: db,
  baseURL: process.env.BASE_URL || 'http://localhost:5173',
  secret: process.env.AUTH_SECRET || 'dev-secret-change-in-production',
  basePath: '/api/auth',
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    admin({
      defaultRole: 'user',
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Check registration toggle (existing users logging in skip this — it only fires on creation)
          const setting = db
            .prepare('SELECT value FROM app_settings WHERE key = ?')
            .get('registration_enabled') as { value: string } | undefined;

          if (setting?.value === 'false') {
            throw new APIError('FORBIDDEN', {
              message: 'Registration is currently disabled.',
            });
          }

          // Check allowlist — only enforced if entries exist
          const allowlistEntries = db
            .prepare('SELECT value, type FROM allowlist')
            .all() as { value: string; type: string }[];

          if (allowlistEntries.length > 0) {
            const domain = user.email.split('@')[1];
            const allowed = allowlistEntries.some((e) =>
              e.type === 'email' ? e.value === user.email : e.value === domain
            );
            if (!allowed) {
              throw new APIError('FORBIDDEN', {
                message: 'Your email is not authorised to register.',
              });
            }
          }

          // Grant admin role if email matches ADMIN_EMAIL env var
          const role =
            process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
              ? 'admin'
              : 'user';

          return { data: { ...user, role } };
        },
      },
    },
  },
});

export type AuthUser = typeof auth.$Infer.Session.user;

// Run Better Auth schema migrations on startup (creates user, session, account, verification tables)
getMigrations(auth.options).then(({ runMigrations }) => runMigrations()).catch((err) => {
  console.error('[Auth] Migration failed:', err);
});
