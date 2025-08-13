import { ProjectsList } from './features/projects/components/ProjectsList';
import { useLogoutMutation } from './features/auth/hooks/auth.hooks';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { Route, Routes, Outlet, Link } from 'react-router-dom';
import { IconHome, IconLogout } from '@tabler/icons-react';
import { ProjectDetails } from './components/ProjectDetails';
import { EditProjectPage } from './pages/EditProjectPage';
import { Notifications } from '@mantine/notifications';
import { RegisterPage } from './pages/RegisterPage';
import { useDisclosure } from '@mantine/hooks';
import { LoginPage } from './pages/LoginPage';

import {
  ActionIcon,
  AppShell,
  Tooltip,
  Divider,
  Burger,
  Group,
  Stack,
  Title,
} from '@mantine/core';

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
                  width: 64,
                  breakpoint: 'sm',
                  collapsed: { mobile: !opened },
                }}
                padding="md"
              >
                <AppShell.Header>
                  <Group h="100%" px="md" justify="space-between">
                    <Group>
                      <Burger
                        opened={opened}
                        onClick={toggle}
                        hiddenFrom="sm"
                        size="sm"
                      />
                      <Title order={3}>AI Estimates</Title>
                    </Group>
                    <ThemeSwitcher />
                  </Group>
                </AppShell.Header>

                <AppShell.Navbar p="sm">
                  <Stack justify="space-between" h="100%" align="center">
                    <Stack align="center">
                      <Tooltip label="Projects" position="right" withArrow>
                        <ActionIcon
                          component={Link}
                          to="/"
                          size="lg"
                          variant="subtle"
                          aria-label="Projects"
                        >
                          <IconHome size="1.2rem" stroke={1.6} />
                        </ActionIcon>
                      </Tooltip>
                    </Stack>

                    <Stack align="center" w="100%">
                      <Divider w="100%" />
                      <Tooltip label="Logout" position="right" withArrow>
                        <ActionIcon
                          onClick={handleLogout}
                          size="lg"
                          variant="subtle"
                          aria-label="Logout"
                        >
                          <IconLogout size="1.2rem" stroke={1.6} />
                        </ActionIcon>
                      </Tooltip>
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
