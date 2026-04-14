import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router-dom';
import { AppShell } from './AppShell.tsx';
import { ConnectionsView } from '../pages/ConnectionsView.tsx';
import { DependenciesView } from '../pages/DependenciesView.tsx';
import { DiagramsView } from '../pages/DiagramsView.tsx';
import { HomeView } from '../pages/HomeView.tsx';
import { ModelObjectsView } from '../pages/ModelObjectsView.tsx';
import { NoDomainView } from '../pages/NoDomainView.tsx';

/**
 * Route map. All model views are scoped under a single Domain id, which
 * lives in the URL so deep links are shareable and refresh-safe. The
 * AppShell renders an <Outlet /> for the active route.
 */
const routes: RouteObject[] = [
  {
    element: (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
    children: [
      { index: true, element: <HomeView /> },
      { path: 'no-domain', element: <NoDomainView /> },
      {
        path: 'domains/:domainId',
        children: [
          { index: true, element: <Navigate to="objects" replace /> },
          { path: 'objects', element: <ModelObjectsView /> },
          { path: 'connections', element: <ConnectionsView /> },
          { path: 'diagrams', element: <DiagramsView /> },
          { path: 'dependencies', element: <DependenciesView /> },
          { path: 'dependencies/:objectId', element: <DependenciesView /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes);
