import { Route, Routes, Outlet, Link } from 'react-router-dom';
import {
  AppShell,
  Burger,
  Group,
  NavLink,
  Title,
  Stack,
  Divider,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import { ProjectsList } from './components/ProjectsList';
import { ProjectDetails } from './components/ProjectDetails';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { EditProjectPage } from './pages/EditProjectPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useDispatch } from 'react-redux';
import { AppDispatch } from './store';
import { logoutUser } from './store/authThunks';
import { IconHome, IconLogout } from '@tabler/icons-react';

function ProjectPage() {
  return <h1>Project Details Page</h1>;
}

export function App() {
  const [opened, { toggle }] = useDisclosure();
  const dispatch = useDispatch<AppDispatch>();

  const handleLogout = () => {
    dispatch(logoutUser());
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
