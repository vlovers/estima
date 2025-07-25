import { Route, Routes, Outlet, Link } from 'react-router-dom';
import {
  AppShell,
  Burger,
  Divider,
  Group,
  NavLink,
  Stack,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import { IconHome, IconLogout } from '@tabler/icons-react';

import { useLogoutMutation } from './features/auth/hooks/auth.hooks';
import { ProjectsList } from './features/projects/components/ProjectsList';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ProjectDetails } from './components/ProjectDetails';

import { CreateProjectPage } from './pages/CreateProjectPage';
import { EditProjectPage } from './pages/EditProjectPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

export function App() {
  const [opened, { toggle }] = useDisclosure();
  const { mutate: logout } = useLogoutMutation();

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      <Notifications />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route
            element={
              <AppShell
                header={{ height: 60 }}
                navbar={{
                  width: 300,
                  breakpoint: 'sm',
                  collapsed: { mobile: !opened },
                }}
                padding="md"
              >
                <AppShell.Header>
                  <Group h="100%" px="md">
                    <Burger
                      opened={opened}
                      onClick={toggle}
                      hiddenFrom="sm"
                      size="sm"
                    />
                    <Title order={3}>AI Estimates</Title>
                  </Group>
                </AppShell.Header>

                <AppShell.Navbar p="md">
                  <Stack justify="space-between" h="100%">
                    <Stack>
                      <NavLink
                        label="Projects"
                        component={Link}
                        to="/"
                        leftSection={<IconHome size="1rem" stroke={1.5} />}
                      />
                    </Stack>

                    <Stack>
                      <Divider />
                      <NavLink
                        label="Logout"
                        onClick={handleLogout}
                        leftSection={<IconLogout size="1rem" stroke={1.5} />}
                      />
                    </Stack>
                  </Stack>
                </AppShell.Navbar>

                <AppShell.Main>
                  <Outlet />
                </AppShell.Main>
              </AppShell>
            }
          >
            <Route path="/" element={<ProjectsList />} />
            <Route path="/projects/new" element={<CreateProjectPage />} />
            <Route path="/projects/:id" element={<ProjectDetails />} />
            <Route path="/projects/:id/edit" element={<EditProjectPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}

export default App;
