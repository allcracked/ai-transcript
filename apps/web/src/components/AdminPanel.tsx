import { useEffect, useState, useCallback } from 'react';
import { Trash2, ShieldCheck, ShieldOff, UserCheck, UserX, Plus, X } from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

// ── Analytics types ───────────────────────────────────────────────────────────

interface AnalyticsData {
  overview: {
    total_transcripts: number;
    total_batches: number;
    total_users: number;
    done_count: number;
    error_count: number;
    this_week: number;
    last_week: number;
  };
  activityByDay: { date: string; count: number }[];
  perUser: {
    id: string;
    name: string;
    email: string;
    transcripts: number;
    batches: number;
    errors: number;
    last_active: string | null;
  }[];
  performance: {
    mode: string;
    model: string;
    avg_transcription_ms: number;
    avg_brief_ms: number | null;
    count: number;
  }[];
  aiAdoption: { total: number; briefs: number; rubrics: number };
  errors: { error_message: string; mode: string; count: number }[];
}

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

// ── Analytics helpers ─────────────────────────────────────────────────────────

function fmtMs(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fillDays(data: { date: string; count: number }[]): { date: string; count: number }[] {
  const map = Object.fromEntries(data.map((d) => [d.date, d.count]));
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const key = d.toISOString().split('T')[0];
    return { date: key, count: map[key] ?? 0 };
  });
}

// ── Analytics tab ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-1">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold text-zinc-100">{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function ActivityChart({ data }: { data: { date: string; count: number }[] }) {
  const filled = fillDays(data);
  const max = Math.max(...filled.map((d) => d.count), 1);
  return (
    <div>
      <div className="flex items-end gap-px h-20">
        {filled.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.count} upload${d.count !== 1 ? 's' : ''}`}
            style={{ height: d.count > 0 ? `${Math.max((d.count / max) * 100, 8)}%` : '2px' }}
            className={cn(
              'flex-1 rounded-sm transition-opacity hover:opacity-100',
              d.count > 0 ? 'bg-blue-500 opacity-75' : 'bg-zinc-800'
            )}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-xs text-zinc-600">{filled[0]?.date}</span>
        <span className="text-xs text-zinc-600">today</span>
      </div>
    </div>
  );
}

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AnalyticsData>('/analytics')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-8 text-center text-zinc-500 text-sm">Loading…</div>;
  if (error || !data) return <div className="py-4 text-sm text-red-400">{error ?? 'No data'}</div>;

  const { overview, activityByDay, perUser, performance, aiAdoption, errors } = data;
  const successRate = overview.total_transcripts > 0
    ? Math.round((overview.done_count / overview.total_transcripts) * 100)
    : 0;
  const weekDelta = overview.last_week > 0
    ? Math.round(((overview.this_week - overview.last_week) / overview.last_week) * 100)
    : null;

  return (
    <div className="space-y-6">

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total uploads" value={overview.total_transcripts} sub={`${overview.total_batches} batch${overview.total_batches !== 1 ? 'es' : ''}`} />
        <KpiCard label="Users" value={overview.total_users} />
        <KpiCard label="Success rate" value={`${successRate}%`} sub={`${overview.error_count} error${overview.error_count !== 1 ? 's' : ''}`} />
        <KpiCard
          label="This week"
          value={overview.this_week}
          sub={weekDelta != null ? `${weekDelta >= 0 ? '+' : ''}${weekDelta}% vs last week` : 'vs last week: no data'}
        />
      </div>

      {/* Activity chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
        <h3 className="text-sm font-medium text-zinc-100">Uploads — last 30 days</h3>
        <ActivityChart data={activityByDay} />
      </div>

      {/* Per-user + Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Per-user table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h3 className="text-sm font-medium text-zinc-100">Per user</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left pb-2 font-medium">User</th>
                  <th className="text-right pb-2 font-medium">Uploads</th>
                  <th className="text-right pb-2 font-medium">Batches</th>
                  <th className="text-right pb-2 font-medium">Errors</th>
                  <th className="text-right pb-2 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {perUser.map((u) => (
                  <tr key={u.id} className="text-zinc-300">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-zinc-100 truncate max-w-[120px]">{u.name}</p>
                      <p className="text-zinc-600 truncate max-w-[120px]">{u.email}</p>
                    </td>
                    <td className="py-2 text-right">{u.transcripts}</td>
                    <td className="py-2 text-right">{u.batches}</td>
                    <td className={cn('py-2 text-right', u.errors > 0 && 'text-red-400')}>{u.errors}</td>
                    <td className="py-2 text-right text-zinc-500">{fmtDate(u.last_active)}</td>
                  </tr>
                ))}
                {perUser.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-zinc-600 italic">No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Processing performance */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h3 className="text-sm font-medium text-zinc-100">Processing performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left pb-2 font-medium">Mode / model</th>
                  <th className="text-right pb-2 font-medium">Jobs</th>
                  <th className="text-right pb-2 font-medium">Avg transcription</th>
                  <th className="text-right pb-2 font-medium">Avg brief</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {performance.map((p, i) => (
                  <tr key={i} className="text-zinc-300">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-zinc-100">{p.mode}</p>
                      <p className="text-zinc-600 truncate max-w-[120px]">{p.model}</p>
                    </td>
                    <td className="py-2 text-right">{p.count}</td>
                    <td className="py-2 text-right">{fmtMs(p.avg_transcription_ms)}</td>
                    <td className="py-2 text-right">{fmtMs(p.avg_brief_ms)}</td>
                  </tr>
                ))}
                {performance.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-center text-zinc-600 italic">No completed jobs yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* AI adoption + Errors row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* AI feature adoption */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <h3 className="text-sm font-medium text-zinc-100">AI feature adoption</h3>
          {aiAdoption.total === 0 ? (
            <p className="text-xs text-zinc-600 italic">No completed transcripts yet</p>
          ) : (
            <div className="space-y-3">
              {[
                { label: 'AI Brief generated', value: aiAdoption.briefs },
                { label: 'Rubric evaluated', value: aiAdoption.rubrics },
              ].map(({ label, value }) => {
                const pct = Math.round((value / aiAdoption.total) * 100);
                return (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">{label}</span>
                      <span className="text-zinc-300">{value} <span className="text-zinc-600">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-zinc-600">{aiAdoption.total} completed transcript{aiAdoption.total !== 1 ? 's' : ''} total</p>
            </div>
          )}
        </div>

        {/* Top errors */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h3 className="text-sm font-medium text-zinc-100">Top errors</h3>
          {errors.length === 0 ? (
            <p className="text-xs text-zinc-600 italic">No errors recorded</p>
          ) : (
            <div className="space-y-2">
              {errors.map((e, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="text-zinc-300 truncate" title={e.error_message}>{e.error_message}</p>
                    <p className="text-zinc-600">{e.mode}</p>
                  </div>
                  <span className="flex-shrink-0 rounded-md bg-red-950 text-red-400 px-2 py-0.5 font-medium">{e.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────

type AdminTab = 'users' | 'settings' | 'analytics';

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
        {(['users', 'analytics', 'settings'] as AdminTab[]).map((t) => (
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
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
