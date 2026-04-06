import { useState } from 'react';
import type { AppState, Task, TaskStatus, TaskType } from '../types';
import { summarizeTask } from '../lib/analytics';
import { taskStatusLabel, taskTypeLabel } from '../lib/labels';

interface TaskBoardViewProps {
  state: AppState;
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
  }) => void;
}

const emptyDraft = {
  title: '',
  projectId: '',
  assigneeId: '',
  priority: 'P2' as Task['priority'],
  estimateHours: 4,
  dueDate: '2026-04-09',
  taskType: 'feature' as TaskType,
  moduleId: '',
  description: ''
};

export function TaskBoardView({
  state,
  selectedTaskId,
  onSelectTask,
  onStatusChange,
  onCreateTask
}: TaskBoardViewProps) {
  const [draft, setDraft] = useState(emptyDraft);
  const statusColumns: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'in_review', 'done'];

  return (
    <section className="page-shell">
      <div className="tasks-layout">
        <article className="panel-card task-form-card">
          <div className="card-header"><h3>新建</h3></div>
          <div className="form-grid">
            <label>
              标题
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="例如：新增验收问题汇总页"
              />
            </label>
            <label>
              项目
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
                {state.employees
                  .filter((employee) => employee.role === 'employee' || employee.role === 'pm')
                  .map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
              </select>
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
            <label>
              优先级
              <select
                value={draft.priority}
                onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Task['priority'] }))}
              >
                {['P0', 'P1', 'P2', 'P3'].map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <label>
              预估工时
              <input
                type="number"
                min={1}
                value={draft.estimateHours}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, estimateHours: Number(event.target.value) }))
                }
              />
            </label>
            <label>
              截止日期
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
              />
            </label>
            <label className="full-span">
              描述
              <textarea
                rows={4}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="补充交付标准、验收说明或上下游依赖"
              />
            </label>
          </div>
          <button
            className="primary-button full-width"
            onClick={() => {
              if (!draft.title || !draft.projectId || !draft.assigneeId) {
                return;
              }

              onCreateTask({
                ...draft,
                moduleId: draft.moduleId || undefined
              });
              setDraft(emptyDraft);
            }}
          >
            创建并分发任务
          </button>
        </article>

        <div className="task-column-wrap">
          {statusColumns.map((status) => (
            <article key={status} className="task-column">
              <div className="task-column-header">
                <strong>{taskStatusLabel[status]}</strong>
                <span>{state.tasks.filter((task) => task.status === status).length}</span>
              </div>
              <div className="task-column-body">
                {state.tasks
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
      </div>
    </section>
  );
}
