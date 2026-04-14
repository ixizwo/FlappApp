import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Connection, type ModelObject } from '../lib/api.ts';
import { typeGlyph, typeTextClass } from '../lib/ui.ts';

/**
 * Dependencies view — for a picked ModelObject, show every other object it
 * touches via a Connection, grouped into Incoming / Outgoing / Via.
 *
 * If no object is selected we render a quick picker so the user can land
 * from a deep link like /domains/:id/dependencies without a 404.
 *
 * This is the fastest path to the "what talks to this?" question the PRD
 * calls out in §3.5 (dependency analysis). It's intentionally non-graphical
 * — the canvas view in Phase 3 will be the interactive answer.
 */
export function DependenciesView() {
  const { domainId = '', objectId } = useParams<{ domainId: string; objectId?: string }>();

  const objects = useQuery({
    queryKey: ['model-objects', domainId],
    queryFn: () => api.modelObjects.list({ domainId }),
    enabled: !!domainId,
  });

  const connections = useQuery({
    queryKey: ['connections', domainId],
    queryFn: () => api.connections.list({ domainId }),
    enabled: !!domainId,
  });

  const target = useMemo(
    () => (objectId ? objects.data?.find((o) => o.id === objectId) : undefined),
    [objects.data, objectId],
  );

  const { incoming, outgoing, via } = useMemo(() => {
    const empty = {
      incoming: [] as Connection[],
      outgoing: [] as Connection[],
      via: [] as Connection[],
    };
    if (!objectId || !connections.data) return empty;
    const inc: Connection[] = [];
    const out: Connection[] = [];
    const viaList: Connection[] = [];
    for (const c of connections.data) {
      if (c.receiverId === objectId) inc.push(c);
      if (c.senderId === objectId) out.push(c);
      if (c.viaId === objectId) viaList.push(c);
    }
    return { incoming: inc, outgoing: out, via: viaList };
  }, [connections.data, objectId]);

  if (!domainId) {
    return <div className="p-6 text-sm text-surface-200">No domain selected.</div>;
  }

  if (!objectId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-surface-800 bg-surface-900/40 px-4 py-3">
          <h1 className="text-lg font-semibold">Dependencies</h1>
          <p className="text-xs text-surface-200">
            Pick an object to inspect its connections.
          </p>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <ObjectPicker objects={objects.data ?? []} domainId={domainId} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-surface-800 bg-surface-900/40 px-4 py-3">
        <h1 className="text-lg font-semibold">
          {target ? (
            <span className="flex items-center gap-2">
              <span className={typeTextClass(target.type)}>{typeGlyph(target.type)}</span>
              {target.name}
              <span className="font-mono text-xs text-surface-200">{target.type}</span>
            </span>
          ) : (
            'Dependencies'
          )}
        </h1>
        <p className="text-xs text-surface-200">
          Direct connections where this object is the sender, receiver, or routing hop.
        </p>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-3">
        <DependencySection
          title="Incoming"
          subtitle="Other objects that talk TO this one"
          rows={incoming}
          fieldLabel="From"
          getOther={(c) => c.sender}
          domainId={domainId}
        />
        <DependencySection
          title="Outgoing"
          subtitle="What this object talks to"
          rows={outgoing}
          fieldLabel="To"
          getOther={(c) => c.receiver}
          domainId={domainId}
        />
        <DependencySection
          title="Via / hops through"
          subtitle="Connections that route through this object"
          rows={via}
          fieldLabel="Edge"
          getOther={(c) => c.sender}
          domainId={domainId}
          showSenderReceiver
        />
      </div>
    </div>
  );
}

function ObjectPicker({ objects, domainId }: { objects: ModelObject[]; domainId: string }) {
  if (objects.length === 0) {
    return <div className="text-sm text-surface-200">No objects in this domain yet.</div>;
  }
  return (
    <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
      {objects.map((o) => (
        <li key={o.id}>
          <Link
            to={`/domains/${domainId}/dependencies/${o.id}`}
            className="flex items-center gap-2 rounded border border-surface-800 bg-surface-900 px-3 py-2 text-sm hover:border-surface-200"
          >
            <span className={typeTextClass(o.type)}>{typeGlyph(o.type)}</span>
            <span className="truncate text-surface-100">{o.name}</span>
            <span className="ml-auto font-mono text-[10px] text-surface-200">{o.type}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DependencySection({
  title,
  subtitle,
  rows,
  fieldLabel,
  getOther,
  domainId,
  showSenderReceiver = false,
}: {
  title: string;
  subtitle: string;
  rows: Connection[];
  fieldLabel: string;
  getOther: (c: Connection) => ModelObject;
  domainId: string;
  showSenderReceiver?: boolean;
}) {
  return (
    <section
      className="flex min-h-0 flex-col rounded border border-surface-800 bg-surface-900/40"
      data-testid={`section-${title.toLowerCase().split(' ')[0]}`}
    >
      <header className="border-b border-surface-800 px-3 py-2">
        <h2 className="text-sm font-semibold">
          {title} <span className="text-xs text-surface-200">({rows.length})</span>
        </h2>
        <p className="text-[11px] text-surface-200">{subtitle}</p>
      </header>
      <ul className="flex-1 overflow-auto">
        {rows.length === 0 && (
          <li className="px-3 py-2 text-xs text-surface-200">Nothing here.</li>
        )}
        {rows.map((c) => {
          const other = getOther(c);
          return (
            <li key={c.id} className="border-b border-surface-800/60 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase text-surface-200">{fieldLabel}</span>
                <Link
                  to={`/domains/${domainId}/dependencies/${other.id}`}
                  className="flex items-center gap-1.5 text-surface-100 hover:underline"
                >
                  <span className={typeTextClass(other.type)}>{typeGlyph(other.type)}</span>
                  {other.name}
                </Link>
                <span className="ml-auto font-mono text-[10px] text-surface-200">
                  {c.direction}
                </span>
              </div>
              {showSenderReceiver && (
                <div className="mt-0.5 text-[11px] text-surface-200">
                  {c.sender.name} → {c.receiver.name}
                </div>
              )}
              {c.description && (
                <div className="mt-0.5 text-[11px] text-surface-200">{c.description}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
