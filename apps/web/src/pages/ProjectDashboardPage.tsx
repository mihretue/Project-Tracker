import React, { useState, useEffect, FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  AlertCircle,
  Loader2,
  FolderKanban,
  CheckCircle2,
  Filter,
  Trash2,
  Edit2,
  Eye,
} from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { SidebarToggle } from '../components/SidebarToggle';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import axios from 'axios';
import { queryKeys, useProjects, useTasks } from '../services/queries';
import { DialogError } from '../components/DialogError';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { describeApiError } from '../services/errors';
import { validateTaskInput } from '../services/validation';

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
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedCost: string;
  currency: string;
  /** Planned duration in whole days; null when unknown. */
  durationDays: number | null;
  projectId: string;
}

export const ProjectDashboardPage: React.FC = () => {
  const { currentOrg } = useAuth();
  const isAdmin = currentOrg?.role === 'ADMIN';
  const location = useLocation();

  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'>('ALL');
  // Errors for the dialog that is currently open (add task, edit task, delete task); shown inside it
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskItem | null>(null);
  // Read-only detail view; kept as an id so it always shows the freshest copy of the task
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);

  // New task form state
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState<'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED'>('TODO');
  const [newTaskPriority, setNewTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [newTaskCost, setNewTaskCost] = useState('15000.00');
  const [newTaskDuration, setNewTaskDuration] = useState('');

  // Edit task modal state
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStatus, setEditStatus] = useState<'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED'>('TODO');
  const [editPriority, setEditPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [editCost, setEditCost] = useState('');
  const [editDuration, setEditDuration] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const projectsQuery = useProjects<ProjectItem>(currentOrg?.id);
  const projects = projectsQuery.data ?? [];

  // Load ALL tasks of the selected project. The priority filter only narrows the displayed rows;
  // budget figures are always computed from the complete task list.
  const tasksQuery = useTasks<TaskItem>(selectedProjectId);
  const tasks = selectedProjectId ? tasksQuery.data ?? [] : [];

  const queryErrorMessage = (err: unknown): string | null =>
    axios.isAxiosError(err) && err.response?.data?.message ? String(err.response.data.message) : null;
  // A failed project load is always reported; a failed task load only when the server gave a reason
  const errorMsg = projectsQuery.isError
    ? queryErrorMessage(projectsQuery.error) ?? 'Failed to load projects for current tenant.'
    : tasksQuery.isError
      ? queryErrorMessage(tasksQuery.error)
      : null;

  // Keep the selection valid for the loaded projects: prefer the project chosen in the sidebar,
  // otherwise keep the current one, otherwise fall back to the first project.
  useEffect(() => {
    const loaded = projectsQuery.data;
    if (!loaded) return;
    const navProjectId = (location.state as { projectId?: string } | null)?.projectId;
    if (navProjectId && loaded.some((p) => p.id === navProjectId)) {
      setSelectedProjectId(navProjectId);
    } else if (!loaded.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(loaded.length > 0 ? loaded[0].id : null);
    }
  }, [projectsQuery.data, location.state]);

  const invalidateTasks = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks(selectedProjectId) });

  const deleteTask = useMutation({ mutationFn: (id: string) => api.delete(`/tasks/${id}`) });
  const createTask = useMutation({ mutationFn: (body: Record<string, unknown>) => api.post('/tasks', body) });
  const updateTask = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/tasks/${id}`, body),
  });

  const openAddTask = (): void => {
    setDialogError(null);
    setShowAddTask(true);
  };
  const closeAddTask = (): void => {
    setDialogError(null);
    setShowAddTask(false);
  };
  const closeEditTask = (): void => {
    setDialogError(null);
    setEditingTask(null);
  };
  const openDeleteTask = (task: TaskItem): void => {
    setDialogError(null);
    setDeletingTask(task);
  };
  const closeDeleteTask = (): void => {
    setDialogError(null);
    setDeletingTask(null);
  };

  const handleDeleteTask = async (): Promise<void> => {
    if (!deletingTask || !selectedProjectId || isSubmitting) return;
    setIsSubmitting(true);
    setDialogError(null);

    try {
      await deleteTask.mutateAsync(deletingTask.id);
      closeDeleteTask();
      // Reload the full list so rows and the budget figures reflect the deletion
      await invalidateTasks();
    } catch (err: unknown) {
      setDialogError(describeApiError(err, 'Failed to delete task.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTask = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selectedProjectId || isSubmitting) return;
    const invalid = validateTaskInput(newTaskTitle, newTaskCost, newTaskDuration);
    if (invalid) {
      setDialogError(invalid);
      return;
    }
    setIsSubmitting(true);
    setDialogError(null);

    try {
      await createTask.mutateAsync({
        title: newTaskTitle.trim(),
        description: newTaskDesc,
        status: newTaskStatus,
        priority: newTaskPriority,
        estimatedCost: newTaskCost.trim(),
        // Optional: omitted when left blank, so the task stays "unknown" instead of getting a made-up value
        ...(newTaskDuration.trim() !== '' && { durationDays: Number(newTaskDuration) }),
        projectId: selectedProjectId,
      });

      closeAddTask();
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskStatus('TODO');
      setNewTaskPriority('MEDIUM');
      setNewTaskCost('15000.00');
      setNewTaskDuration('');

      await invalidateTasks();
    } catch (err: unknown) {
      setDialogError(describeApiError(err, 'Failed to create task.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (task: TaskItem): void => {
    setDialogError(null);
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description || '');
    setEditStatus(task.status);
    setEditPriority(task.priority);
    setEditCost(task.estimatedCost);
    setEditDuration(task.durationDays === null || task.durationDays === undefined ? '' : String(task.durationDays));
  };

  const handleUpdateTask = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!editingTask || !selectedProjectId || isSubmitting) return;
    const invalid = validateTaskInput(editTitle, editCost, editDuration);
    if (invalid) {
      setDialogError(invalid);
      return;
    }
    setIsSubmitting(true);
    setDialogError(null);

    try {
      await updateTask.mutateAsync({
        id: editingTask.id,
        body: {
          title: editTitle.trim(),
          description: editDesc,
          status: editStatus,
          priority: editPriority,
          estimatedCost: editCost.trim(),
          // Blank clears the duration (null); a number sets it
          durationDays: editDuration.trim() === '' ? null : Number(editDuration),
        },
      });

      closeEditTask();
      await invalidateTasks();
    } catch (err: unknown) {
      setDialogError(describeApiError(err, 'Failed to update task.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  // Spinner until the page can show real data: projects loaded, one selected, and its tasks loaded.
  // Without this a pending request would read as "no projects" / "no tasks".
  const isLoading =
    projectsQuery.isLoading ||
    (projects.length > 0 && !selectedProject) ||
    (!!selectedProject && tasksQuery.isLoading);
  const viewingTask = tasks.find((t) => t.id === viewingTaskId) ?? null;
  const projectBudgetETB = parseFloat(selectedProject?.budget || '0');
  const visibleTasks = priorityFilter === 'ALL' ? tasks : tasks.filter((t) => t.priority === priorityFilter);
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

  const formatDuration = (days: number | null | undefined): string =>
    days === null || days === undefined ? '—' : `${days} ${days === 1 ? 'day' : 'days'}`;

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

  const getPriorityBadge = (priority: TaskItem['priority']): JSX.Element => {
    switch (priority) {
      case 'HIGH':
        return <span className="badge badge-priority-high">HIGH</span>;
      case 'LOW':
        return <span className="badge badge-priority-low">LOW</span>;
      case 'MEDIUM':
      default:
        return <span className="badge badge-priority-medium">MEDIUM</span>;
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
            <SidebarToggle />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {currentOrg.name} &gt; Project Tracker
            </span>
          </div>
          <h1 className="page-title">
            {selectedProject ? selectedProject.name : 'Projects & Tasks'}
          </h1>
          <p className="page-subtitle">
            {selectedProject?.description || 'Track deliverables, ETB budgets, priorities, and estimated costs.'}
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
            <button onClick={openAddTask} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
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
          <div className="stat-strip">
            <StatCard
              label="Project Budget (ETB)"
              value={formatETB(projectBudgetETB)}
              caption="Approved for this project"
            />
            <StatCard
              label="Estimated Task Cost (ETB)"
              value={formatETB(totalEstimatedCost)}
              caption={`Across ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
            />
            <StatCard
              label="Remaining Budget (ETB)"
              value={formatETB(remainingBudget)}
              caption={remainingBudget >= 0 ? 'Still available' : 'Over budget'}
            />
            <StatCard
              label="Estimated Budget Allocation"
              value={`${budgetUtilization}%`}
              caption="Of the project budget"
            />
          </div>

          {/* Tasks Table */}
          <div style={{ marginTop: '2.5rem' }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Project Tasks
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Deliverables scoped strictly to {selectedProject.name}
                </p>
              </div>

              {/* Priority Filter Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)' }}>
                  <Filter size={16} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Priority Filter:</span>
                </div>
                <select
                  className="form-input"
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', width: 'auto' }}
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH')}
                >
                  <option value="ALL">All Priorities</option>
                  <option value="HIGH">HIGH Priority</option>
                  <option value="MEDIUM">MEDIUM Priority</option>
                  <option value="LOW">LOW Priority</option>
                </select>

                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  ({visibleTasks.length} {visibleTasks.length === 1 ? 'task' : 'tasks'})
                </span>
              </div>
            </div>

            {visibleTasks.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
                <CheckCircle2 size={36} style={{ margin: '0 auto 0.75rem auto', color: 'var(--text-muted)' }} />
                <h3>No tasks match the selected criteria</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  {priorityFilter !== 'ALL'
                    ? `No tasks found with priority "${priorityFilter}". Try selecting "All Priorities".`
                    : 'Click "Add Task" to record an estimated ETB deliverable.'}
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Task Title</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Estimated Cost (ETB)</th>
                      <th>Duration</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{task.title}</div>
                          {task.description && (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                              {task.description}
                            </div>
                          )}
                        </td>
                        <td>{getPriorityBadge(task.priority)}</td>
                        <td>{getStatusBadge(task.status)}</td>
                        <td>
                          <span className="badge badge-etb">
                            {formatETB(parseFloat(task.estimatedCost || '0'))}
                          </span>
                        </td>
                        <td>{formatDuration(task.durationDays)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setViewingTaskId(task.id)}
                            className="btn btn-outline"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', gap: '0.3rem', marginRight: '0.4rem' }}
                            aria-label={`View task ${task.title}`}
                            title="View task details"
                          >
                            <Eye size={12} />
                            <span>View</span>
                          </button>
                          <button
                            onClick={() => handleOpenEdit(task)}
                            className="btn btn-outline"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', gap: '0.3rem' }}
                            title="Edit Task & Priority"
                          >
                            <Edit2 size={12} />
                            <span>Edit</span>
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => openDeleteTask(task)}
                              className="btn btn-outline"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', gap: '0.3rem', marginLeft: '0.4rem', color: '#f87171' }}
                              aria-label={`Delete task ${task.title}`}
                            >
                              <Trash2 size={12} />
                              <span>Delete</span>
                            </button>
                          )}
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
            <DialogError message={dialogError} />
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-input"
                    value={newTaskPriority}
                    onChange={(e) =>
                      setNewTaskPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')
                    }
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM (Default)</option>
                    <option value="HIGH">HIGH</option>
                  </select>
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

              <div className="form-group">
                <label className="form-label" htmlFor="new-task-duration">Duration in days (optional)</label>
                <input
                  id="new-task-duration"
                  type="number"
                  min={0}
                  step={1}
                  className="form-input"
                  placeholder="e.g. 14"
                  value={newTaskDuration}
                  onChange={(e) => setNewTaskDuration(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={closeAddTask}
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

      {/* Modal: Task details (read-only) */}
      {viewingTask && (
        <div className="auth-wrapper" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100 }}>
          <div className="auth-card" style={{ maxWidth: 520 }} role="dialog" aria-label="Task details">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>{viewingTask.title}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {selectedProject?.name}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {getPriorityBadge(viewingTask.priority)}
              {getStatusBadge(viewingTask.status)}
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Description</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{viewingTask.description || 'No description provided.'}</div>
            </div>
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Estimated cost</div>
                <span className="badge badge-etb">{formatETB(parseFloat(viewingTask.estimatedCost || '0'))}</span>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Duration</div>
                <strong>{formatDuration(viewingTask.durationDays)}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Share of project budget</div>
                <strong>
                  {projectBudgetETB > 0
                    ? `${((parseFloat(viewingTask.estimatedCost || '0') / projectBudgetETB) * 100).toFixed(1)}%`
                    : 'N/A'}
                </strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setViewingTaskId(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  setViewingTaskId(null);
                  handleOpenEdit(viewingTask);
                }}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Task */}
      {editingTask && (
        <div className="auth-wrapper" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100 }}>
          <div className="auth-card" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Edit Task Deliverable</h2>
            <DialogError message={dialogError} />
            <form onSubmit={handleUpdateTask}>
              <div className="form-group">
                <label className="form-label">Task Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-input"
                    value={editPriority}
                    onChange={(e) =>
                      setEditPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')
                    }
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-input"
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED')
                    }
                  >
                    <option value="TODO">TODO</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="REVIEW">REVIEW</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Estimated ETB Cost</label>
                <input
                  type="text"
                  className="form-input"
                  value={editCost}
                  onChange={(e) => setEditCost(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-task-duration">Duration in days (optional)</label>
                <input
                  id="edit-task-duration"
                  type="number"
                  min={0}
                  step={1}
                  className="form-input"
                  placeholder="Leave blank if unknown"
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={closeEditTask}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                  {isSubmitting ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Task (confirmation) */}
      {deletingTask && (
        <ConfirmDialog
          title="Delete Task"
          message={
            <>
              Delete <strong>{deletingTask.title}</strong>? Its cost will be removed from the project's budget
              figures. This cannot be undone.
            </>
          }
          confirmLabel="Delete Task"
          busyLabel="Deleting..."
          isBusy={isSubmitting}
          error={dialogError}
          onConfirm={() => void handleDeleteTask()}
          onCancel={closeDeleteTask}
        />
      )}
    </div>
  );
};
