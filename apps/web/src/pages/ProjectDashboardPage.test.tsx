import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Organization } from '../context/AuthContext';
import { ProjectDashboardPage } from './ProjectDashboardPage';

const mocks = vi.hoisted(() => ({
  auth: {} as { currentOrg: Organization },
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/api', () => ({ api: mocks.api }));

const org: Organization = {
  id: 'org-1',
  name: 'Abyssinia Technologies PLC',
  slug: 'abyssinia-tech',
  role: 'ADMIN',
  createdAt: '2026-11-17T00:00:00.000Z',
};

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

const TASKS = [
  task('h1', 'HIGH', '250000.00'),
  task('h2', 'HIGH', '150000.00'),
  task('m1', 'MEDIUM', '100000.00'),
  task('m2', 'MEDIUM', '50000.00'),
  task('l1', 'LOW', '20000.00'),
  task('l2', 'LOW', '1500.00'),
];

/** Text of the KPI card with the given label. */
const kpi = (label: string): string => screen.getByText(label).nextElementSibling?.textContent ?? '';
const rowCount = (): number => screen.queryAllByText(/^Task (h|m|l)\d$/).length;
const choose = (value: string): void => {
  const priorityFilter = screen.getByRole('option', { name: 'All Priorities' }).parentElement as HTMLSelectElement;
  fireEvent.change(priorityFilter, { target: { value } });
};

describe('ProjectDashboardPage budget figures vs. the priority filter', () => {
  beforeEach(() => {
    mocks.api.get.mockReset();
    mocks.auth.currentOrg = org;
    mocks.api.get.mockImplementation(async (url: string) => {
      if (url.startsWith('/projects')) return { data: [project] };
      if (url.startsWith('/tasks')) return { data: TASKS };
      throw new Error(`unexpected GET ${url}`);
    });
  });
  afterEach(cleanup);

  it('keeps Estimated Cost, Remaining and Allocated % identical for every filter, while rows change', async () => {
    render(
      <MemoryRouter>
        <ProjectDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(rowCount()).toBe(6));

    // 571,500 of 750,000 = 76.2%, regardless of the filter
    const expectTotals = (): void => {
      expect(kpi('Estimated Task Cost (ETB)')).toMatch(/571,500\.00/);
      expect(kpi('Remaining Budget (ETB)')).toMatch(/178,500\.00/);
      expect(kpi('Budget Allocated')).toBe('76.2%');
      expect(kpi('Project Budget (ETB)')).toMatch(/750,000\.00/);
    };
    expectTotals();

    choose('HIGH');
    expect(rowCount()).toBe(2);
    expectTotals();

    choose('MEDIUM');
    expect(rowCount()).toBe(2);
    expectTotals();

    choose('LOW');
    expect(rowCount()).toBe(2);
    expectTotals();

    choose('ALL');
    expect(rowCount()).toBe(6);
    expectTotals();
  });

  it('shows the filtered task count and the empty state without touching the totals', async () => {
    mocks.api.get.mockImplementation(async (url: string) => {
      if (url.startsWith('/projects')) return { data: [project] };
      return { data: [task('h1', 'HIGH', '250000.00')] };
    });
    render(
      <MemoryRouter>
        <ProjectDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(rowCount()).toBe(1));

    choose('LOW');
    expect(rowCount()).toBe(0);
    expect(screen.getByText(/No tasks found with priority "LOW"/)).not.toBeNull();
    expect(kpi('Estimated Task Cost (ETB)')).toMatch(/250,000\.00/);
    expect(kpi('Budget Allocated')).toBe('33.3%');
  });

  it('loads the complete task list once and never asks the server for a filtered subset', async () => {
    render(
      <MemoryRouter>
        <ProjectDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(rowCount()).toBe(6));
    choose('HIGH');
    choose('LOW');

    const taskCalls = mocks.api.get.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith('/tasks'));
    expect(taskCalls).toEqual(['/tasks?projectId=p-1']);
    expect(within(document.body).queryByText('Project Tasks')).not.toBeNull();
  });
});
