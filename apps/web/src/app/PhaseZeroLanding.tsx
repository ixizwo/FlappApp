import { ObjectType, handleCountFor, levelOf } from '@flappapp/shared';

/**
 * Phase 0 landing page — proves the shared package resolves from the web
 * app and gives humans a visible overview of the C4 model the product is
 * built around. Replaced by real routes in Phase 2.
 */
export function PhaseZeroLanding() {
  const rows: { type: ObjectType; level: 1 | 2 | 3; handles: number }[] = [
    { type: ObjectType.ACTOR, level: levelOf(ObjectType.ACTOR), handles: handleCountFor(ObjectType.ACTOR) },
    { type: ObjectType.SYSTEM, level: levelOf(ObjectType.SYSTEM), handles: handleCountFor(ObjectType.SYSTEM) },
    { type: ObjectType.APP, level: levelOf(ObjectType.APP), handles: handleCountFor(ObjectType.APP) },
    { type: ObjectType.STORE, level: levelOf(ObjectType.STORE), handles: handleCountFor(ObjectType.STORE) },
    { type: ObjectType.COMPONENT, level: levelOf(ObjectType.COMPONENT), handles: handleCountFor(ObjectType.COMPONENT) },
  ];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">FlappApp — Phase 0 scaffold</h1>
      <p className="mt-2 text-surface-200">
        Monorepo, shared C4 types, NestJS API, Vite web shell, and CI are wired up.
        This landing view will be replaced by the Model Objects dashboard in Phase 2.
      </p>

      <h2 className="mt-6 text-lg font-semibold">C4 object types</h2>
      <table className="mt-2 w-full border border-surface-800 text-sm">
        <thead className="bg-surface-900 text-surface-200">
          <tr>
            <th className="px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">C4 level</th>
            <th className="px-3 py-2 text-left">Handles</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.type} className="border-t border-surface-800">
              <td className="px-3 py-2 font-mono">{r.type}</td>
              <td className="px-3 py-2">L{r.level}</td>
              <td className="px-3 py-2">{r.handles}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-6 text-sm text-surface-200">
        Next up: Phase 1 (model API + Prisma migrations), then the model management views.
        See <span className="font-mono">PLAN.md</span> for the full roadmap.
      </p>
    </div>
  );
}
