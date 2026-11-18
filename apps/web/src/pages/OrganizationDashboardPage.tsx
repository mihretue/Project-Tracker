import React, { useState, useEffect, FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  FolderKanban,
  Coins,
  Shield,
  Plus,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  UserPlus,
  Loader2,
  Users,
} from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { useAuth, Organization } from '../context/AuthContext';
import { api } from '../services/api';
import axios from 'axios';

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
  tasks?: Array<{ id: string }>;
}

export const OrganizationDashboardPage: React.FC = () => {
  const { currentOrg, organizations, switchOrganization, addOrganization } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [members, setMembers] = useState<MemberView[]>([]);
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const loadData = async (): Promise<void> => {
    if (!currentOrg) return;
    setIsLoadingData(true);
    setActionError(null);
    try {
      const [membersRes, projectsRes] = await Promise.all([
        api.get<MemberView[]>(`/organizations/${currentOrg.id}/members`),
        api.get<ProjectView[]>(`/projects?organizationId=${currentOrg.id}`),
      ]);
      setMembers(membersRes.data);
      setProjects(projectsRes.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        setActionError(String(err.response.data.message));
      } else {
        setActionError('Failed to load organization data.');
      }
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [currentOrg?.id]);

  // Sidebar "Create Organization" link navigates here asking for the form to open
  useEffect(() => {
    const state = location.state as { openCreateOrg?: boolean } | null;
    if (state?.openCreateOrg) {
      openCreateOrg();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state]);

  const handleAddMember = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!currentOrg) return;
    setIsSubmitting(true);
    setActionError(null);

    try {
      await api.post(`/organizations/${currentOrg.id}/members`, {
        email: newMemberEmail,
        role: newMemberRole,
      });
      setShowAddMember(false);
      setNewMemberEmail('');
      await loadData();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        setActionError(String(err.response.data.message));
      } else {
        setActionError('Failed to add member.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateProject = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!currentOrg) return;
    setIsSubmitting(true);
    setActionError(null);

    try {
      await api.post('/projects', {
        name: newProjectName,
        description: newProjectDesc,
        budget: newProjectBudget,
        organizationId: currentOrg.id,
      });
      setShowAddProject(false);
      setNewProjectName('');
      setNewProjectDesc('');
      setNewProjectBudget('100000.00');
      await loadData();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        setActionError(String(err.response.data.message));
      } else {
        setActionError('Failed to create project.');
      }
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
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{currentOrg.name}</h1>
          <p className="page-subtitle">
            Tenant ID: <code style={{ color: '#93c5fd' }}>{currentOrg.id}</code> | Slug:{' '}
            <code style={{ color: '#93c5fd' }}>{currentOrg.slug}</code>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Tenant Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={18} style={{ color: 'var(--accent-primary)' }} />
            <select
              value={currentOrg.id}
              onChange={(e) => switchOrganization(e.target.value)}
              className="form-input"
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.role})
                </option>
              ))}
            </select>
          </div>

          <button onClick={openCreateOrg} className="btn btn-outline" style={{ fontSize: '0.85rem' }}>
            <Building2 size={15} />
            <span>New Organization</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setShowAddProject(true)}
              className="btn btn-primary"
              style={{ fontSize: '0.85rem' }}
            >
              <Plus size={16} />
              <span>New Project</span>
            </button>
          )}
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

      {/* KPI Stats */}
      <div className="grid-cards">
        <StatCard
          label="Your Tenant Role"
          value={currentOrg.role}
          icon={<Shield size={22} />}
          iconBgColor={isAdmin ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)'}
          iconColor={isAdmin ? '#fbbf24' : '#60a5fa'}
        />
        <StatCard
          label="Team Members"
          value={members.length}
          icon={<Users size={22} />}
          iconBgColor="rgba(59, 130, 246, 0.15)"
          iconColor="#60a5fa"
        />
        <StatCard
          label="Total Projects"
          value={projects.length}
          icon={<FolderKanban size={22} />}
          iconBgColor="rgba(168, 85, 247, 0.15)"
          iconColor="#c084fc"
        />
        <StatCard
          label="Total Budget (ETB)"
          value={formatETB(totalBudgetETB)}
          icon={<Coins size={22} />}
          iconBgColor="rgba(16, 185, 129, 0.15)"
          iconColor="#34d399"
        />
      </div>

      {/* Projects Section */}
      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Organization Projects
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Isolated and accessible only to members of {currentOrg.name}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddProject(true)}
              className="btn btn-outline"
              style={{ fontSize: '0.85rem' }}
            >
              <Plus size={14} />
              <span>Add Project</span>
            </button>
          )}
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
            {projects.map((project) => (
              <div key={project.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <span className="badge badge-etb">{formatETB(project.budget)}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {project.tasks?.length || 0} tasks
                  </span>
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  {project.name}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem', minHeight: '40px' }}>
                  {project.description || 'No description provided.'}
                </p>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    <TrendingUp size={14} />
                    <span>ETB Budget Tracking</span>
                  </div>
                  <Link
                    to="/projects"
                    state={{ projectId: project.id }}
                    style={{
                      color: 'var(--accent-primary)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <span>Tasks</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Organization Members */}
      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Team Members & Roles
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Authorized accounts with access to this tenant boundary
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddMember(true)}
              className="btn btn-outline"
              style={{ fontSize: '0.85rem' }}
            >
              <UserPlus size={14} />
              <span>Add Member</span>
            </button>
          )}
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Member Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>
                    {m.user.firstName} {m.user.lastName}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{m.user.email}</td>
                  <td>
                    <span className={`badge ${m.role === 'ADMIN' ? 'badge-admin' : 'badge-member'}`}>
                      {m.role}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
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
                  onClick={() => setShowAddMember(false)}
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
                  onClick={() => setShowAddProject(false)}
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

      {/* Modal: Create Organization */}
      {createOrgModal}
    </div>
  );
};
