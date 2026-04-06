import { useEffect, useMemo, useState } from 'react';
import type { AppState, Task } from '../types';
import {
  buildWeeklyLoad,
  countReasonDistribution,
  getAnalyticsOverview,
  getContextSwitchScore,
  summarizeTask
} from '../lib/analytics';
import { blockReasonLabel, reworkReasonLabel, riskLevelLabel, workTypeColor, workTypeLabel } from '../lib/labels';
import { formatCalendarHeaderDate, getWeekDates, minuteToLabel, minutesToHours, shiftDate } from '../lib/time';

const MANAGER_TIMELINE_START = 7 * 60;
const MANAGER_TIMELINE_END = 22 * 60;
const TASK_COLOR_PALETTE = ['#007aff', '#30b0c7', '#34c759', '#5e5ce6', '#ff9500', '#ff2d55', '#8e8e93', '#bf5af2'];

interface AnalyticsViewProps {
  state: AppState;
  selectedDate: string;
}

function hashTaskColor(task: Task) {
  const seed = `${task.id}-${task.title}`;
  let hash = 0;

  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % TASK_COLOR_PALETTE.length;
  }

  return TASK_COLOR_PALETTE[hash];
}

export function AnalyticsView({ state, selectedDate }: AnalyticsViewProps) {
  const [managerMode, setManagerMode] = useState<'week' | 'day'>('week');
  const [managerColorMode, setManagerColorMode] = useState<'project' | 'task'>('project');
  const [managerAnchorDate, setManagerAnchorDate] = useState(selectedDate);
  const overview = getAnalyticsOverview(state);
  const weekDates = getWeekDates(selectedDate);
  const weeklyLoad = buildWeeklyLoad(state, weekDates);
  const contextSwitches = getContextSwitchScore(state).slice(0, 5);
  const teamMembers = state.employees.filter((employee) => employee.role === 'employee' || employee.role === 'pm');
  const projectsById = new Map(state.projects.map((project) => [project.id, project]));
  const tasksById = new Map(state.tasks.map((task) => [task.id, task]));
  const nonTaskItemsById = new Map(state.nonTaskItems.map((item) => [item.id, item]));
  const taskColorMap = useMemo(
    () => new Map(state.tasks.map((task) => [task.id, hashTaskColor(task)])),
    [state.tasks]
  );
  const riskyTasks = state.tasks
    .map((task) => ({
      task,
      metrics: summarizeTask(task, state),
      snapshot: state.progressSnapshots.find((snapshot) => snapshot.taskId === task.id)
    }))
    .filter((item) => item.snapshot?.riskLevel === 'high')
    .slice(0, 5);
  const reworkDistribution = countReasonDistribution(state.reworkRecords.map((record) => record.reason));
  const blockDistribution = countReasonDistribution(state.blockRecords.map((record) => record.reason));
  const managerWeekDates = getWeekDates(managerAnchorDate);
  const dayMarkers = Array.from(
    { length: (MANAGER_TIMELINE_END - MANAGER_TIMELINE_START) / 60 + 1 },
    (_, index) => MANAGER_TIMELINE_START + index * 60
  );

  useEffect(() => {
    setManagerAnchorDate(selectedDate);
  }, [selectedDate]);

  function getBlockColor(block: AppState['timeBlocks'][number]) {
    if (managerColorMode === 'project') {
      return projectsById.get(block.projectId)?.color ?? '#007aff';
    }

    if (block.taskId) {
      return taskColorMap.get(block.taskId) ?? '#007aff';
    }

    return workTypeColor[block.workType];
  }

  function getBlockLabel(block: AppState['timeBlocks'][number]) {
    if (managerColorMode === 'project') {
      return projectsById.get(block.projectId)?.code ?? '项目';
    }

    if (block.taskId) {
      return tasksById.get(block.taskId)?.title ?? '任务';
    }

    return nonTaskItemsById.get(block.nonTaskItemId ?? '')?.name ?? workTypeLabel[block.workType];
  }

  return (
    <section className="page-shell">
      <article className="panel-card manager-view-card">
        <div className="card-header manager-view-header">
          <div>
            <h3>主管视角</h3>
            <p className="muted-copy">横轴查看一周或单日，纵轴对比团队成员的项目与任务分布。</p>
          </div>
          <div className="manager-view-controls">
            <div className="segmented-control">
              <button
                className={managerMode === 'week' ? 'active' : ''}
                aria-pressed={managerMode === 'week'}
                onClick={() => setManagerMode('week')}
              >
                周
              </button>
              <button
                className={managerMode === 'day' ? 'active' : ''}
                aria-pressed={managerMode === 'day'}
                onClick={() => setManagerMode('day')}
              >
                日
              </button>
            </div>
            <div className="segmented-control">
              <button
                className={managerColorMode === 'project' ? 'active' : ''}
                aria-pressed={managerColorMode === 'project'}
                onClick={() => setManagerColorMode('project')}
              >
                按项目
              </button>
              <button
                className={managerColorMode === 'task' ? 'active' : ''}
                aria-pressed={managerColorMode === 'task'}
                onClick={() => setManagerColorMode('task')}
              >
                按任务
              </button>
            </div>
            <div className="date-nav-group manager-date-nav">
              <button
                className="icon-button"
                aria-label={managerMode === 'week' ? '上一周' : '上一天'}
                onClick={() => setManagerAnchorDate(shiftDate(managerAnchorDate, managerMode === 'week' ? -7 : -1))}
              >
                ←
              </button>
              <input
                type="date"
                value={managerAnchorDate}
                onChange={(event) => setManagerAnchorDate(event.target.value)}
              />
              <button
                className="icon-button"
                aria-label={managerMode === 'week' ? '下一周' : '下一天'}
                onClick={() => setManagerAnchorDate(shiftDate(managerAnchorDate, managerMode === 'week' ? 7 : 1))}
              >
                →
              </button>
            </div>
          </div>
        </div>

        {managerMode === 'week' ? (
          <div className="manager-week-board">
            <div className="manager-week-head">
              <div className="manager-member-head">成员</div>
              {managerWeekDates.map((date) => (
                <div key={date} className={`manager-week-head-cell ${date === managerAnchorDate ? 'selected' : ''}`}>
                  {formatCalendarHeaderDate(date)}
                </div>
              ))}
            </div>
            <div className="manager-week-body">
              {teamMembers.map((employee) => (
                <div key={employee.id} className="manager-week-row">
                  <div className="manager-member-cell">
                    <strong>{employee.name}</strong>
                    <span>{employee.title}</span>
                  </div>
                  {managerWeekDates.map((date) => {
                    const rowBlocks = state.timeBlocks
                      .filter((block) => block.employeeId === employee.id && block.date === date)
                      .sort((left, right) => left.startMinute - right.startMinute);
                    const totalMinutes = rowBlocks.reduce((sum, block) => sum + block.durationMinutes, 0);

                    return (
                      <div key={`${employee.id}-${date}`} className="manager-week-cell">
                        {rowBlocks.length === 0 ? (
                          <span className="manager-empty-mark">—</span>
                        ) : (
                          <>
                            <div className="manager-week-stack">
                              {rowBlocks.map((block) => (
                                <div
                                  key={block.id}
                                  className="manager-week-segment"
                                  style={{
                                    width: `${(block.durationMinutes / totalMinutes) * 100}%`,
                                    ['--manager-bar-color' as string]: getBlockColor(block)
                                  }}
                                  title={`${getBlockLabel(block)} · ${minuteToLabel(block.startMinute)} - ${minuteToLabel(block.endMinute)}`}
                                />
                              ))}
                            </div>
                            <div className="manager-week-summary">
                              <span>{minutesToHours(totalMinutes)}h</span>
                              <span>{getBlockLabel(rowBlocks[0])}</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="manager-day-board">
            <div className="manager-day-axis">
              <div className="manager-member-head">成员</div>
              <div className="manager-day-axis-track">
                {dayMarkers.map((marker) => (
                  <span key={marker} style={{ left: `${((marker - MANAGER_TIMELINE_START) / (MANAGER_TIMELINE_END - MANAGER_TIMELINE_START)) * 100}%` }}>
                    {minuteToLabel(marker)}
                  </span>
                ))}
              </div>
            </div>
            <div className="manager-day-body">
              {teamMembers.map((employee) => {
                const rowBlocks = state.timeBlocks
                  .filter((block) => block.employeeId === employee.id && block.date === managerAnchorDate)
                  .sort((left, right) => left.startMinute - right.startMinute);

                return (
                  <div key={employee.id} className="manager-day-row">
                    <div className="manager-member-cell">
                      <strong>{employee.name}</strong>
                      <span>{employee.title}</span>
                    </div>
                    <div className="manager-day-track">
                      {dayMarkers.slice(0, -1).map((marker) => (
                        <div
                          key={`${employee.id}-${marker}`}
                          className={`manager-day-slot ${marker % 120 === 0 ? 'major' : ''}`}
                          style={{ left: `${((marker - MANAGER_TIMELINE_START) / (MANAGER_TIMELINE_END - MANAGER_TIMELINE_START)) * 100}%` }}
                        />
                      ))}
                      {rowBlocks.length === 0 ? <span className="manager-empty-day">无日程</span> : null}
                      {rowBlocks.map((block) => (
                        <div
                          key={block.id}
                          className="manager-day-bar"
                          style={{
                            left: `${((block.startMinute - MANAGER_TIMELINE_START) / (MANAGER_TIMELINE_END - MANAGER_TIMELINE_START)) * 100}%`,
                            width: `${(block.durationMinutes / (MANAGER_TIMELINE_END - MANAGER_TIMELINE_START)) * 100}%`,
                            ['--manager-bar-color' as string]: getBlockColor(block)
                          }}
                        >
                          <strong>{getBlockLabel(block)}</strong>
                          <span>{minuteToLabel(block.startMinute)} - {minuteToLabel(block.endMinute)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </article>

      <div className="stats-grid">
        <article className="stat-card">
          <span>项目总工时</span>
          <strong>{overview.totals.totalHours}h</strong>
        </article>
        <article className="stat-card">
          <span>延期率</span>
          <strong>{overview.totals.overdueRate}%</strong>
        </article>
        <article className="stat-card">
          <span>返工率</span>
          <strong>{overview.totals.reworkRate}%</strong>
        </article>
        <article className="stat-card">
          <span>阻塞任务率</span>
          <strong>{overview.totals.blockedRate}%</strong>
        </article>
      </div>

      <div className="content-grid analytics-grid">
        <article className="panel-card">
          <div className="card-header"><h3>项目</h3></div>
          <div className="chart-stack">
            {overview.projectHours.map((project) => (
              <div key={project.projectId} className="chart-row">
                <div className="chart-label">
                  <span className="color-dot" style={{ background: project.color }} />
                  <span>{project.name}</span>
                </div>
                <div className="load-bar">
                  <div
                    className="load-bar-fill"
                    style={{
                      width: `${Math.min(100, project.hours * 10)}%`,
                      background: project.color
                    }}
                  />
                </div>
                <strong>{project.hours}h</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="card-header"><h3>类型</h3></div>
          <div className="chart-stack">
            {overview.workTypeHours.map((item) => (
              <div key={item.type} className="chart-row">
                <div className="chart-label">
                  <span className="color-dot" style={{ background: workTypeColor[item.type] }} />
                  <span>{workTypeLabel[item.type]}</span>
                </div>
                <div className="load-bar">
                  <div
                    className="load-bar-fill alt"
                    style={{
                      width: `${Math.min(100, item.hours * 12)}%`,
                      background: workTypeColor[item.type]
                    }}
                  />
                </div>
                <strong>{item.hours}h</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="card-header"><h3>返工 / 阻塞</h3></div>
          <div className="split-panels">
            <div>
              <h4>返工</h4>
              <div className="stack-list">
                {reworkDistribution.map((item) => (
                  <div key={item.reason} className="metric-row">
                    <span>{reworkReasonLabel[item.reason as keyof typeof reworkReasonLabel]}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4>阻塞</h4>
              <div className="stack-list">
                {blockDistribution.map((item) => (
                  <div key={item.reason} className="metric-row">
                    <span>{blockReasonLabel[item.reason as keyof typeof blockReasonLabel]}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="card-header"><h3>负载</h3></div>
          <div className="stack-list">
            {weeklyLoad.map(({ employee, dailyHours }) => (
              <div key={employee.id} className="load-person-row">
                <div className="metric-label">
                  <strong>{employee.name}</strong>
                  <span>{employee.title}</span>
                </div>
                <div className="mini-heatmap">
                  {dailyHours.map((item) => (
                    <div
                      key={item.date}
                      className="heat-cell"
                      style={{ opacity: Math.max(0.2, item.hours / employee.capacityHoursPerDay) }}
                    >
                      {item.hours}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="card-header"><h3>切换</h3></div>
          <div className="stack-list">
            {contextSwitches.map((item) => (
              <div key={item.employeeId} className="metric-row">
                <span>{item.name}</span>
                <strong>{item.switches} 次</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="card-header"><h3>风险</h3></div>
          <div className="stack-list">
            {riskyTasks.map((item) => (
              <div key={item.task.id} className="risk-row">
                <div>
                  <strong>{item.task.title}</strong>
                  <p>
                    实际
                    {' '}
                    {item.metrics.actualHours}
                    h / 预估
                    {' '}
                    {item.task.estimateHours}
                    h
                  </p>
                </div>
                <span className={`risk-badge risk-${item.snapshot?.riskLevel}`}>
                  {item.snapshot ? riskLevelLabel[item.snapshot.riskLevel] : '风险'}
                </span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
