import { test, expect, Page, TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { mockWorkspace } from '../fixtures/workspace';

async function capture(page: Page, info: TestInfo, name: string) {
  if (!process.env.ESTIMA_SCREENSHOT_DIR) return;
  await mkdir(process.env.ESTIMA_SCREENSHOT_DIR, { recursive: true });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250); // Capture after Mantine's short dialog/tooltip transition.
  await page.screenshot({
    animations: 'disabled',
    path: `${process.env.ESTIMA_SCREENSHOT_DIR}/${name}-${info.project.name}.png`,
    fullPage: !(await page.getByRole('dialog').isVisible()),
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
}

test('authentication forms, server error and logout preserve existing requests', async ({
  page,
}, info) => {
  const fixture = await mockWorkspace(page, { authenticated: false });
  let loginAttempt = 0;
  await page.route('**/api/auth/login', (route) => {
    if (++loginAttempt === 1)
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': 'http://127.0.0.1:4317',
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify({ message: 'Invalid email or password.' }),
      });
    return route.fallback();
  });
  await page.goto('/login');
  await expect(
    page.getByRole('heading', { name: 'Welcome back' })
  ).toBeVisible();
  await capture(page, info, 'login');
  await page.getByLabel('Email address').fill('designer@example.test');
  await page.getByLabel(/^Password/).fill('browser-fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not sign in' })
  ).toContainText('Invalid email or password.');
  await expect(page.getByLabel('Email address')).toHaveValue(
    'designer@example.test'
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Projects', exact: true })
  ).toBeVisible();
  expect(
    fixture.requests.find((item) => item.path === '/auth/login')?.body
  ).toEqual({
    email: 'designer@example.test',
    password: 'browser-fixture-password',
  });
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Create your account' })
  ).toBeVisible();
  await capture(page, info, 'register');
  await page.getByLabel('Email address').fill('new@example.test');
  await page.getByLabel(/^Password/).fill('browser-fixture-password');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  expect(fixture.requests.some((item) => item.path === '/auth/register')).toBe(
    true
  );
});

test('projects, details, estimation, structured task creation and task actions', async ({
  page,
}, info) => {
  const fixture = await mockWorkspace(page);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Projects', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Customer portal', exact: true })
  ).toBeVisible();
  await noOverflow(page);
  await capture(page, info, 'projects');
  await page
    .getByRole('link', { name: 'Customer portal', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Customer portal', exact: true })
  ).toBeVisible();
  await expect(page.getByText('32', { exact: false }).first()).toBeVisible();
  await noOverflow(page);
  await capture(page, info, 'project');
  await page.getByRole('button', { name: 'View estimate' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByText('Uncertainty range', { exact: true })
  ).toBeVisible();
  await noOverflow(page);
  await expect(page.getByText('Manager’s note', { exact: true })).toBeVisible();
  await capture(page, info, 'estimate');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Task title')).toBeInViewport();
  await noOverflow(page);
  await expect(
    dialog.getByRole('textbox', { name: 'Acceptance criteria' })
  ).toHaveCount(0);
  await capture(page, info, 'task-form');
  await dialog.getByLabel('Task title').fill('Accessible search filters');
  await dialog
    .getByLabel(/^Description/)
    .fill(
      'Add a keyboard-accessible search and filter experience to the task workspace.'
    );
  await dialog.getByLabel(/^Technology/).fill('React');
  await dialog.getByRole('button', { name: 'Scope & assumptions' }).click();
  await dialog
    .getByLabel('Acceptance criteria')
    .fill('All controls support keyboard navigation');
  await dialog.getByLabel('Acceptance criteria').press('Enter');
  await dialog
    .getByRole('button', { name: 'Create task', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Accessible search filters',
      exact: true,
    })
  ).toBeVisible();
  const created = fixture.requests.find(
    (item) => item.path === '/tasks' && item.method === 'POST'
  );
  expect(created?.body.acceptanceCriteria).toEqual([
    'All controls support keyboard navigation',
  ]);
  expect(created?.body.projectId).toBe(fixture.projects[0].id);
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', {
      name: 'Accessible search filters',
      exact: true,
    }),
  });
  await card
    .getByRole('button', { name: 'Actions for Accessible search filters' })
    .click();
  await page.getByRole('menuitem', { name: 'Edit task', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Task title')
    .fill('Accessible project search');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Accessible project search',
      exact: true,
    })
  ).toBeVisible();
  const updatedCard = page.getByRole('article').filter({
    has: page.getByRole('heading', {
      name: 'Accessible project search',
      exact: true,
    }),
  });
  await updatedCard
    .getByRole('button', { name: 'Manual estimate', exact: true })
    .click();
  await page.getByLabel('Manual Estimate (hours)').fill('14');
  await page.getByRole('button', { name: 'Set Estimate', exact: true }).click();
  await expect(updatedCard.getByText('Manual reference 14 h')).toBeVisible();
  await updatedCard
    .getByRole('button', { name: 'Feedback', exact: true })
    .click();
  await page.getByLabel('Actual Hours Spent').fill('15');
  await page
    .getByRole('radio', { name: '4 out of 5', exact: true })
    .press('Space');
  await page
    .getByRole('textbox', { name: 'Primary Reason for Deviation' })
    .click();
  await page.getByRole('option', { name: 'Other', exact: true }).click();
  await page
    .getByRole('button', { name: 'Submit Feedback', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    fixture.requests.some(
      (item) =>
        item.path === '/estimate-feedback' && item.body.actualHours === 15
    )
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Answer questions', exact: true })
    .click();
  await page
    .getByLabel('Which roles should be able to invite new members?')
    .fill('Workspace administrators only.');
  await page
    .getByRole('button', { name: 'Submit Answers', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    fixture.requests.some(
      (item) => item.path.endsWith('/clarify') && item.method === 'PATCH'
    )
  ).toBe(true);
  await updatedCard
    .getByRole('button', { name: 'Actions for Accessible project search' })
    .click();
  await page
    .getByRole('menuitem', { name: 'Delete task', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete task', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Accessible project search',
      exact: true,
    })
  ).toHaveCount(0);
});

test('project create/edit, empty state and mobile navigation', async ({
  page,
}, info) => {
  await mockWorkspace(page, { empty: true });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Start with your first project' })
  ).toBeVisible();
  await capture(page, info, 'empty-projects');
  await page
    .getByRole('main')
    .getByRole('link', { name: 'New project', exact: true })
    .first()
    .click();
  await page.getByLabel('Project name').fill('Research workspace');
  await page
    .getByLabel(/^Description/)
    .fill('A focused project for research and validation tasks.');
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Research workspace', exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Actions for Research workspace' })
    .click();
  await page
    .getByRole('menuitem', { name: 'Edit project', exact: true })
    .click();
  await page.getByLabel('Project name').fill('Research & discovery');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Research & discovery', exact: true })
  ).toBeVisible();
  if (info.project.name === 'mobile') {
    const opener = page.getByRole('button', { name: 'Open navigation' });
    await opener.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await opener.click();
  }
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Workspace overview' })
  ).toBeVisible();
  await noOverflow(page);
  await page
    .getByRole('button', { name: 'Actions for Research & discovery' })
    .click();
  await page
    .getByRole('menuitem', { name: 'Delete project', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Keep project' })
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Delete project', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Start with your first project' })
  ).toBeVisible();
});

test('theme, keyboard focus, filters and unavailable estimate data', async ({
  page,
}, info) => {
  await mockWorkspace(page);
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-mantine-color-scheme',
    'dark'
  );
  await capture(page, info, 'projects-dark');
  await page
    .getByRole('textbox', { name: 'Search projects', exact: true })
    .fill('nonexistent');
  await expect(
    page.getByRole('heading', { name: 'No matching projects' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page
    .getByRole('link', { name: 'Customer portal', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Search tasks', exact: true })
    .fill('Billing settings');
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Billing settings screen' }),
  });
  await expect(card.getByText(/confidence|P10|P90/)).toHaveCount(0);
  await noOverflow(page);
});

test('load failures offer recovery without showing made-up project data', async ({
  page,
}, info) => {
  await mockWorkspace(page);
  let fail = true;
  await page.route('**/api/projects', (route) =>
    fail
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers: {
            'access-control-allow-origin': 'http://127.0.0.1:4317',
            'access-control-allow-credentials': 'true',
          },
          body: JSON.stringify({ message: 'Service temporarily unavailable' }),
        })
      : route.fallback()
  );
  await page.goto('/');
  await expect(
    page.getByRole('status', { name: 'Loading projects' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Projects could not be loaded' })
  ).toBeVisible({ timeout: 15000 });
  await capture(page, info, 'projects-error');
  fail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Customer portal', exact: true })
  ).toBeVisible();
});

test('primary action contrast and keyboard menus work in both themes', async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto('/');
  for (const dark of [false, true]) {
    if (dark)
      await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    const ratio = await page
      .getByRole('main')
      .getByRole('link', { name: 'New project', exact: true })
      .evaluate((element) => {
        const style = getComputedStyle(element);
        const luminance = (color: string) => {
          const components = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map((value) => Number(value) / 255)
            .map((value) =>
              value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4
            );
          return (
            components[0] * 0.2126 +
            components[1] * 0.7152 +
            components[2] * 0.0722
          );
        };
        const foreground = luminance(style.color),
          background = luminance(style.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    const actions = page.getByRole('button', {
      name: 'Actions for Customer portal',
      exact: true,
    });
    await actions.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(
      page.getByRole('menu').locator('[data-autofocus]')
    ).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(
      page.getByRole('menuitem', { name: 'Edit project', exact: true })
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(actions).toBeFocused();
  }
});
