export function NoDomainView() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">Pick a Domain first</h1>
      <p className="mt-2 text-surface-200">
        The Model, Connections, Diagrams, and Dependencies views are all
        scoped to a single Domain. Use the workspace switcher in the top
        bar to select one.
      </p>
    </div>
  );
}
