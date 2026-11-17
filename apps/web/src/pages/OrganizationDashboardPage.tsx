import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  FolderKanban,
  Coins,
  Shield,
  Plus,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { StatCard } from '../components/StatCard';

interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
  userRole: 'ADMIN' | 'MEMBER';
  totalProjects: number;
  totalBudgetETB: number;
}

interface ProjectPreview {
  id: string;
  name: string;
  description: string;
  budgetETB: number;
  tasksCount: number;
}

const mockOrganizations: OrganizationItem[] = [
  {
    id: 'org-1-uuid',
    name: 'Addis Tech Solutions PLC',
    slug: 'addis-tech',
    userRole: 'ADMIN',
    totalProjects: 3,
    totalBudgetETB: 1250000.0,
  },
  {
    id: 'org-2-uuid',
    name: 'Habesha Digital Labs',
    slug: 'habesha-labs',
    userRole: 'MEMBER',
    totalProjects: 1,
    totalBudgetETB: 450000.0,
  },
];

const mockProjects: ProjectPreview[] = [
  {
    id: 'proj-1-uuid',
    name: 'Mobile Banking Portal Modernization',
    description: 'Upgrading the core mobile banking API and responsive client app',
    budgetETB: 650000.0,
    tasksCount: 12,
  },
  {
    id: 'proj-2-uuid',
    name: 'Enterprise ERP Invoicing Connector',
    description: 'Local tax compliant invoicing integration with real-time sync',
    budgetETB: 420000.0,
    tasksCount: 8,
  },
  {
    id: 'proj-3-uuid',
    name: 'Customer Support Telephony Bot',
    description: 'Automated voice and chat routing for multi-lingual contact centers',
    budgetETB: 180000.0,
    tasksCount: 5,
  },
];

export const OrganizationDashboardPage: React.FC = () => {
  const [selectedOrgId, setSelectedOrgId] = useState<string>(mockOrganizations[0].id);

  const currentOrg =
    mockOrganizations.find((org) => org.id === selectedOrgId) ||
    mockOrganizations[0];

  const formatETB = (amount: number): string => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Organization Dashboard</h1>
          <p className="page-subtitle">
            Manage your tenants, team permissions, and project portfolio
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Tenant Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={18} style={{ color: 'var(--accent-primary)' }} />
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="form-input"
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
            >
              {mockOrganizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.userRole})
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
            <Plus size={16} />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid-cards">
        <StatCard
          label="Active Tenant"
          value={currentOrg.name}
          icon={<Building2 size={22} />}
          iconBgColor="rgba(59, 130, 246, 0.15)"
          iconColor="#60a5fa"
        />
        <StatCard
          label="Your Tenant Role"
          value={currentOrg.userRole}
          icon={<Shield size={22} />}
          iconBgColor="rgba(245, 158, 11, 0.15)"
          iconColor="#fbbf24"
        />
        <StatCard
          label="Total Projects"
          value={currentOrg.totalProjects}
          icon={<FolderKanban size={22} />}
          iconBgColor="rgba(168, 85, 247, 0.15)"
          iconColor="#c084fc"
        />
        <StatCard
          label="Total Budget (ETB)"
          value={formatETB(currentOrg.totalBudgetETB)}
          icon={<Coins size={22} />}
          iconBgColor="rgba(16, 185, 129, 0.15)"
          iconColor="#34d399"
        />
      </div>

      {/* Projects Section */}
      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
              Projects in {currentOrg.name}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Projects owned exclusively by this tenant organization
            </p>
          </div>
          <Link to="/projects" className="btn btn-outline" style={{ fontSize: '0.85rem' }}>
            <span>View All Projects</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid-cards">
          {mockProjects.map((project) => (
            <div key={project.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <span className="badge badge-etb">
                  {formatETB(project.budgetETB)}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {project.tasksCount} tasks
                </span>
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>
                {project.name}
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem', minHeight: '40px' }}>
                {project.description}
              </p>
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  <TrendingUp size={14} />
                  <span>Budget Tracking Active</span>
                </div>
                <Link
                  to={`/projects`}
                  style={{
                    color: 'var(--accent-primary)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <span>Open</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Organization Members Placeholder */}
      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.5rem' }}>
          Organization Members & Access Control
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Users assigned to this tenant with ADMIN or MEMBER privileges
        </p>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Member Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Abebe Bikila</td>
                <td style={{ color: 'var(--text-secondary)' }}>abebe@addistech.et</td>
                <td><span className="badge badge-admin">ADMIN</span></td>
                <td><span style={{ color: '#34d399', fontSize: '0.85rem' }}>● Active</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Tigist Assefa</td>
                <td style={{ color: 'var(--text-secondary)' }}>tigist@addistech.et</td>
                <td><span className="badge badge-member">MEMBER</span></td>
                <td><span style={{ color: '#34d399', fontSize: '0.85rem' }}>● Active</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Mulugeta Haile</td>
                <td style={{ color: 'var(--text-secondary)' }}>mulugeta@addistech.et</td>
                <td><span className="badge badge-member">MEMBER</span></td>
                <td><span style={{ color: '#34d399', fontSize: '0.85rem' }}>● Active</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
