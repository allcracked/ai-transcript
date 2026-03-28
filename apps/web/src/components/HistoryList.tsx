import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, Eye, RotateCcw, Trash2, FileAudio, Layers,
  Search, X, SlidersHorizontal,
} from 'lucide-react';
import { api, HistoryItem, HistoryParams } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

const PAGE_SIZE = 40;

interface HistoryListProps {
  onView?: (id: string) => void;
  onReprocess: (id: string) => void;
  refreshTrigger?: number;
}

interface Filters {
  search: string;
  status: string;
  type: string;
  dateFrom: string;
  dateTo: string;
  uploader: string;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  status: '',
  type: '',
  dateFrom: '',
  dateTo: '',
  uploader: '',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function statusVariant(status: string): 'secondary' | 'default' | 'success' | 'destructive' {
  if (status === 'pending')    return 'secondary';
  if (status === 'processing') return 'default';
  if (status === 'done')       return 'success';
  return 'destructive';
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemStart  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays   = Math.round((todayStart.getTime() - itemStart.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function groupByDate(items: HistoryItem[]): { label: string; items: HistoryItem[] }[] {
  const groups: { label: string; items: HistoryItem[] }[] = [];
  const seen = new Map<string, number>();
  for (const item of items) {
    const label = getDateLabel(item.createdAt);
    if (!seen.has(label)) {
      seen.set(label, groups.length);
      groups.push({ label, items: [] });
    }
    groups[seen.get(label)!].items.push(item);
  }
  return groups;
}

const Spinner = ({ className }: { className?: string }) => (
  <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// ── Sub-components ─────────────────────────────────────────────────────────

const SELECT_CLS =
  'h-8 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 text-xs text-zinc-100 ' +
  'focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-zinc-950';

const DATE_CLS =
  'h-8 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 text-xs text-zinc-100 ' +
  'focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-zinc-950 ' +
  '[color-scheme:dark]';

// ── Main Component ─────────────────────────────────────────────────────────

export function HistoryList({ onView, onReprocess, refreshTrigger }: HistoryListProps) {
  const navigate = useNavigate();

  const [items, setItems]           = useState<HistoryItem[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [filters, setFilters]               = useState<Filters>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch]     = useState('');
  const [debouncedUploader, setDebouncedUploader] = useState('');
  const [filtersOpen, setFiltersOpen]       = useState(false);

  // Debounce text inputs
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUploader(filters.uploader), 300);
    return () => clearTimeout(t);
  }, [filters.uploader]);

  // Build params helper (reads current state at call time)
  const buildParams = (offset: number): HistoryParams => ({
    limit:    PAGE_SIZE,
    offset,
    status:   filters.status   || undefined,
    type:     (filters.type    || undefined) as HistoryParams['type'],
    search:   debouncedSearch  || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo:   filters.dateTo   || undefined,
    uploader: debouncedUploader || undefined,
  });

  // Fetch first page whenever any active filter changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    setTotal(0);

    api.getHistory(buildParams(0))
      .then(({ items: page, total: t }) => {
        if (!cancelled) { setItems(page); setTotal(t); }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.type, debouncedSearch, filters.dateFrom, filters.dateTo, debouncedUploader, refreshTrigger, refreshKey]);

  const handleLoadMore = () => {
    setLoadingMore(true);
    api.getHistory(buildParams(items.length))
      .then(({ items: more, total: t }) => {
        setItems((prev) => [...prev, ...more]);
        setTotal(t);
      })
      .catch((err: unknown) => {
        alert(err instanceof Error ? err.message : 'Failed to load more');
      })
      .finally(() => setLoadingMore(false));
  };

  const handleDelete = async (item: HistoryItem) => {
    const label = item.kind === 'batch' ? `batch "${item.name}"` : `"${item.name}"`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setDeletingId(item.id);
    try {
      if (item.kind === 'batch') {
        await api.deleteBatch(item.id);
      } else {
        await api.deleteTranscript(item.id);
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotal((prev) => prev - 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const handleReprocess = async (item: HistoryItem) => {
    if (item.kind === 'batch') {
      try {
        const { id } = await api.reprocessBatch(item.id);
        navigate(`/batch/${id}/processing`);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to reprocess');
      }
    } else {
      onReprocess(item.id);
    }
  };

  const handleView = (item: HistoryItem) => {
    if (item.kind === 'batch') {
      navigate(`/batch/${item.id}`);
    } else {
      onView?.(item.id);
      navigate(`/transcript/${item.id}`);
    }
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== '');
  const clearFilters = () => setFilters(EMPTY_FILTERS);
  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length;

  // ── Filter Bar ─────────────────────────────────────────────────────────

  const filterBar = (
    <div className="space-y-2 mb-4">
      {/* Search + toggle row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className={cn(
              'flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 pl-9 pr-8 py-1',
              'text-sm text-zinc-100 placeholder:text-zinc-500',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-950',
            )}
          />
          {filters.search && (
            <button
              onClick={() => setFilters((f) => ({ ...f, search: '' }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setFiltersOpen((o) => !o)}
          className={cn(
            'gap-1.5',
            (filtersOpen || hasActiveFilters) && 'border-blue-500/50 text-blue-400',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Expanded filter panel */}
      {filtersOpen && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Status */}
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className={SELECT_CLS}
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="done">Done</option>
              <option value="error">Error</option>
            </select>

            {/* Type */}
            <select
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
              className={SELECT_CLS}
            >
              <option value="">All types</option>
              <option value="transcript">Single call</option>
              <option value="batch">Batch</option>
            </select>

            {/* Date From */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500 whitespace-nowrap">From</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                className={DATE_CLS}
              />
            </div>

            {/* Date To */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500 whitespace-nowrap">To</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className={DATE_CLS}
              />
            </div>

            {/* Uploader */}
            <input
              type="text"
              placeholder="Uploader…"
              value={filters.uploader}
              onChange={(e) => setFilters((f) => ({ ...f, uploader: e.target.value }))}
              className={cn(DATE_CLS, 'w-28 placeholder:text-zinc-500')}
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );

  // ── Loading / Error states ─────────────────────────────────────────────

  if (loading) {
    return (
      <>
        {filterBar}
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-8 w-8 text-zinc-500" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {filterBar}
        <div className="space-y-3">
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────

  const groups = groupByDate(items);
  const hasMore = items.length < total;

  return (
    <div className="space-y-4">
      {filterBar}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {total === 0
            ? 'No results'
            : `${total} item${total !== 1 ? 's' : ''}${items.length < total ? ` · showing ${items.length}` : ''}`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Empty state */}
      {total === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 px-6 py-16 text-center">
          <FileAudio className="mx-auto h-10 w-10 text-zinc-700 mb-3" />
          {hasActiveFilters ? (
            <>
              <p className="text-zinc-400 font-medium">No results found</p>
              <p className="text-sm text-zinc-600 mt-1">Try adjusting your filters.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <p className="text-zinc-400 font-medium">No transcripts yet</p>
              <p className="text-sm text-zinc-600 mt-1">Upload an audio file to get started.</p>
            </>
          )}
        </div>
      )}

      {/* Date-grouped list */}
      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          {/* Date separator */}
          <div className="flex items-center gap-3 py-1">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
              {group.label}
            </span>
            <span className="flex items-center justify-center rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400 tabular-nums">
              {group.items.length}
            </span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <div className="space-y-2">
            {group.items.map((item) => (
              <HistoryCard
                key={item.id}
                item={item}
                deletingId={deletingId}
                onView={handleView}
                onReprocess={handleReprocess}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2 pb-4">
          <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore} className="min-w-32">
            {loadingMore ? (
              <>
                <Spinner className="mr-2 h-3.5 w-3.5" />
                Loading…
              </>
            ) : (
              `Load more (${total - items.length} remaining)`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── HistoryCard ────────────────────────────────────────────────────────────

interface CardProps {
  item: HistoryItem;
  deletingId: string | null;
  onView: (item: HistoryItem) => void;
  onReprocess: (item: HistoryItem) => void;
  onDelete: (item: HistoryItem) => void;
}

function HistoryCard({ item, deletingId, onView, onReprocess, onDelete }: CardProps) {
  const isDeleting = deletingId === item.id;
  const isBatch = item.kind === 'batch';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-4">
        {/* Left: icon + info */}
        <div className="flex items-start gap-3 min-w-0">
          {isBatch ? (
            <Layers className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-400" />
          ) : (
            <FileAudio className="mt-0.5 h-5 w-5 flex-shrink-0 text-zinc-500" />
          )}

          <div className="min-w-0">
            <p className="font-medium text-zinc-100 truncate">{item.name}</p>
            {item.originalFilename && item.originalFilename !== item.name && (
              <p className="text-xs text-zinc-600 truncate">{item.originalFilename}</p>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant={statusVariant(item.status)}>{item.status}</Badge>

              {isBatch && item.callCount != null && (
                <span className="text-xs text-zinc-500">
                  {item.callCount} call{item.callCount !== 1 ? 's' : ''}
                </span>
              )}

              {item.model && (
                <span className="text-xs text-zinc-500">{item.model}</span>
              )}

              {!isBatch && item.mode && (
                <span className="text-xs text-zinc-600">
                  {item.mode === 'assemblyai' ? 'AssemblyAI' : item.mode === 'api' ? 'API (legacy)' : 'Local'}
                </span>
              )}

              <span className="text-xs text-zinc-600">{formatTime(item.createdAt)}</span>

              {item.uploaderName && (
                <span className="text-xs text-zinc-600">· {item.uploaderName}</span>
              )}
            </div>

            {item.status === 'error' && item.errorMessage && (
              <p className="mt-1 text-xs text-red-400 truncate max-w-xs">{item.errorMessage}</p>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {item.status === 'done' && (
            <Button variant="outline" size="sm" onClick={() => onView(item)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              View
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReprocess(item)}
            title="Re-process"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item)}
            disabled={isDeleting}
            className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
            title="Delete"
          >
            {isDeleting ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
