import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { typeGlyph, typeTextClass } from '../lib/ui.ts';
import { useWorkspaceStore } from '../lib/workspace-store.ts';

/**
 * Cmd+K quick-jump palette — the only global shortcut wired up in Phase 2.
 *
 * Searches Model Objects inside the active Domain. Power users get a
 * keyboard-only path to any object without waiting for the tree to
 * render or expanding ancestors.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const domainId = useWorkspaceStore((s) => s.domainId);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useQuery({
    queryKey: ['palette', domainId, query],
    queryFn: () =>
      api.modelObjects.list({
        domainId: domainId!,
        ...(query.length >= 2 ? { search: query } : {}),
      }),
    enabled: open && !!domainId,
  });

  const items = useMemo(() => (results.data ?? []).slice(0, 20), [results.data]);

  const go = (id: string) => {
    if (!domainId) return;
    navigate(`/domains/${domainId}/dependencies/${id}`);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-surface-950/80 pt-32"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-surface-800 bg-surface-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, Math.max(items.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter' && items[cursor]) {
              go(items[cursor]!.id);
            }
          }}
          placeholder="Jump to an object…"
          className="w-full border-b border-surface-800 bg-transparent px-4 py-3 text-sm text-surface-100 placeholder:text-surface-200 focus:outline-none"
          aria-label="Search"
        />
        <ul className="max-h-80 overflow-auto">
          {items.length === 0 && (
            <li className="px-4 py-3 text-sm text-surface-200">No matches.</li>
          )}
          {items.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => go(o.id)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${
                  i === cursor ? 'bg-surface-800' : ''
                }`}
              >
                <span className={typeTextClass(o.type)}>{typeGlyph(o.type)}</span>
                <span className="text-surface-100">{o.name}</span>
                <span className="ml-auto font-mono text-[10px] text-surface-200">
                  {o.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
