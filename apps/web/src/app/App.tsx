import { AppShell } from './AppShell.tsx';
import { PhaseZeroLanding } from './PhaseZeroLanding.tsx';

/**
 * Root component.
 *
 * Phase 0 renders only the persistent app shell and a static landing view
 * explaining what's wired up. Phase 2 will replace the landing with the
 * real model views (Model Objects, Connections, Diagrams, Dependencies)
 * and Phase 3 will add the canvas workspace route.
 */
export function App() {
  return (
    <AppShell>
      <PhaseZeroLanding />
    </AppShell>
  );
}
