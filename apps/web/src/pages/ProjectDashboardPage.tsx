import React, { useState, useEffect, FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Clock,
  Plus,
  ArrowUpRight,
  Calculator,
  Coins,
  AlertCircle,
  Loader2,
  FolderKanban,
  CheckCircle2,
} from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import axios from 'axios';

interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  budget: string;
  currency: string;
  organizationId: string;
}

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';
  estimatedCost: string;
  currency: string;
  projectId: string;
}

export const ProjectDashboardPage: React.FC = () => {
  const { currentOrg } = useAuth();
  const location = useLocation();

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New task form state
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState<'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED'>('TODO');
  const [newTaskCost, setNewTaskCost] = useState('15000.00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load projects for current organization
  useEffect(() => {
    const loadProjects = async (): Promise<void> => {
      if (!currentOrg) return;
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const res = await api.get<ProjectItem[]>(`/projects?organizationId=${currentOrg.id}`);
        setProjects(res.data);

        // Preselect project from navigation state or first project
        const navProjectId = (location.state as { projectId?: string })?.projectId;
        if (navProjectId && res.data.some((p) => p.id === navProjectId)) {
          setSelectedProjectId(navProjectId);
        } else if (res.data.length > 0) {
          setSelectedProjectId(res.data[0].id);
        } else {
          setSelectedProjectId(null);
          setTasks([]);
        }
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.data?.message) {
          setErrorMsg(String(err.response.data.message));
        } else {
          setErrorMsg('Failed to load projects for current tenant.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadProjects();
  }, [currentOrg?.id]);

  // Load tasks when selected project changes
  useEffect(() => {
    const loadTasks = async (): Promise<void> => {
      if (!selectedProjectId) {
        setTasks([]);
        return;
      }
      try {
        const res = await api.get<TaskItem[]>(`/tasks?projectId=${selectedProjectId}`);
        setTasks(res.data);
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.data?.message) {
          setErrorMsg(String(err.response.data.message));
        }
      }
    };

    void loadTasks();
  }, [selectedProjectId]);

  const handleCreateTask = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selectedProjectId) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await api.post('/tasks', {
        title: newTaskTitle,
        description: newTaskDesc,
        status: newTaskStatus,
        estimatedCost: newTaskCost,
        projectId: selectedProjectId,
      });

      setShowAddTask(false);
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskCost('15000.00');

      // Refresh tasks
      const res = await api.get<TaskItem[]>(`/tasks?projectId=${selectedProjectId}`);
      setTasks(res.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        setErrorMsg(String(err.response.data.message));
      } else {
        setErrorMsg('Failed to create task.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectBudgetETB = parseFloat(selectedProject?.budget || '0');
  const totalEstimatedCost = tasks.reduce((acc, t) => acc + parseFloat(t.estimatedCost || '0'), 0);
  const remainingBudget = projectBudgetETB - totalEstimatedCost;
  const budgetUtilization = projectBudgetETB > 0
    ? ((totalEstimatedCost / projectBudgetETB) * 100).toFixed(1)
    : '0.0';

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

  if (!currentOrg) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <h2>Select an Organization</h2>
        <p style={{ color: 'var(--text-secondary)' }}>You must select an active tenant to view projects.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {currentOrg.name} &gt; Project Tracker
            </span>
          </div>
          <h1 className="page-title">
            {selectedProject ? selectedProject.name : 'Projects & Tasks'}
          </h1>
          <p className="page-subtitle">
            {selectedProject?.description || 'Track deliverables, ETB budgets, and estimated task costs.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Project Selector */}
          {projects.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FolderKanban size={18} style={{ color: 'var(--accent-primary)' }} />
              <select
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="form-input"
                style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem', maxWidth: '240px' }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedProject && (
            <button onClick={() => setShowAddTask(true)} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
              <Plus size={16} />
              <span>Add Task</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
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
          <span>{errorMsg}</span>
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Loader2 className="animate-spin" size={28} style={{ margin: '0 auto 0.5rem auto' }} />
          <span>Loading project metrics...</span>
        </div>
      ) : !selectedProject ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <FolderKanban size={40} style={{ margin: '0 auto 0.75rem auto', color: 'var(--text-muted)' }} />
          <h3>No projects found in this organization</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Switch to the Organization dashboard to create a new project.
          </p>
        </div>
      ) : (
        <>
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
              iconBgColor={remainingBudget >= 0 ? 'rgba(168, 85, 247, 0.15)' : 'rgba(239, 68, 68, 0.15)'}
              iconColor={remainingBudget >= 0 ? '#c084fc' : '#ef4444'}
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
                  Deliverables scoped strictly to {selectedProject.name}
                </p>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {tasks.length} total tasks
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
                <CheckCircle2 size={36} style={{ margin: '0 auto 0.75rem auto', color: 'var(--text-muted)' }} />
                <h3>No tasks created for this project yet</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  Click "Add Task" to record an estimated ETB deliverable.
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Task Title</th>
                      <th>Status</th>
                      <th>Estimated Cost (ETB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{task.title}</div>
                          {task.description && (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                              {task.description}
                            </div>
                          )}
                        </td>
                        <td>{getStatusBadge(task.status)}</td>
                        <td>
                          <span className="badge badge-etb">
                            {formatETB(parseFloat(task.estimatedCost || '0'))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal: Add Task */}
      {showAddTask && (
        <div className="auth-wrapper" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100 }}>
          <div className="auth-card" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Create Deliverable Task</h2>
            <form onSubmit={handleCreateTask}>
              <div className="form-group">
                <label className="form-label">Task Title</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Database indexing & optimization"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Deliverable specifications..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={newTaskStatus}
                  onChange={(e) =>
                    setNewTaskStatus(e.target.value as 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED')
                  }
                >
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="REVIEW">REVIEW</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Estimated ETB Cost (Exact 2-decimal format)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="25000.00"
                  value={newTaskCost}
                  onChange={(e) => setNewTaskCost(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddTask(false)}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
