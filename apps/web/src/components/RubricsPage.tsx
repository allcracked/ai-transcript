import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { api, Rubric } from '../lib/api';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface RubricFormValues {
  name: string;
  description: string;
  prompt: string;
}

const EMPTY_FORM: RubricFormValues = { name: '', description: '', prompt: '' };

function RubricForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: RubricFormValues;
  onSave: (values: RubricFormValues) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [values, setValues] = useState(initial);
  const set = (k: keyof RubricFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Name</label>
        <input
          value={values.name}
          onChange={set('name')}
          placeholder="e.g. Sales Quality Review"
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Description <span className="text-zinc-600">(optional)</span></label>
        <input
          value={values.description}
          onChange={set('description')}
          placeholder="Short description of what this rubric evaluates"
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Prompt</label>
        <textarea
          value={values.prompt}
          onChange={set('prompt')}
          rows={6}
          placeholder="Write your analysis prompt here. The full transcript will be appended automatically."
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-y font-mono"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-3.5 w-3.5 mr-1.5" />
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(values)} disabled={saving || !values.name.trim() || !values.prompt.trim()}>
          {saving ? (
            <svg className="h-3.5 w-3.5 mr-1.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <Check className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}

export function RubricsPage() {
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api.getRubrics()
      .then(setRubrics)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load rubrics'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (values: RubricFormValues) => {
    setSaving(true);
    try {
      const rubric = await api.createRubric(values);
      setRubrics((prev) => [rubric, ...prev]);
      setShowCreate(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create rubric');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, values: RubricFormValues) => {
    setSaving(true);
    try {
      const rubric = await api.updateRubric(id, values);
      setRubrics((prev) => prev.map((r) => (r.id === id ? rubric : r)));
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update rubric');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rubric: Rubric) => {
    if (!confirm(`Delete rubric "${rubric.name}"? This cannot be undone.`)) return;
    setDeletingId(rubric.id);
    try {
      await api.deleteRubric(rubric.id);
      setRubrics((prev) => prev.filter((r) => r.id !== rubric.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete rubric');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <svg className="h-8 w-8 animate-spin text-zinc-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Rubrics</h2>
          <p className="text-sm text-zinc-400 mt-1">Custom analysis prompts applied to call transcripts.</p>
        </div>
        <Button size="sm" onClick={() => { setShowCreate(true); setEditingId(null); }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Rubric
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {showCreate && (
        <div className="rounded-xl border border-blue-500/30 bg-zinc-900 p-4 space-y-3">
          <p className="text-sm font-medium text-zinc-100">New Rubric</p>
          <RubricForm
            initial={EMPTY_FORM}
            onSave={handleCreate}
            onCancel={() => setShowCreate(false)}
            saving={saving}
          />
        </div>
      )}

      {rubrics.length === 0 && !showCreate ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 px-6 py-16 text-center">
          <p className="text-zinc-400 font-medium">No rubrics yet</p>
          <p className="text-sm text-zinc-600 mt-1">Create a rubric to start analysing transcripts.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rubrics.map((rubric) => (
            <div key={rubric.id} className="rounded-xl border border-zinc-800 bg-zinc-900">
              {editingId === rubric.id ? (
                <div className="p-4 space-y-3">
                  <p className="text-sm font-medium text-zinc-100">Edit Rubric</p>
                  <RubricForm
                    initial={{ name: rubric.name, description: rubric.description ?? '', prompt: rubric.prompt }}
                    onSave={(v) => handleUpdate(rubric.id, v)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-100">{rubric.name}</p>
                      {rubric.description && (
                        <p className="text-sm text-zinc-500 mt-0.5">{rubric.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setExpandedId(expandedId === rubric.id ? null : rubric.id)}
                        className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                        title={expandedId === rubric.id ? 'Hide prompt' : 'Show prompt'}
                      >
                        {expandedId === rubric.id
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => { setEditingId(rubric.id); setShowCreate(false); }}
                        className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rubric)}
                        disabled={deletingId === rubric.id}
                        className={cn(
                          'rounded-md p-1.5 transition-colors',
                          deletingId === rubric.id
                            ? 'text-zinc-600'
                            : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
                        )}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {expandedId === rubric.id && (
                    <pre className="mt-3 rounded-md bg-zinc-800 px-3 py-2.5 text-xs text-zinc-300 whitespace-pre-wrap font-mono border border-zinc-700">
                      {rubric.prompt}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
