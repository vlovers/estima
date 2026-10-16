import { ActionIcon, Drawer, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconChevronRight,
  IconFolder,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconPlus,
} from '@tabler/icons-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useLogoutMutation } from '../features/auth/hooks/auth.hooks';
import { Brand } from './Brand';
import { ThemeSwitcher } from './ThemeSwitcher';

export function WorkspaceLayout() {
  const [opened, { open, close }] = useDisclosure(false);
  const { pathname } = useLocation();
  const logout = useLogoutMutation();
  const section =
    pathname === '/dashboard'
      ? 'Overview'
      : pathname === '/projects/new'
      ? 'New project'
      : pathname.endsWith('/edit')
      ? 'Project settings'
      : pathname === '/'
      ? 'Projects'
      : 'Project workspace';
  useEffect(() => {
    document.title = `${section} · Estima`;
  }, [section]);
  const navigation = (
    <>
      <p className="workspace-label">Workspace</p>
      <nav className="sidebar-nav" aria-label="Main navigation">
        <Link
          className="sidebar-link"
          to="/dashboard"
          aria-current={pathname === '/dashboard' ? 'page' : undefined}
          onClick={close}
        >
          <IconLayoutDashboard size={18} />
          Overview
        </Link>
        <Link
          className="sidebar-link"
          to="/"
          aria-current={
            pathname === '/' || pathname.startsWith('/projects/')
              ? 'page'
              : undefined
          }
          onClick={close}
        >
          <IconFolder size={18} />
          Projects
        </Link>
        <Link className="sidebar-link" to="/projects/new" onClick={close}>
          <IconPlus size={18} />
          New project
        </Link>
      </nav>
      <div className="sidebar-footer">
        <p className="sidebar-note">
          Scope thoughtfully.
          <br />
          Estimate with context.
        </p>
        <button
          className="sidebar-link sidebar-logout"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <IconLogout size={18} />
          {logout.isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </>
  );
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="workspace-sidebar" aria-label="Workspace sidebar">
        <Link to="/" className="sidebar-brand" aria-label="Estima projects">
          <Brand />
        </Link>
        {navigation}
      </aside>
      <Drawer
        opened={opened}
        onClose={close}
        title={<Brand />}
        size={270}
        classNames={{
          content: 'mobile-sidebar',
          header: 'mobile-sidebar-header',
          body: 'mobile-sidebar-body',
        }}
        closeButtonProps={{ 'aria-label': 'Close navigation' }}
      >
        <div className="sidebar-body">{navigation}</div>
      </Drawer>
      <div className="workspace-area">
        <header className="workspace-topbar">
          <Group gap="sm">
            <ActionIcon
              variant="subtle"
              color="gray"
              className="mobile-menu"
              aria-label="Open navigation"
              aria-expanded={opened}
              onClick={open}
            >
              <IconMenu2 size={21} />
            </ActionIcon>
            <div className="workspace-breadcrumb">
              <span>Workspace</span>
              <IconChevronRight size={13} aria-hidden="true" />
              <strong>{section}</strong>
            </div>
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed" visibleFrom="sm">
              AI estimation workspace
            </Text>
            <ThemeSwitcher />
          </Group>
        </header>
        <main id="main-content" tabIndex={-1} className="workspace-content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
