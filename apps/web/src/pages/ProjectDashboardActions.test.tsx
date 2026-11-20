import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from '../test-utils';
import type { Organization } from '../context/AuthContext';
import { ProjectDashboardPage } from './ProjectDashboardPage';

const mocks = vi.hoisted(() => ({
  auth: {} as { currentOrg: Organization },
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/api', () => ({ api: mocks.api }));

const adminOrg: Organization = {
  id: 'org-1',
  name: 'Abyssinia Technologies PLC',
  slug: 'abyssinia-tech',
  role: 'ADMIN',
  createdAt: '2026-11-17T00:00:00.000Z',
};
const memberOrg: Organization = { ...adminOrg, id: 'org-2', name: 'Other Org', role: 'MEMBER' };

const project = {
  id: 'p-1',
  name: 'Mobile Banking Platform',
  description: null,
  budget: '750000.00',
  currency: 'ETB',
  organizationId: 'org-1',
};
const task = (id: string, priority: 'LOW' | 'MEDIUM' | 'HIGH', cost: string) => ({
  id,
  title: `Task ${id}`,
  description: null,
  status: 'TODO',
  priority,
  estimatedCost: cost,
  currency: 'ETB',
  projectId: 'p-1',
});
const ALL_TASKS = [task('h1', 'HIGH', '400000.00'), task('m1', 'MEDIUM', '100000.00')];

const apiError = (status: number, message: string | string[]) => ({
  isAxiosError: true,
  response: { status, data: { message } },
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ProjectDashboardPage />
    </MemoryRouter>,
  );

const card = (title: string): HTMLElement => {
  const el = screen.getByRole('heading', { name: title }).closest('.auth-card');
  if (!el) throw new Error(`no dialog "${title}"`);
  return el as HTMLElement;
};
const dialogOpen = (title: string): boolean => screen.queryByRole('heading', { name: title }) !== null;
const kpi = (label: string): string => screen.getByText(label).nextElementSibling?.textContent ?? '';
const taskCalls = () => mocks.api.get.mock.calls.filter((c) => String(c[0]).startsWith('/tasks')).length;

let tasksOnServer = ALL_TASKS;

beforeEach(() => {
  tasksOnServer = ALL_TASKS;
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.auth.currentOrg = adminOrg;
  mocks.api.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/projects')) return { data: [project] };
    if (url.startsWith('/tasks')) return { data: tasksOnServer };
    throw new Error(`unexpected GET ${url}`);
  });
});
afterEach(cleanup);

const ready = async (): Promise<void> => {
  await screen.findByText('Task h1');
};

describe('Delete task', () => {
  it('is offered to ADMINs only; MEMBERs keep the Edit action', async () => {
    const view = renderPage();
    await ready();
    expect(screen.getByRole('button', { name: 'Delete task Task h1' })).not.toBeNull();

    mocks.auth.currentOrg = memberOrg;
    view.rerender(
      <MemoryRouter>
        <ProjectDashboardPage />
      </MemoryRouter>,
    );
    // Switching organization loads that organization's projects and tasks before rows appear
    expect((await screen.findAllByRole('button', { name: /edit/i })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /delete task/i })).toBeNull();
  });

  it('a MEMBER never sees delete controls', async () => {
    mocks.auth.currentOrg = memberOrg;
    renderPage();
    await ready();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('requires confirmation, then deletes, reloads the rows and recalculates the budget', async () => {
    mocks.api.delete.mockImplementation(async () => {
      tasksOnServer = [ALL_TASKS[1]];
      return { data: { deleted: true } };
    });
    renderPage();
    await ready();
    expect(kpi('Estimated Task Cost (ETB)')).toMatch(/500,000\.00/);

    fireEvent.click(screen.getByRole('button', { name: 'Delete task Task h1' }));
    expect(mocks.api.delete).not.toHaveBeenCalled();
    const loadsBefore = taskCalls();
    fireEvent.click(within(card('Delete Task')).getByRole('button', { name: 'Delete Task' }));

    await waitFor(() => expect(dialogOpen('Delete Task')).toBe(false));
    expect(mocks.api.delete).toHaveBeenCalledWith('/tasks/h1');
    expect(taskCalls()).toBe(loadsBefore + 1);
    expect(screen.queryByText('Task h1')).toBeNull();
    expect(kpi('Estimated Task Cost (ETB)')).toMatch(/100,000\.00/);
    expect(kpi('Remaining Budget (ETB)')).toMatch(/650,000\.00/);
  });

  it('cancel deletes nothing', async () => {
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Delete task Task h1' }));
    fireEvent.click(within(card('Delete Task')).getByRole('button', { name: 'Cancel' }));
    expect(dialogOpen('Delete Task')).toBe(false);
    expect(mocks.api.delete).not.toHaveBeenCalled();
    expect(screen.getByText('Task h1')).not.toBeNull();
  });

  it('shows a rejection inside the dialog, keeps the task listed, and clears it when reopened', async () => {
    mocks.api.delete.mockRejectedValue(apiError(403, 'Only organization admins can delete tasks'));
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Delete task Task h1' }));
    const dialog = card('Delete Task');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Task' }));

    expect(await within(dialog).findByText('Only organization admins can delete tasks')).not.toBeNull();
    expect(screen.getAllByText('Only organization admins can delete tasks')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Delete task Task h1' })).not.toBeNull(); // row still listed

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete task Task h1' }));
    expect(within(card('Delete Task')).queryByRole('alert')).toBeNull();
  });
});

describe('Task dialogs: errors stay inside the dialog', () => {
  const openAdd = async (): Promise<HTMLElement> => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    return card('Create Deliverable Task');
  };

  it('create: a server validation error appears in the dialog; it stays open with the typed values; retry succeeds', async () => {
    mocks.api.post
      .mockRejectedValueOnce(apiError(400, 'Estimated cost must be a non-negative amount'))
      .mockResolvedValueOnce({ data: {} });
    renderPage();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByPlaceholderText('Database indexing & optimization'), {
      target: { value: '  New work ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Task' }));

    expect(await within(dialog).findByText('Estimated cost must be a non-negative amount')).not.toBeNull();
    expect(screen.getAllByText('Estimated cost must be a non-negative amount')).toHaveLength(1);
    expect(dialogOpen('Create Deliverable Task')).toBe(true);
    expect((within(dialog).getByPlaceholderText('Database indexing & optimization') as HTMLInputElement).value).toBe(
      '  New work ',
    );

    const loadsBefore = taskCalls();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Task' }));
    await waitFor(() => expect(dialogOpen('Create Deliverable Task')).toBe(false));
    expect(mocks.api.post).toHaveBeenLastCalledWith('/tasks', {
      title: 'New work',
      description: '',
      status: 'TODO',
      priority: 'MEDIUM',
      estimatedCost: '15000.00',
      projectId: 'p-1',
    });
    expect(taskCalls()).toBe(loadsBefore + 1);
  });

  it('create: client-side validation shows in the dialog and sends nothing', async () => {
    renderPage();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByPlaceholderText('Database indexing & optimization'), {
      target: { value: 'Valid title' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('25000.00'), { target: { value: 'abc' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Task' }));

    expect(within(dialog).getByRole('alert').textContent).toMatch(/Estimated cost must be a non-negative amount/);
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('create: the error is gone when the dialog is closed and reopened', async () => {
    mocks.api.post.mockRejectedValue(apiError(500, 'stack trace goes here'));
    renderPage();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByPlaceholderText('Database indexing & optimization'), {
      target: { value: 'Work' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Task' }));
    // technical failures are translated, never shown raw
    expect(await within(dialog).findByText('Something went wrong on the server. Please try again.')).not.toBeNull();
    expect(screen.queryByText(/stack trace/)).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    expect(within(card('Create Deliverable Task')).queryByRole('alert')).toBeNull();
  });

  it('edit: still works - saves trimmed values, closes and refreshes', async () => {
    mocks.api.patch.mockResolvedValue({ data: {} });
    renderPage();
    await ready();
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    const dialog = card('Edit Task Deliverable');
    fireEvent.change(within(dialog).getByDisplayValue('Task h1'), { target: { value: ' Task h1 renamed ' } });
    const loadsBefore = taskCalls();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(dialogOpen('Edit Task Deliverable')).toBe(false));
    expect(mocks.api.patch).toHaveBeenCalledWith('/tasks/h1', {
      title: 'Task h1 renamed',
      description: '',
      status: 'TODO',
      priority: 'HIGH',
      estimatedCost: '400000.00',
    });
    expect(taskCalls()).toBe(loadsBefore + 1);
  });

  it('edit: a server error stays inside the dialog and the dialog stays open', async () => {
    mocks.api.patch.mockRejectedValue(apiError(400, 'Task title must not be empty'));
    renderPage();
    await ready();
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    const dialog = card('Edit Task Deliverable');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    expect(await within(dialog).findByText('Task title must not be empty')).not.toBeNull();
    expect(screen.getAllByText('Task title must not be empty')).toHaveLength(1);
    expect(dialogOpen('Edit Task Deliverable')).toBe(true);
  });

  it('prevents a duplicate submission while the request is pending', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mocks.api.post.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByPlaceholderText('Database indexing & optimization'), {
      target: { value: 'Once' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Task' }));
    const busy = within(dialog).getByRole('button', { name: 'Saving...' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    // The mutation starts the request a tick after the click; a second click must not add another
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledTimes(1));
    resolve({ data: {} });
    await waitFor(() => expect(dialogOpen('Create Deliverable Task')).toBe(false));
  });
});
