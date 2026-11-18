import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Organization } from '../context/AuthContext';
import { OrganizationDashboardPage } from './OrganizationDashboardPage';

const mocks = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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

const task = (id: string, status: string, cost: string) => ({ id, status, estimatedCost: cost });
const projects = [
  {
    id: 'p-1',
    name: 'Mobile Banking Platform',
    description: 'Core transaction processing',
    budget: '750000.00',
    currency: 'ETB',
    organizationId: 'org-1',
    tasks: [
      task('t1', 'COMPLETED', '100000.00'),
      task('t2', 'IN_PROGRESS', '117500.00'),
      task('t3', 'TODO', '50000.00'),
      task('t4', 'TODO', '50000.00'),
    ],
  },
  {
    id: 'p-2',
    name: 'Finished Work',
    description: null,
    budget: '10000.00',
    currency: 'ETB',
    organizationId: 'org-1',
    tasks: [task('t5', 'COMPLETED', '12000.00')],
  },
];
const members = [
  {
    id: 'm-1',
    userId: 'u-1',
    role: 'ADMIN',
    createdAt: '2026-11-17T00:00:00.000Z',
    user: { id: 'u-1', email: 'admin@abyssinia.test', firstName: 'Abebe', lastName: 'Bikila' },
  },
  {
    id: 'm-2',
    userId: 'u-2',
    role: 'MEMBER',
    createdAt: '2026-11-17T00:00:00.000Z',
    user: { id: 'u-2', email: 'member@abyssinia.test', firstName: 'Derartu', lastName: 'Tulu' },
  },
];

const stat = (label: string) => screen.getByText(label).closest('.stat-info') as HTMLElement;
const caption = (label: string): string => within(stat(label)).getByText((_, el) => el?.className === 'stat-caption').textContent ?? '';
const rows = (): string[] =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.textContent ?? '');

const renderPage = async () => {
  render(
    <MemoryRouter>
      <OrganizationDashboardPage />
    </MemoryRouter>,
  );
  await screen.findByText('Derartu Tulu');
};

beforeEach(() => {
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.api.get.mockImplementation(async (url: string) => ({ data: url.includes('/members') ? members : projects }));
  mocks.auth.user = { id: 'u-1' };
  mocks.auth.currentOrg = org;
  mocks.auth.addOrganization = vi.fn();
  mocks.auth.refreshOrganizations = vi.fn();
});
afterEach(cleanup);

describe('Organization overview: figures come from real data', () => {
  it('shows breadcrumb, tenant identity and the stat strip with derived captions', async () => {
    await renderPage();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toMatch(/Abyssinia Technologies PLC.*Organization Overview/);
    expect(screen.getByText('abyssinia-tech')).not.toBeNull();
    expect(screen.getByText(/Tenant boundary isolated/)).not.toBeNull();

    expect(stat('Your Tenant Role').textContent).toMatch(/Admin/);
    expect(caption('Team Members')).toBe('1 Admin · 1 Member');
    expect(caption('Total Projects')).toBe('2 of 5 tasks completed');
    // used = 100000 + 117500 + 50000 + 50000 + 12000 = 329,500 of 760,000 (43%)
    expect(caption('Total Budget (ETB)')).toMatch(/329,500\.00 utilized \(43%\)/);
  });

  it('project cards show a budget progress bar, tasks done, and Active/Completed status', async () => {
    await renderPage();
    const bar = screen.getByRole('progressbar', { name: 'Budget used for Mobile Banking Platform' });
    expect(bar.getAttribute('aria-valuenow')).toBe('42'); // 317,500 / 750,000 = 42.3%
    expect(screen.getByText('1/4 tasks done')).not.toBeNull();
    expect(screen.getAllByText('Active')).toHaveLength(1);
    expect(screen.getAllByText('Completed')).toHaveLength(1);

    const over = screen.getByRole('progressbar', { name: 'Budget used for Finished Work' });
    expect(over.getAttribute('aria-valuenow')).toBe('100'); // capped, 12,000 of 10,000
    expect(over.firstElementChild?.className).toMatch(/is-over/);
  });

  it('does not invent controls the API cannot serve (no delete-member, no assigned-tasks column)', async () => {
    await renderPage();
    expect(screen.queryByRole('button', { name: /remove|delete member/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /assigned tasks/i })).toBeNull();
  });
});

describe('Members table', () => {
  it('marks the signed-in user and offers promote/demote per row to admins', async () => {
    await renderPage();
    expect(screen.getByText('(You)')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Change role of Abebe Bikila' }).textContent).toBe('Demote to Member');
    expect(screen.getByRole('button', { name: 'Change role of Derartu Tulu' }).textContent).toBe('Promote to Admin');
  });

  it('filters by role segment and by search text, with an empty state', async () => {
    await renderPage();
    expect(rows()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Admins' }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatch(/Abebe/);

    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    expect(rows()[0]).toMatch(/Derartu/);

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Filter members'), { target: { value: 'ABEBE' } });
    expect(rows()).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Filter members'), { target: { value: 'nobody' } });
    expect(rows()[0]).toMatch(/No members match the current filter/);
  });

  it('a MEMBER sees the table without the Manage column or any role action', async () => {
    mocks.auth.currentOrg = { ...org, role: 'MEMBER' };
    await renderPage();
    expect(screen.queryByRole('columnheader', { name: 'Manage' })).toBeNull();
    expect(screen.queryByRole('button', { name: /change role/i })).toBeNull();
    expect(stat('Your Tenant Role').textContent).toMatch(/Member/);
  });
});
