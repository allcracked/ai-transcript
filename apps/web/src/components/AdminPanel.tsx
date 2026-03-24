import { useEffect, useState, useCallback } from 'react';
import { Trash2, ShieldCheck, ShieldOff, UserCheck, UserX, Plus, X } from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
}

interface AllowlistEntry {
  id: string;
  value: string;
  type: 'email' | 'domain';
  created_at: string;
}

interface Settings {
  registration_enabled: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AdminUser[]>('/users');
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setRole = async (userId: string, role: string) => {
    await apiFetch(`/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
    load();
  };

  const setBan = async (userId: string, banned: boolean) => {
    await apiFetch(`/users/${userId}/ban`, { method: 'PATCH', body: JSON.stringify({ banned }) });
    load();
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Delete this user? Their transcripts will remain but they will lose access.')) return;
    await apiFetch(`/users/${userId}`, { method: 'DELETE' });
    load();
  };

  if (loading) return <div className="py-8 text-center text-zinc-500 text-sm">Loading…</div>;
  if (error) return <div className="py-4 text-sm text-red-400">{error}</div>;

  return (
    <div className="space-y-3">
      {users.map((user) => {
        const isSelf = user.id === currentUserId;
        return (
          <div
            key={user.id}
            className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
          >
            {/* Avatar */}
            {user.image ? (
              <img src={user.image} alt="" className="h-9 w-9 rounded-full flex-shrink-0" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-zinc-700 flex-shrink-0 flex items-center justify-center text-xs text-zinc-400 font-medium">
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-zinc-100 truncate">{user.name}</span>
                {isSelf && <span className="text-xs text-zinc-500">(you)</span>}
                <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                  {user.role}
                </Badge>
                {user.banned && (
                  <Badge variant="destructive">banned</Badge>
                )}
              </div>
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>

            {/* Actions — disabled for self to prevent accidental lockout */}
            {!isSelf && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {user.role === 'admin' ? (
                  <button
                    onClick={() => setRole(user.id, 'user')}
                    title="Remove admin"
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                  >
                    <ShieldOff className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => setRole(user.id, 'admin')}
                    title="Make admin"
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                  >
                    <ShieldCheck className="h-4 w-4" />
                  </button>
                )}

                {user.banned ? (
                  <button
                    onClick={() => setBan(user.id, false)}
                    title="Unban user"
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-green-400 transition-colors"
                  >
                    <UserCheck className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => setBan(user.id, true)}
                    title="Ban user"
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-yellow-400 transition-colors"
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                )}

                <button
                  onClick={() => deleteUser(user.id)}
                  title="Delete user"
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [newValue, setNewValue] = useState('');
  const [newType, setNewType] = useState<'email' | 'domain'>('email');
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([
      apiFetch<Settings>('/settings'),
      apiFetch<AllowlistEntry[]>('/allowlist'),
    ]);
    setSettings(s);
    setAllowlist(a);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleRegistration = async () => {
    if (!settings) return;
    setSaving(true);
    const next = settings.registration_enabled === 'true' ? false : true;
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ registration_enabled: next }) });
    setSettings({ ...settings, registration_enabled: next ? 'true' : 'false' });
    setSaving(false);
  };

  const addEntry = async () => {
    setAddError(null);
    const v = newValue.trim().toLowerCase();
    if (!v) return;
    try {
      const entry = await apiFetch<AllowlistEntry>('/allowlist', {
        method: 'POST',
        body: JSON.stringify({ value: v, type: newType }),
      });
      setAllowlist((prev) => [...prev, entry]);
      setNewValue('');
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add entry');
    }
  };

  const removeEntry = async (id: string) => {
    await apiFetch(`/allowlist/${id}`, { method: 'DELETE' });
    setAllowlist((prev) => prev.filter((e) => e.id !== id));
  };

  if (!settings) return <div className="py-8 text-center text-zinc-500 text-sm">Loading…</div>;

  const registrationEnabled = settings.registration_enabled === 'true';

  return (
    <div className="space-y-8">
      {/* Registration toggle */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-100">Open Registration</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Allow new users to sign up. Existing users can always log in.
            </p>
          </div>
          <button
            onClick={toggleRegistration}
            disabled={saving}
            className={cn(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
              registrationEnabled ? 'bg-blue-600' : 'bg-zinc-700',
              saving && 'opacity-50'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200',
                registrationEnabled ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>
      </div>

      {/* Allowlist */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-100">Email Allowlist</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            If empty, anyone with a Google account can register. Add entries to restrict access.
          </p>
        </div>

        {/* Add form */}
        <div className="flex gap-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as 'email' | 'domain')}
            className="flex h-9 rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="email">Email</option>
            <option value="domain">Domain</option>
          </select>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addEntry()}
            placeholder={newType === 'email' ? 'user@example.com' : 'example.com'}
            className="flex-1 h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Button size="sm" onClick={addEntry}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {addError && (
          <p className="text-xs text-red-400">{addError}</p>
        )}

        {/* Entries */}
        {allowlist.length === 0 ? (
          <p className="text-xs text-zinc-600 italic">No entries — all Google accounts can register.</p>
        ) : (
          <div className="space-y-2">
            {allowlist.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {entry.type}
                  </Badge>
                  <span className="text-sm font-mono text-zinc-300">{entry.value}</span>
                </div>
                <button
                  onClick={() => removeEntry(entry.id)}
                  className="rounded p-1 text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────

type AdminTab = 'users' | 'settings';

export function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>('users');
  const { data: session } = authClient.useSession();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Admin</h2>
        <p className="text-sm text-zinc-400 mt-1">Manage users and application settings.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1 w-fit">
        {(['users', 'settings'] as AdminTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors capitalize',
              tab === t ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab currentUserId={session?.user.id ?? ''} />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
