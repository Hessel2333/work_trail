import type { AppState } from '../types';
import { getAnalyticsOverview, getRecentActivity, summarizeTask } from '../lib/analytics';
import { taskStatusLabel } from '../lib/labels';
import { formatDate, getWeekDates } from '../lib/time';

interface DashboardViewProps {
  state: AppState;
  selectedDate: string;
  onOpenTimeline: () => void;
  onOpenTaskBoard: () => void;
}

export function DashboardView({
  state,
  selectedDate,
  onOpenTimeline,
  onOpenTaskBoard
}: DashboardViewProps) {
  const weekDates = getWeekDates(selectedDate);
  const overview = getAnalyticsOverview(state);
  const currentUser = state.employees.find((employee) => employee.id === state.currentUserId)!;
  const myTasks = state.tasks.filter((task) => task.assigneeId === currentUser.id);
  const myBlocks = state.timeBlocks.filter((block) => block.employeeId === currentUser.id);
  const todayBlocks = myBlocks.filter((block) => block.date === selectedDate);
  const recentTasks = myTasks
    .map((task) => ({
      task,
      metrics: summarizeTask(task, state)
    }))
    .sort((left, right) => left.task.dueDate.localeCompare(right.task.dueDate))
    .slice(0, 4);

  const weeklyHours = weekDates.map((date) => {
    const minutes = myBlocks
      .filter((block) => block.date === date)
      .reduce((sum, block) => sum + block.durationMinutes, 0);

    return {
      date,
      hours: Number((minutes / 60).toFixed(1))
    };
  });

  const missingDates = weeklyHours.filter((item) => item.hours < 7.5);
  const recentActivity = getRecentActivity(myBlocks);

  return (
    <section className="page-shell">
      <div className="compact-toolbar">
        <button className="primary-button" onClick={onOpenTimeline}>
          日程
        </button>
        <button className="secondary-button" onClick={onOpenTaskBoard}>
          任务
        </button>
      </div>

      <div className="dashboard-grid">
        <article className="spotlight-card warm-card">
          <div className="card-header">
            <div>
              <h2>{todayBlocks.reduce((sum, block) => sum + block.durationMinutes, 0) / 60}h</h2>
            </div>
            <span className="inline-chip">{formatDate(selectedDate)}</span>
          </div>
          <div className="mini-stat-list">
            <div>
              <strong>{missingDates.length}</strong>
              <span>漏填</span>
            </div>
            <div>
              <strong>{overview.totals.delayedFillRatio}%</strong>
              <span>延填</span>
            </div>
            <div>
              <strong>{overview.totals.taskHoursRatio}%</strong>
              <span>任务占比</span>
            </div>
          </div>
        </article>

        <article className="spotlight-card dark-card">
          <div className="card-header">
            <div>
              <h2>{currentUser.name}</h2>
            </div>
            <span className="inline-chip dark-chip">{currentUser.title}</span>
          </div>
          <div className="week-strip">
            {weeklyHours.map((item) => (
              <div key={item.date} className="week-strip-item">
                <span>{formatDate(item.date)}</span>
                <div className="load-bar">
                  <div
                    className="load-bar-fill"
                    style={{ width: `${Math.min(100, (item.hours / currentUser.capacityHoursPerDay) * 100)}%` }}
                  />
                </div>
                <strong>{item.hours}h</strong>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="content-grid">
        <article className="panel-card">
          <div className="card-header">
            <h3>最近任务</h3>
            <button className="ghost-link" onClick={onOpenTaskBoard}>
              全部
            </button>
          </div>
          <div className="stack-list">
            {recentTasks.map(({ task, metrics }) => (
              <div key={task.id} className="task-row">
                <div>
                  <strong>{task.title}</strong>
                  <p>
                    {taskStatusLabel[task.status]}
                    {' · '}
                    截止
                    {' '}
                    {task.dueDate}
                  </p>
                </div>
                <div className="task-row-meta">
                  <span>{metrics.actualHours}h / {task.estimateHours}h</span>
                  <span>{metrics.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="card-header"><h3>记录</h3></div>
          <div className="stack-list">
            {recentActivity.map((item) => (
              <div key={item.id} className="activity-row">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="card-header"><h3>项目</h3></div>
          <div className="stack-list">
            {overview.projectHours.map((project) => (
              <div key={project.projectId} className="metric-row">
                <div className="metric-label">
                  <span className="color-dot" style={{ background: project.color }} />
                  <strong>{project.name}</strong>
                </div>
                <span>{project.hours}h</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
