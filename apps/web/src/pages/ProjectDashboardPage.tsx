import React, { useState } from 'react';
import {
  Clock,
  Plus,
  ArrowUpRight,
  Calculator,
  Coins,
} from 'lucide-react';
import { StatCard } from '../components/StatCard';

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';
  estimatedCostETB: number;
}

const mockTasks: TaskItem[] = [
  {
    id: 'task-1',
    title: 'Setup PostgreSQL schemas with multi-tenant foreign keys',
    description: 'Design and execute migrations for tenant isolation and audit trails',
    status: 'COMPLETED',
    estimatedCostETB: 45000.0,
  },
  {
    id: 'task-2',
    title: 'Implement JWT authentication & organization middleware',
    description: 'Ensure all API routes strictly scope data to the authenticated tenant',
    status: 'IN_PROGRESS',
    estimatedCostETB: 85000.0,
  },
  {
    id: 'task-3',
    title: 'Develop ETB currency converter and budget variance alert',
    description: 'Trigger notifications when cumulative task costs reach 85% of budget',
    status: 'TODO',
    estimatedCostETB: 60000.0,
  },
  {
    id: 'task-4',
    title: 'Build React Vite Kanban board for task workflows',
    description: 'Interactive drag-and-drop task status management with optimistic updates',
    status: 'TODO',
    estimatedCostETB: 95000.0,
  },
];

export const ProjectDashboardPage: React.FC = () => {
  const [tasks] = useState<TaskItem[]>(mockTasks);
  const projectBudgetETB = 650000.0;

  const totalEstimatedCost = tasks.reduce(
    (acc, task) => acc + task.estimatedCostETB,
    0,
  );
  const remainingBudget = projectBudgetETB - totalEstimatedCost;
  const budgetUtilization = ((totalEstimatedCost / projectBudgetETB) * 100).toFixed(1);

  const formatETB = (val: number): string => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const getStatusBadge = (status: TaskItem['status']): JSX.Element => {
    switch (status) {
      case 'COMPLETED':
        return <span className="badge badge-completed">Completed</span>;
      case 'IN_PROGRESS':
        return <span className="badge badge-progress">In Progress</span>;
      case 'REVIEW':
        return <span className="badge badge-review">Review</span>;
      case 'TODO':
      default:
        return <span className="badge badge-todo">To Do</span>;
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Addis Tech Solutions PLC &gt; Projects
            </span>
          </div>
          <h1 className="page-title">Mobile Banking Portal Modernization</h1>
          <p className="page-subtitle">
            Core infrastructure, API endpoints, and client application for financial services
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline">
            <Coins size={16} />
            <span>Budget Audit</span>
          </button>
          <button className="btn btn-primary">
            <Plus size={16} />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid-cards">
        <StatCard
          label="Project Budget (ETB)"
          value={formatETB(projectBudgetETB)}
          icon={<Coins size={22} />}
          iconBgColor="rgba(16, 185, 129, 0.15)"
          iconColor="#34d399"
        />
        <StatCard
          label="Estimated Task Cost (ETB)"
          value={formatETB(totalEstimatedCost)}
          icon={<Calculator size={22} />}
          iconBgColor="rgba(59, 130, 246, 0.15)"
          iconColor="#60a5fa"
        />
        <StatCard
          label="Remaining Budget (ETB)"
          value={formatETB(remainingBudget)}
          icon={<ArrowUpRight size={22} />}
          iconBgColor="rgba(168, 85, 247, 0.15)"
          iconColor="#c084fc"
        />
        <StatCard
          label="Budget Allocated"
          value={`${budgetUtilization}%`}
          icon={<Clock size={22} />}
          iconBgColor="rgba(245, 158, 11, 0.15)"
          iconColor="#fbbf24"
        />
      </div>

      {/* Tasks Table */}
      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
              Project Tasks
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Individual deliverable items with estimated ETB cost
            </p>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {tasks.length} total tasks
          </span>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Task Title</th>
                <th>Status</th>
                <th>Estimated Cost (ETB)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: '#ffffff' }}>{task.title}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                      {task.description}
                    </div>
                  </td>
                  <td>{getStatusBadge(task.status)}</td>
                  <td>
                    <span className="badge badge-etb">
                      {formatETB(task.estimatedCostETB)}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-outline"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
