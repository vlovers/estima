import { lazy, ReactNode, Suspense } from 'react';
import { Route, Routes, Link } from 'react-router-dom';
import { Button } from '@mantine/core';
import { ProtectedRoute } from './components/ProtectedRoute';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { WorkspaceLoading, WorkspaceState } from './components/WorkspaceState';

const ProjectsList = lazy(() =>
  import('./features/projects/components/ProjectsList').then((module) => ({
    default: module.ProjectsList,
  }))
);
const ProjectDetails = lazy(() =>
  import('./components/ProjectDetails').then((module) => ({
    default: module.ProjectDetails,
  }))
);
const CreateProjectPage = lazy(() =>
  import('./pages/CreateProjectPage').then((module) => ({
    default: module.CreateProjectPage,
  }))
);
const EditProjectPage = lazy(() =>
  import('./pages/EditProjectPage').then((module) => ({
    default: module.EditProjectPage,
  }))
);
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((module) => ({
    default: module.RegisterPage,
  }))
);
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((module) => ({ default: module.LoginPage }))
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  }))
);
function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceLoading label="Loading page" />}>
      {children}
    </Suspense>
  );
}
export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Page>
            <LoginPage />
          </Page>
        }
      />
      <Route
        path="/register"
        element={
          <Page>
            <RegisterPage />
          </Page>
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route element={<WorkspaceLayout />}>
          <Route
            path="/"
            element={
              <Page>
                <ProjectsList />
              </Page>
            }
          />
          <Route
            path="/dashboard"
            element={
              <Page>
                <DashboardPage />
              </Page>
            }
          />
          <Route
            path="/projects/new"
            element={
              <Page>
                <CreateProjectPage />
              </Page>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <Page>
                <ProjectDetails />
              </Page>
            }
          />
          <Route
            path="/projects/:id/edit"
            element={
              <Page>
                <EditProjectPage />
              </Page>
            }
          />
          <Route
            path="*"
            element={
              <WorkspaceState
                title="Page not found"
                description="This page may have moved. Your projects are still in your workspace."
                action={
                  <Button component={Link} to="/">
                    Back to projects
                  </Button>
                }
              />
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
export default App;
