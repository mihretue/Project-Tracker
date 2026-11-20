import React, { useState, useEffect, FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  FolderKanban,
  Shield,
  User as UserIcon,
  Plus,
  ArrowRight,
  ChevronRight,
  AlertCircle,
  UserPlus,
  Loader2,
  Edit2,
  Trash2,
  Copy,
  Search,
} from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { SidebarToggle } from '../components/SidebarToggle';
import { DialogError } from '../components/DialogError';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth, Organization } from '../context/AuthContext';
import { api } from '../services/api';
import axios from 'axios';
import { describeApiError } from '../services/errors';
import { validateProjectInput } from '../services/validation';
import { queryKeys, useMembers, useProjects } from '../services/queries';

interface MemberView {
  id: string;
  userId: string;
  role: 'ADMIN' | 'MEMBER';
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

interface ProjectView {
  id: string;
  name: string;
  description: string | null;
  budget: string;
  currency: string;
  organizationId: string;
  tasks?: Array<{ id: string; status?: string; estimatedCost?: string }>;
}

/** Shown in place of a number while its data is still loading, so a pending request never reads as 0. */
const LOADING_VALUE = '…';

export const OrganizationDashboardPage: React.FC = () => {
  const { user, currentOrg, addOrganization, refreshOrganizations } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const membersQuery = useMembers<MemberView>(currentOrg?.id);
  const projectsQuery = useProjects<ProjectView>(currentOrg?.id);
  const members = membersQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const isLoadingMembers = membersQuery.isLoading;
  const isLoadingData = isLoadingMembers || projectsQuery.isLoading;
  const loadError = membersQuery.error ?? projectsQuery.error;
  const actionError: string | null = loadError
    ? axios.isAxiosError(loadError) && loadError.response?.data?.message
      ? String(loadError.response.data.message)
      : 'Failed to load organization data.'
    : null;

  const invalidateMembers = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: queryKeys.members(currentOrg?.id) });
  // Also refreshes the sidebar's project list: it reads the same cache entry
  const invalidateProjects = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentOrg?.id) });

  const addMember = useMutation({
    mutationFn: ({ orgId, body }: { orgId: string; body: Record<string, unknown> }) =>
      api.post(`/organizations/${orgId}/members`, body),
  });
  const changeRole = useMutation({
    mutationFn: ({ orgId, userId, role }: { orgId: string; userId: string; role: string }) =>
      api.patch(`/organizations/${orgId}/members/${userId}`, { role }),
  });
  const createProject = useMutation({ mutationFn: (body: Record<string, unknown>) => api.post('/projects', body) });
  const updateProject = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/projects/${id}`, body),
  });
  const deleteProject = useMutation({ mutationFn: (id: string) => api.delete(`/projects/${id}`) });

  // Modals / Form toggles
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');

  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectBudget, setNewProjectBudget] = useState('100000.00');

  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);

  // Admin management dialogs. Only one dialog is open at a time, so they share one in-dialog error.
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectView | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [editProjectBudget, setEditProjectBudget] = useState('');
  const [deletingProject, setDeletingProject] = useState<ProjectView | null>(null);
  const [roleTarget, setRoleTarget] = useState<MemberView | null>(null);
  const [roleValue, setRoleValue] = useState<'ADMIN' | 'MEMBER'>('MEMBER');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Member table filters (client-side)
  const [memberQuery, setMemberQuery] = useState('');
  const [memberFilter, setMemberFilter] = useState<'ALL' | 'ADMIN' | 'MEMBER'>('ALL');

  const openAddMember = (): void => {
    setDialogError(null);
    setShowAddMember(true);
  };
  const closeAddMember = (): void => {
    setDialogError(null);
    setShowAddMember(false);
  };
  const openAddProject = (): void => {
    setDialogError(null);
    setShowAddProject(true);
  };
  const closeAddProject = (): void => {
    setDialogError(null);
    setShowAddProject(false);
  };
  const openEditProject = (p: ProjectView): void => {
    setDialogError(null);
    setEditProjectName(p.name);
    setEditProjectDescription(p.description ?? '');
    setEditProjectBudget(p.budget);
    setEditingProject(p);
  };
  const closeEditProject = (): void => {
    setDialogError(null);
    setEditingProject(null);
  };
  const openDeleteProject = (p: ProjectView): void => {
    setDialogError(null);
    setDeletingProject(p);
  };
  const closeDeleteProject = (): void => {
    setDialogError(null);
    setDeletingProject(null);
  };
  const openChangeRole = (m: MemberView): void => {
    setDialogError(null);
    // The row action offers the opposite role ("Promote to Admin" / "Demote to Member")
    setRoleValue(m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN');
    setRoleTarget(m);
  };
  const closeChangeRole = (): void => {
    setDialogError(null);
    setRoleTarget(null);
  };

  // The create-organization dialog always opens and closes with a clean form
  const resetCreateOrgForm = (): void => {
    setNewOrgName('');
    setCreateOrgError(null);
  };
  const openCreateOrg = (): void => {
    resetCreateOrgForm();
    setShowCreateOrg(true);
  };
  const closeCreateOrg = (): void => {
    resetCreateOrgForm();
    setShowCreateOrg(false);
  };

  // Sidebar "Create Organization" link navigates here asking for the form to open
  useEffect(() => {
    const state = location.state as { openCreateOrg?: boolean; openAddProject?: boolean } | null;
    if (state?.openCreateOrg) {
      openCreateOrg();
      navigate(location.pathname, { replace: true, state: null });
    } else if (state?.openAddProject) {
      // Sidebar "+" next to Projects; only admins can create projects
      if (currentOrg?.role === 'ADMIN') openAddProject();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state]);

  const handleAddMember = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!currentOrg || isSubmitting) return;
    setIsSubmitting(true);
    setDialogError(null);

    try {
      await addMember.mutateAsync({
        orgId: currentOrg.id,
        body: { email: newMemberEmail.trim(), role: newMemberRole },
      });
      closeAddMember();
      setNewMemberEmail('');
      await invalidateMembers();
    } catch (err: unknown) {
      setDialogError(describeApiError(err, 'Failed to add member.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateProject = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!currentOrg || isSubmitting) return;
    const invalid = validateProjectInput(newProjectName, newProjectBudget);
    if (invalid) {
      setDialogError(invalid);
      return;
    }
    setIsSubmitting(true);
    setDialogError(null);

    try {
      await createProject.mutateAsync({
        name: newProjectName.trim(),
        description: newProjectDesc,
        budget: newProjectBudget.trim(),
        organizationId: currentOrg.id,
      });
      closeAddProject();
      setNewProjectName('');
      setNewProjectDesc('');
      setNewProjectBudget('100000.00');
      await invalidateProjects();
    } catch (err: unknown) {
      setDialogError(describeApiError(err, 'Failed to create project.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditProject = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!editingProject || isSubmitting) return;
    const invalid = validateProjectInput(editProjectName, editProjectBudget);
    if (invalid) {
      setDialogError(invalid);
      return;
    }
    setIsSubmitting(true);
    setDialogError(null);

    try {
      await updateProject.mutateAsync({
        id: editingProject.id,
        body: {
          name: editProjectName.trim(),
          description: editProjectDescription,
          budget: editProjectBudget.trim(),
        },
      });
      closeEditProject();
      await invalidateProjects();
    } catch (err: unknown) {
      setDialogError(describeApiError(err, 'Failed to update project.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async (): Promise<void> => {
    if (!deletingProject || isSubmitting) return;
    setIsSubmitting(true);
    setDialogError(null);

    try {
      await deleteProject.mutateAsync(deletingProject.id);
      closeDeleteProject();
      await invalidateProjects();
    } catch (err: unknown) {
      setDialogError(describeApiError(err, 'Failed to delete project.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeRole = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!currentOrg || !roleTarget || isSubmitting) return;
    if (roleValue !== 'ADMIN' && roleValue !== 'MEMBER') {
      setDialogError('Role must be either ADMIN or MEMBER.');
      return;
    }
    setIsSubmitting(true);
    setDialogError(null);

    try {
      await changeRole.mutateAsync({ orgId: currentOrg.id, userId: roleTarget.userId, role: roleValue });
      const changedOwnRole = roleTarget.userId === user?.id;
      closeChangeRole();
      await invalidateMembers();
      // Own role changed: re-read memberships so the page's permissions follow the server
      if (changedOwnRole) {
        await refreshOrganizations();
      }
    } catch (err: unknown) {
      setDialogError(describeApiError(err, 'Failed to change the member role.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateOrg = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setIsSubmitting(true);
    setCreateOrgError(null);

    try {
      const slug = newOrgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // The creator becomes ADMIN server-side; the response already carries that role
      const res = await api.post<Organization>('/organizations', {
        name: newOrgName,
        slug: slug || `org-${Date.now()}`,
      });
      closeCreateOrg();
      // Make the new organization selectable and switch to it
      addOrganization(res.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setCreateOrgError('An organization with a similar name already exists. Try a different name.');
      } else if (axios.isAxiosError(err) && err.response?.data?.message) {
        const msg = err.response.data.message;
        setCreateOrgError(Array.isArray(msg) ? msg.join(', ') : String(msg));
      } else {
        setCreateOrgError('Failed to create organization.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const createOrgModal =
    showCreateOrg ? (
      <div className="auth-wrapper" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100 }}>
        <div className="auth-card" style={{ maxWidth: 450 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Create New Organization</h2>
          {createOrgError && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.6rem 0.85rem',
                marginBottom: '1rem',
                color: '#f87171',
                fontSize: '0.85rem',
              }}
            >
              {createOrgError}
            </div>
          )}
          <form onSubmit={handleCreateOrg}>
            <div className="form-group">
              <label className="form-label">Organization Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Digital Innovations LLC"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="button" onClick={closeCreateOrg} className="btn btn-outline" style={{ flex: 1 }}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  const formatETB = (val: string | number): string => {
    const num = typeof val === 'number' ? val : parseFloat(val || '0');
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(num);
  };

  const totalBudgetETB = projects.reduce((acc, p) => acc + parseFloat(p.budget || '0'), 0);
  const allTasks = projects.flatMap((p) => p.tasks ?? []);
  const completedTasks = allTasks.filter((t) => t.status === 'COMPLETED').length;
  const usedBudgetETB = allTasks.reduce((acc, t) => acc + parseFloat(t.estimatedCost || '0'), 0);
  const utilizationPct = totalBudgetETB > 0 ? Math.round((usedBudgetETB / totalBudgetETB) * 100) : 0;
  const adminCount = members.filter((m) => m.role === 'ADMIN').length;
  const memberCount = members.length - adminCount;
  const initials = (first: string, last: string): string => `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  const visibleMembers = members.filter((m) => {
    if (memberFilter !== 'ALL' && m.role !== memberFilter) return false;
    const q = memberQuery.trim().toLowerCase();
    if (!q) return true;
    return `${m.user.firstName} ${m.user.lastName} ${m.user.email}`.toLowerCase().includes(q);
  });
  const copyTenantId = (): void => {
    void navigator.clipboard?.writeText(currentOrg?.id ?? '').catch(() => undefined);
  };

  if (!currentOrg) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <h2>No Organization Found</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '1rem 0' }}>
          You do not belong to any organization yet. Create one to get started; you will be its administrator.
        </p>
        <button onClick={openCreateOrg} className="btn btn-primary">
          <Plus size={16} />
          <span>Create an Organization</span>
        </button>
        {createOrgModal}
      </div>
    );
  }

  const isAdmin = currentOrg.role === 'ADMIN';

  return (
    <div>
      {/* Top bar: breadcrumb + primary actions */}
      <div className="page-topbar">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <SidebarToggle />
          <span className="breadcrumb-org">{currentOrg.name}</span>
          <ChevronRight size={14} />
          <span aria-current="page">Organization Overview</span>
        </nav>
        <div className="page-topbar-actions">
          <button onClick={openCreateOrg} className="btn btn-outline" style={{ fontSize: '0.85rem' }}>
            <Building2 size={15} />
            <span>New Organization</span>
          </button>

          {isAdmin && (
            <button onClick={openAddProject} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
              <Plus size={16} />
              <span>New Project</span>
            </button>
          )}
        </div>
      </div>

      {/* Title and tenant identity */}
      <div className="page-heading">
        <h1 className="page-title">{currentOrg.name}</h1>
        <div className="page-meta">
          <div className="page-meta-left">
            <span>
              Slug: <code>{currentOrg.slug}</code>
            </span>
            <span className="meta-dot" aria-hidden="true">
              {'\u00b7'}
            </span>
            <span>
              Tenant ID: <code>{currentOrg.id}</code>
            </span>
            <button type="button" className="icon-ghost-btn" onClick={copyTenantId} aria-label="Copy tenant ID" title="Copy tenant ID">
              <Copy size={13} />
            </button>
          </div>
          <div className="page-meta-right">
            Created {new Date(currentOrg.createdAt).toLocaleDateString()} {'\u00b7'} Tenant boundary isolated
          </div>
        </div>
      </div>

      {actionError && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#f87171',
            fontSize: '0.85rem',
          }}
        >
          <AlertCircle size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {/* KPI strip */}
      <div className="stat-strip">
        <StatCard
          label="Your Tenant Role"
          value={isAdmin ? 'Admin' : 'Member'}
          icon={<Shield size={18} />}
          iconColor={isAdmin ? '#2563eb' : '#64748b'}
          caption={isAdmin ? 'Full project & member governance' : 'View projects, manage tasks'}
        />
        <StatCard
          label="Team Members"
          value={isLoadingMembers ? LOADING_VALUE : members.length}
          caption={isLoadingMembers ? undefined : `${adminCount} Admin \u00b7 ${memberCount} Member`}
        />
        <StatCard
          label="Total Projects"
          value={projectsQuery.isLoading ? LOADING_VALUE : projects.length}
          caption={projectsQuery.isLoading ? undefined : `${completedTasks} of ${allTasks.length} tasks completed`}
        />
        <StatCard
          label="Total Budget (ETB)"
          value={projectsQuery.isLoading ? LOADING_VALUE : formatETB(totalBudgetETB)}
          caption={projectsQuery.isLoading ? undefined : `${formatETB(usedBudgetETB)} allocated (estimated) · ${utilizationPct}% of budget`}
        />
      </div>

      {/* Projects Section */}
      <div className="section">
        <div className="section-head">
          <div>
            <h2 className="section-title">Organization Projects</h2>
            <p className="section-sub">Isolated and accessible strictly to members of {currentOrg.name}</p>
          </div>
          <div className="section-actions">
            <Link to="/projects" className="text-link">
              View all
            </Link>
            {isAdmin && (
              <button onClick={openAddProject} className="btn btn-outline" style={{ fontSize: '0.85rem' }}>
                <Plus size={14} />
                <span>Add Project</span>
              </button>
            )}
          </div>
        </div>

        {isLoadingData ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 0.5rem auto' }} />
            <span>Loading projects...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
            <FolderKanban size={36} style={{ margin: '0 auto 0.75rem auto', color: 'var(--text-muted)' }} />
            <h3>No projects in this organization yet</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {isAdmin ? 'Click "New Project" to create your first tenant project.' : 'Only admins can create projects.'}
            </p>
          </div>
        ) : (
          <div className="grid-cards">
            {projects.map((project) => {
              const tasks = project.tasks ?? [];
              const done = tasks.filter((t) => t.status === 'COMPLETED').length;
              const used = tasks.reduce((acc, t) => acc + parseFloat(t.estimatedCost || '0'), 0);
              const budget = parseFloat(project.budget || '0');
              const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
              const overBudget = budget > 0 && used > budget;
              const isDone = tasks.length > 0 && done === tasks.length;
              return (
                <div key={project.id} className="card project-card">
                  <div className="project-card-head">
                    <h3 className="project-card-title">{project.name}</h3>
                    <span className={`status-chip ${isDone ? 'is-done' : 'is-active'}`}>{isDone ? 'Completed' : 'Active'}</span>
                  </div>
                  <p className="project-card-desc">{project.description || 'No description provided.'}</p>

                  <div className="budget-row">
                    <span>Estimated budget allocation</span>
                    <span className="mono">
                      {formatETB(used)} <span className="budget-total">/ {formatETB(budget)}</span>
                    </span>
                  </div>
                  <div
                    className="progress"
                    role="progressbar"
                    aria-label={`Estimated budget allocation for ${project.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                  >
                    <div className={`progress-fill ${overBudget ? 'is-over' : ''}`} style={{ width: `${pct}%` }} />
                  </div>

                  <div className="project-card-foot">
                    <span className="muted-small">
                      {done}/{tasks.length} tasks done
                    </span>
                    <div className="project-card-actions">
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditProject(project)}
                            className="ghost-action"
                            aria-label={`Edit project ${project.name}`}
                          >
                            <Edit2 size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteProject(project)}
                            className="ghost-action is-danger"
                            aria-label={`Delete project ${project.name}`}
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        </>
                      )}
                      <Link to="/projects" state={{ projectId: project.id }} className="text-link">
                        <span>Open Tasks</span>
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Organization Members */}
      <div className="section">
        <div className="section-head">
          <div>
            <h2 className="section-title">Team Members & Roles</h2>
            <p className="section-sub">Authorized accounts with access to this tenant boundary</p>
          </div>
          <div className="section-actions">
            <label className="search-field">
              <Search size={15} />
              <input
                type="search"
                placeholder="Filter members..."
                aria-label="Filter members"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
              />
            </label>
            <div className="segmented" role="group" aria-label="Filter by role">
              {(
                [
                  ['ALL', 'All'],
                  ['ADMIN', 'Admins'],
                  ['MEMBER', 'Members'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={memberFilter === value ? 'is-selected' : ''}
                  aria-pressed={memberFilter === value}
                  onClick={() => setMemberFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {isAdmin && (
              <button onClick={openAddMember} className="btn btn-outline" style={{ fontSize: '0.85rem' }}>
                <UserPlus size={14} />
                <span>Add Member</span>
              </button>
            )}
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Member Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Manage</th>}
              </tr>
            </thead>
            <tbody>
              {isLoadingMembers && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }} role="status">
                    <Loader2 className="animate-spin" size={16} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                    Loading members...
                  </td>
                </tr>
              )}
              {!isLoadingMembers && visibleMembers.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No members match the current filter.
                  </td>
                </tr>
              )}
              {visibleMembers.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="member-cell">
                      <span className="avatar" aria-hidden="true">
                        {initials(m.user.firstName, m.user.lastName)}
                      </span>
                      <span className="member-name">
                        {m.user.firstName} {m.user.lastName}
                      </span>
                      {m.userId === user?.id && <span className="you-tag">(You)</span>}
                    </div>
                  </td>
                  <td className="mono muted-cell">{m.user.email}</td>
                  <td>
                    <span className={`role-label ${m.role === 'ADMIN' ? 'is-admin' : ''}`}>
                      {m.role === 'ADMIN' ? <Shield size={13} /> : <UserIcon size={13} />}
                      {m.role === 'ADMIN' ? 'Admin' : 'Member'}
                    </span>
                  </td>
                  <td className="mono muted-cell">{new Date(m.createdAt).toLocaleDateString()}</td>
                  {isAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => openChangeRole(m)}
                        className="link-action"
                        aria-label={`Change role of ${m.user.firstName} ${m.user.lastName}`}
                      >
                        {m.role === 'ADMIN' ? 'Demote to Member' : 'Promote to Admin'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add Member */}
      {showAddMember && (
        <div className="auth-wrapper" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100 }}>
          <div className="auth-card" style={{ maxWidth: 450 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Add Organization Member</h2>
            <DialogError message={dialogError} />
            <form onSubmit={handleAddMember}>
              <div className="form-group">
                <label className="form-label">User Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="colleague@domain.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-input"
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as 'ADMIN' | 'MEMBER')}
                >
                  <option value="MEMBER">MEMBER (View projects, manage tasks)</option>
                  <option value="ADMIN">ADMIN (Full organization management)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={closeAddMember}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                  {isSubmitting ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Project */}
      {showAddProject && (
        <div className="auth-wrapper" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100 }}>
          <div className="auth-card" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Create New Project</h2>
            <DialogError message={dialogError} />
            <form onSubmit={handleCreateProject}>
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enterprise Core Upgrade"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="High-level project scope..."
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">ETB Budget (Exact 2-decimal format)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="500000.00"
                  value={newProjectBudget}
                  onChange={(e) => setNewProjectBudget(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={closeAddProject}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Project */}
      {editingProject && (
        <div className="auth-wrapper" role="dialog" aria-label="Edit Project" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100 }}>
          <div className="auth-card" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Edit Project</h2>
            <DialogError message={dialogError} />
            <form onSubmit={handleEditProject}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-project-name">Project Name</label>
                <input
                  id="edit-project-name"
                  type="text"
                  className="form-input"
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-project-description">Description</label>
                <textarea
                  id="edit-project-description"
                  className="form-input"
                  rows={3}
                  placeholder="High-level project scope..."
                  value={editProjectDescription}
                  onChange={(e) => setEditProjectDescription(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-project-budget">ETB Budget (Exact 2-decimal format)</label>
                <input
                  id="edit-project-budget"
                  type="text"
                  className="form-input"
                  value={editProjectBudget}
                  onChange={(e) => setEditProjectBudget(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={closeEditProject} className="btn btn-outline" style={{ flex: 1 }} disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Project (confirmation) */}
      {deletingProject && (
        <ConfirmDialog
          title="Delete Project"
          message={
            <>
              Delete <strong>{deletingProject.name}</strong>? All of its tasks will be permanently deleted as well.
              This cannot be undone.
            </>
          }
          confirmLabel="Delete Project"
          busyLabel="Deleting..."
          isBusy={isSubmitting}
          error={dialogError}
          onConfirm={() => void handleDeleteProject()}
          onCancel={closeDeleteProject}
        />
      )}

      {/* Modal: Change Member Role */}
      {roleTarget && (
        <div className="auth-wrapper" role="dialog" aria-label="Change Member Role" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100 }}>
          <div className="auth-card" style={{ maxWidth: 450 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Change Member Role</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {roleTarget.user.firstName} {roleTarget.user.lastName} ({roleTarget.user.email})
            </p>
            <DialogError message={dialogError} />
            <form onSubmit={handleChangeRole}>
              <div className="form-group">
                <label className="form-label" htmlFor="member-role">Role</label>
                <select
                  id="member-role"
                  className="form-input"
                  value={roleValue}
                  onChange={(e) => setRoleValue(e.target.value === 'ADMIN' ? 'ADMIN' : 'MEMBER')}
                >
                  <option value="MEMBER">MEMBER (View projects, manage tasks)</option>
                  <option value="ADMIN">ADMIN (Full organization management)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="button" onClick={closeChangeRole} className="btn btn-outline" style={{ flex: 1 }} disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Organization */}
      {createOrgModal}
    </div>
  );
};
