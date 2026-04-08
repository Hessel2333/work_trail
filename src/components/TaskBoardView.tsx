import { useEffect, useMemo, useState } from 'react';
import type { AppState, Employee, Task, TaskStatus, TaskType } from '../types';
import { summarizeTask } from '../lib/analytics';
import { taskStatusLabel, taskTypeLabel } from '../lib/labels';

interface TaskBoardViewProps {
  state: AppState;
  currentUser: Employee;
  selectedTaskId?: string;
  onSelectTask: (taskId?: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onCreateTask: (draft: {
    title: string;
    projectId: string;
    assigneeId: string;
    priority: Task['priority'];
    estimateHours: number;
    dueDate: string;
    taskType: TaskType;
    moduleId?: string;
    description: string;
    dispatcherId?: string;
    stayOnCurrentView?: boolean;
  }) => string | undefined;
}

const ESTIMATE_PRESETS = [1, 2, 4, 6, 8];
const PRIORITY_OPTIONS: Array<Task['priority']> = ['P0', 'P1', 'P2', 'P3'];
const DEFAULT_TASK_DUE_DATE = '2026-04-10';
const statusColumns: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'in_review', 'done'];

const emptyDraft = {
  title: '',
  projectId: '',
  assigneeId: '',
  priority: 'P2' as Task['priority'],
  estimateHours: 4,
  dueDate: DEFAULT_TASK_DUE_DATE,
  taskType: 'feature' as TaskType,
  moduleId: '',
  description: ''
};

function TaskColumns({
  tasks,
  selectedTaskId,
  state,
  onSelectTask,
  onStatusChange
}: {
  tasks: Task[];
  selectedTaskId?: string;
  state: AppState;
  onSelectTask: (taskId?: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  return (
    <div className="task-column-wrap">
      {statusColumns.map((status) => (
        <article key={status} className="task-column">
          <div className="task-column-header">
            <strong>{taskStatusLabel[status]}</strong>
            <span>{tasks.filter((task) => task.status === status).length}</span>
          </div>
          <div className="task-column-body">
            {tasks
              .filter((task) => task.status === status)
              .map((task) => {
                const project = state.projects.find((item) => item.id === task.projectId)!;
                const assignee = state.employees.find((item) => item.id === task.assigneeId)!;
                const metrics = summarizeTask(task, state);
                return (
                  <div
                    key={task.id}
                    className={`task-card ${selectedTaskId === task.id ? 'selected' : ''}`}
                    onClick={() => onSelectTask(task.id)}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('task-id', task.id);
                    }}
                  >
                    <div className="task-card-head">
                      <span className="inline-chip" style={{ background: `${project.color}1c`, color: project.color }}>
                        {project.code}
                      </span>
                      <span className={`priority-badge priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                    </div>
                    <h4>{task.title}</h4>
                    <div className="task-stats">
                      <span>{assignee.name}</span>
                      <span>{task.estimateHours}h</span>
                      <span>{metrics.actualHours}h</span>
                    </div>
                    <div className="task-stats compact">
                      <span>{task.dueDate}</span>
                      <span>{metrics.reworkCount > 0 ? `返工 ${metrics.reworkCount}` : '未返工'}</span>
                    </div>
                    <div className="task-progress">
                      <div className="load-bar">
                        <div className="load-bar-fill" style={{ width: `${metrics.progress}%` }} />
                      </div>
                      <span>{metrics.progress}%</span>
                    </div>
                    <select
                      value={task.status}
                      onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {Object.entries(taskStatusLabel).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
          </div>
        </article>
      ))}
    </div>
  );
}

export function TaskBoardView({
  state,
  currentUser,
  selectedTaskId,
  onSelectTask,
  onStatusChange,
  onCreateTask
}: TaskBoardViewProps) {
  const [draft, setDraft] = useState(emptyDraft);
  const teamMembers = state.employees.filter((employee) => employee.role === 'employee' || employee.role === 'pm');
  const canManageTasks = currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'pm';
  const visibleTasks = useMemo(
    () => (canManageTasks ? state.tasks : state.tasks.filter((task) => task.assigneeId === currentUser.id)),
    [canManageTasks, currentUser.id, state.tasks]
  );
  const myInProgressCount = visibleTasks.filter((task) => task.status === 'in_progress').length;
  const myPendingCount = visibleTasks.filter((task) => task.status === 'todo').length;
  const myOverdueCount = visibleTasks.filter((task) => task.dueDate < DEFAULT_TASK_DUE_DATE && task.status !== 'done').length;

  useEffect(() => {
    setDraft((current) => {
      const nextProjectId = state.projects.some((project) => project.id === current.projectId)
        ? current.projectId
        : (state.projects[0]?.id ?? '');
      const nextAssigneeId = teamMembers.some((employee) => employee.id === current.assigneeId)
        ? current.assigneeId
        : (canManageTasks ? (teamMembers[0]?.id ?? '') : currentUser.id);

      return {
        ...current,
        projectId: nextProjectId,
        assigneeId: nextAssigneeId
      };
    });
  }, [canManageTasks, currentUser.id, state.projects, teamMembers]);

  function handleCreateTask() {
    const createdTaskId = onCreateTask({
      ...draft,
      assigneeId: canManageTasks ? draft.assigneeId : currentUser.id,
      description: draft.description.trim() || (canManageTasks ? '由任务页快速分发并待排期。' : '由执行人补充说明。'),
      moduleId: draft.moduleId || undefined,
      dispatcherId: currentUser.id,
      stayOnCurrentView: true
    });

    if (!createdTaskId) {
      return;
    }

    setDraft((current) => ({
      ...current,
      title: '',
      priority: 'P2',
      estimateHours: 4,
      taskType: 'feature',
      description: '',
      dueDate: DEFAULT_TASK_DUE_DATE,
      assigneeId: canManageTasks ? current.assigneeId : currentUser.id
    }));
  }

  return (
    <section className="page-shell">
      {canManageTasks ? (
        <>
          <div className="manager-page-header panel-card">
            <div>
              <h2>主管任务台</h2>
              <p className="muted-copy">项目维护放在项目页，任务页专注分发、流转和排期闭环。</p>
            </div>
            <div className="manager-page-meta">
              <span className="inline-chip">{state.projects.length} 个项目</span>
              <span className="inline-chip">{state.tasks.length} 条任务</span>
            </div>
          </div>

          <div className="manager-actions-grid task-page-actions-grid">
            <section className="manager-create-card">
              <div className="card-header manager-create-header">
                <div>
                  <h3>快速分发</h3>
                  <p className="muted-copy">主管在这里建任务，研发只需要接收并排期。</p>
                </div>
                <span className="manager-create-meta">分发人：{currentUser.name}</span>
              </div>
              <div className="manager-form-grid">
                <label className="full-span">
                  任务标题
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="例如：补齐会员权益页边界交互"
                  />
                </label>
                <label>
                  所属项目
                  <select
                    value={draft.projectId}
                    onChange={(event) => setDraft((current) => ({ ...current, projectId: event.target.value }))}
                  >
                    <option value="">选择项目</option>
                    {state.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  执行人
                  <select
                    value={draft.assigneeId}
                    onChange={(event) => setDraft((current) => ({ ...current, assigneeId: event.target.value }))}
                  >
                    <option value="">选择成员</option>
                    {teamMembers.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  截止日期
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                  />
                </label>
                <label>
                  类型
                  <select
                    value={draft.taskType}
                    onChange={(event) => setDraft((current) => ({ ...current, taskType: event.target.value as TaskType }))}
                  >
                    {Object.entries(taskTypeLabel).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="manager-choice-row">
                <span>优先级</span>
                <div className="manager-pill-group">
                  {PRIORITY_OPTIONS.map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      className={`manager-pill-button ${draft.priority === priority ? 'active' : ''}`}
                      onClick={() => setDraft((current) => ({ ...current, priority }))}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </div>
              <div className="manager-choice-row">
                <span>预估工时</span>
                <div className="manager-pill-group">
                  {ESTIMATE_PRESETS.map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      className={`manager-pill-button ${draft.estimateHours === hours ? 'active' : ''}`}
                      onClick={() => setDraft((current) => ({ ...current, estimateHours: hours }))}
                    >
                      {hours}h
                    </button>
                  ))}
                </div>
              </div>
              <label className="full-span">
                分发说明
                <textarea
                  rows={3}
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="可选。填写交付标准、风险提醒或依赖信息。"
                />
              </label>
              <div className="manager-form-footer">
                <p className="muted-copy">任务会直接进入任务池，后续由执行人拖入日程完成排期。</p>
                <button
                  className="primary-button"
                  disabled={!draft.title.trim() || !draft.projectId || !draft.assigneeId}
                  onClick={handleCreateTask}
                >
                  创建任务
                </button>
              </div>
            </section>
          </div>

          <article className="panel-card tasks-board-panel">
            <div className="card-header">
              <div>
                <h3>任务池</h3>
                <p className="muted-copy">主管看到的是全量任务，方便分发、推进和跟踪风险。</p>
              </div>
            </div>
            <TaskColumns
              tasks={visibleTasks}
              selectedTaskId={selectedTaskId}
              state={state}
              onSelectTask={onSelectTask}
              onStatusChange={onStatusChange}
            />
          </article>
        </>
      ) : (
        <>
          <div className="employee-task-hero">
            <article className="spotlight-card warm-card">
              <div className="card-header">
                <div>
                  <h2>{visibleTasks.length}</h2>
                  <p className="muted-copy">我的任务总数</p>
                </div>
                <span className="inline-chip">{currentUser.name}</span>
              </div>
              <div className="mini-stat-list">
                <div>
                  <strong>{myPendingCount}</strong>
                  <span>待开始</span>
                </div>
                <div>
                  <strong>{myInProgressCount}</strong>
                  <span>进行中</span>
                </div>
                <div>
                  <strong>{myOverdueCount}</strong>
                  <span>临期风险</span>
                </div>
              </div>
            </article>

            <article className="panel-card employee-task-note">
              <div className="card-header">
                <div>
                  <h3>当前视角</h3>
                  <p className="muted-copy">研发页只保留“我的任务”，创建和分发动作交给主管侧处理。</p>
                </div>
              </div>
              <div className="stack-list">
                <div className="metric-row">
                  <span>我的任务</span>
                  <strong>{visibleTasks.length}</strong>
                </div>
                <div className="metric-row">
                  <span>待拖入日程</span>
                  <strong>{visibleTasks.filter((task) => task.status === 'todo').length}</strong>
                </div>
                <div className="metric-row">
                  <span>待验收</span>
                  <strong>{visibleTasks.filter((task) => task.status === 'in_review').length}</strong>
                </div>
              </div>
            </article>
          </div>

          <article className="panel-card tasks-board-panel">
            <div className="card-header">
              <div>
                <h3>我的任务</h3>
                <p className="muted-copy">只看分配给自己的任务，拖进日程后再开始执行。</p>
              </div>
            </div>
            <TaskColumns
              tasks={visibleTasks}
              selectedTaskId={selectedTaskId}
              state={state}
              onSelectTask={onSelectTask}
              onStatusChange={onStatusChange}
            />
          </article>
        </>
      )}
    </section>
  );
}
