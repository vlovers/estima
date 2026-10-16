// Explicit test-only API fixtures. No sample projects or estimates are shipped by the application.
import type { Page } from '@playwright/test';
import type { Project, Task } from '../../web/src/app/types';

const task = (id: string, title: string, hours?: number): Task => ({
  id,
  title,
  description:
    'Define the scope, implement the experience and cover the important edge cases.',
  technology: 'React · TypeScript',
  experienceLevel: 'MIDDLE',
  tags: ['frontend'],
  status: 'estimated',
  estimates:
    hours === undefined
      ? []
      : [
          {
            id: `${id}-estimate`,
            source: 'final',
            finalEstimate: hours,
            confidence: null,
            explanation: 'Estimate returned for the supplied task scope.',
          },
        ],
  feedbacks: [],
});
export function workspaceFixtures() {
  const onboarding = task(
    '00000000-0000-4000-8000-000000000011',
    'Customer onboarding flow',
    24
  );
  onboarding.description =
    'Create a guided onboarding experience with account setup, workspace preferences and a clear first-run checklist.';
  onboarding.estimates = [
    {
      id: 'raw',
      source: 'ai',
      finalEstimate: 18,
      confidence: null,
      explanation: 'Initial task analysis.',
    },
    {
      id: 'final',
      source: 'final',
      finalEstimate: 24,
      manualEstimate: 20,
      confidence: 0.82,
      p10: 16,
      p50: 24,
      p90: 40,
      topDown: 26,
      bottomUp: 24,
      divergencePct: 8,
      explanation:
        'The scope includes account setup, preference validation and first-run states. The range reflects the uncertainty in integration and edge-case handling.',
      managerExplanation:
        'Confirm the onboarding requirements before committing the delivery plan.',
      logs: 'Scope reviewed\nIntegration allowance included',
    },
  ];
  onboarding.subtasks = [
    task('00000000-0000-4000-8000-000000000014', 'Account setup screen', 6),
  ];
  onboarding.riskAnalysis = [
    {
      risk: 'External identity provider behavior may differ between environments.',
      mitigation: 'Validate the sandbox integration before implementation.',
    },
  ];
  const billing = task(
    '00000000-0000-4000-8000-000000000012',
    'Billing settings screen',
    8
  );
  billing.tags = ['billing'];
  const permissions = task(
    '00000000-0000-4000-8000-000000000013',
    'Role-based permissions'
  );
  permissions.status = 'pending_clarification';
  permissions.clarificationHistory = [
    {
      question: 'Which roles should be able to invite new members?',
      answer: '',
    },
  ];
  const projects: Project[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Customer portal',
      description:
        'A considered self-service experience for onboarding, account settings and billing.',
      complexity: 'MEDIUM',
      overhead: 15,
      tasks: [onboarding, billing, permissions],
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Billing infrastructure',
      description:
        'Subscription workflows and reliable payment integrations for the next stage of growth.',
      complexity: 'HIGH',
      overhead: 20,
      tasks: [],
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Marketing website',
      description:
        'A clear introduction to the product, with accessible pages and a focused content structure.',
      complexity: 'LOW',
      overhead: 10,
      tasks: [],
    },
  ];
  return projects;
}
export async function mockWorkspace(
  page: Page,
  options: { empty?: boolean; authenticated?: boolean } = {}
) {
  const projects = options.empty ? [] : workspaceFixtures();
  const requests: {
    method: string;
    path: string;
    body: Record<string, unknown>;
  }[] = [];
  let counter = 100;
  const allTasks = (tasks: Task[]): Task[] =>
    tasks.flatMap((item) => [item, ...allTasks(item.subtasks ?? [])]);
  await page.addInitScript(
    ({ authenticated }) => {
      if (authenticated)
        localStorage.setItem('token', 'isolated-browser-fixture');
    },
    { authenticated: options.authenticated !== false }
  );
  await page.route('http://localhost:3000/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname.replace('/api', '');
    const body = request.postDataJSON() ?? {};
    requests.push({ method, path, body });
    const headers = {
      'access-control-allow-origin': 'http://127.0.0.1:4317',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
    };
    const reply = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: status === 204 ? undefined : JSON.stringify(data),
      });
    if (method === 'OPTIONS') return reply(null, 204);
    if (path.startsWith('/auth/'))
      return reply(
        {
          accessToken: 'isolated-browser-fixture',
          user: { id: 'fixture-user', email: 'designer@example.test' },
        },
        path === '/auth/register' ? 201 : 200
      );
    if (path === '/projects' && method === 'GET')
      return reply(projects.map(({ tasks: _tasks, ...project }) => project));
    if (path === '/projects' && method === 'POST') {
      const created = {
        ...body,
        id: `00000000-0000-4000-8000-${++counter}`,
        tasks: [],
      } as unknown as Project;
      projects.push(created);
      return reply(created, 201);
    }
    if (path.startsWith('/projects/')) {
      const id = path.split('/')[2];
      const project = projects.find((item) => item.id === id);
      if (!project) return reply({ message: 'Project not found' }, 404);
      if (method === 'PATCH') Object.assign(project, body);
      if (method === 'DELETE') projects.splice(projects.indexOf(project), 1);
      return reply(project);
    }
    if (path === '/tasks' && method === 'POST') {
      const project = projects.find((item) => item.id === body.projectId);
      const created = {
        ...task(`00000000-0000-4000-8000-${++counter}`, String(body.title), 12),
        ...body,
      } as unknown as Task;
      project?.tasks.push(created);
      return reply(created, 201);
    }
    if (path.startsWith('/tasks/')) {
      const id = path.split('/')[2];
      const project = projects.find((item) =>
        allTasks(item.tasks).some((item) => item.id === id)
      );
      const current =
        project && allTasks(project.tasks).find((item) => item.id === id);
      if (!current || !project)
        return reply({ message: 'Task not found' }, 404);
      if (path.endsWith('/clarify')) {
        current.status = 'estimated';
        current.clarificationHistory =
          body.clarifications as Task['clarificationHistory'];
        current.estimates = task(id, current.title, 10).estimates;
      } else if (method === 'PATCH') {
        Object.assign(current, body);
        if (typeof body.manualEstimate === 'number')
          current.estimates.push({
            id: 'manual',
            source: 'manual',
            finalEstimate: body.manualEstimate,
            manualEstimate: body.manualEstimate,
            confidence: null,
            explanation: null,
          });
      } else if (method === 'DELETE') {
        project.tasks = project.tasks.filter((item) => item.id !== id);
      }
      return reply(current);
    }
    if (path === '/estimate-feedback') return reply({}, 201);
    return reply({ message: 'Unmocked test endpoint' }, 404);
  });
  return { projects, requests };
}
