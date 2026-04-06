import { useEffect, useMemo, useState } from 'react';
import { AnalyticsView } from './components/AnalyticsView';
import { DashboardView } from './components/DashboardView';
import { TaskBoardView } from './components/TaskBoardView';
import { TimelineView } from './components/TimelineView';
import { initialState } from './data/mockData';
import { buildProgressSnapshots } from './lib/analytics';
import { loadState, saveState } from './lib/storage';
import { shiftDate, toIsoDate } from './lib/time';
import type {
  AppState,
  BlockRecord,
  DraftTimeBlock,
  ReworkRecord,
  Task,
  TaskStatus,
  TimeBlock,
  WorkType
} from './types';
import './styles.css';

type ActiveView = 'dashboard' | 'timeline' | 'tasks' | 'analytics';
type TimelineMode = 'day' | 'week';
type NoticeTone = 'info' | 'error';

const navItems: Array<{ id: ActiveView; label: string }> = [
  { id: 'dashboard', label: '工作台' },
  { id: 'timeline', label: '日程' },
  { id: 'tasks', label: '任务' },
  { id: 'analytics', label: '统计' }
];

const viewMeta: Record<ActiveView, { title: string; subtitle: string }> = {
  dashboard: { title: '工作台', subtitle: '总览' },
  timeline: { title: '日程', subtitle: '时间轴录入' },
  tasks: { title: '任务', subtitle: '分发与流转' },
  analytics: { title: '统计', subtitle: '执行分析' }
};

function getDefaultProjectId(state: AppState) {
  return state.timeBlocks.find((block) => block.employeeId === state.currentUserId)?.projectId ?? state.projects[0]?.id;
}

function getSelectedDateSeed(state: AppState) {
  return [...state.timeBlocks].sort((left, right) => right.date.localeCompare(left.date))[0]?.date ?? '2026-04-06';
}

function inferWorkType(taskType?: Task['taskType']): WorkType {
  if (taskType === 'bug') {
    return 'bugfix';
  }
  if (taskType === 'research') {
    return 'research';
  }
  return 'frontend';
}

function withSnapshots(nextState: AppState) {
  return {
    ...nextState,
    progressSnapshots: buildProgressSnapshots(nextState)
  };
}

function hasBlockOverlap(blocks: TimeBlock[], candidate: Pick<TimeBlock, 'date' | 'employeeId' | 'startMinute' | 'endMinute'>, ignoreId?: string) {
  return blocks.some((block) => {
    if (ignoreId && block.id === ignoreId) {
      return false;
    }

    if (block.employeeId !== candidate.employeeId || block.date !== candidate.date) {
      return false;
    }

    return candidate.startMinute < block.endMinute && candidate.endMinute > block.startMinute;
  });
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? initialState);
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('week');
  const [selectedDate, setSelectedDate] = useState(getSelectedDateSeed(state));
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(state.tasks[0]?.id);
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);

  const currentUser = useMemo(
    () => state.employees.find((employee) => employee.id === state.currentUserId)!,
    [state.currentUserId, state.employees]
  );
  const selectedDateBlockCount = useMemo(
    () =>
      state.timeBlocks.filter(
        (block) => block.employeeId === state.currentUserId && block.date === selectedDate
      ).length,
    [selectedDate, state.currentUserId, state.timeBlocks]
  );
  const toolbarMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'long'
      }).format(new Date(`${selectedDate}T00:00:00`)),
    [selectedDate]
  );

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function mutateState(updater: (current: AppState) => AppState) {
    setState((current) => withSnapshots(updater(current)));
  }

  function showNotice(text: string, tone: NoticeTone = 'error') {
    setNotice({ tone, text });
  }

  function createBlock(draft: DraftTimeBlock) {
    const task = state.tasks.find((item) => item.id === (draft.taskId ?? selectedTaskId));
    const recentProjectId = getDefaultProjectId(state);
    const now = new Date().toISOString();
    const blockId = crypto.randomUUID();
    const nextBlock: TimeBlock = {
      id: blockId,
      employeeId: state.currentUserId,
      projectId: task?.projectId ?? recentProjectId,
      moduleId: task?.moduleId,
      taskId: task?.id,
      workType: inferWorkType(task?.taskType),
      summary: task?.title ?? '新时间块',
      date: draft.date,
      startMinute: draft.startMinute,
      endMinute: draft.endMinute,
      durationMinutes: Math.max(30, draft.endMinute - draft.startMinute),
      isRework: false,
      isBlocked: false,
      isOvertime: false,
      source: draft.source,
      createdAt: now,
      updatedAt: now
    };

    if (hasBlockOverlap(state.timeBlocks, nextBlock)) {
      showNotice('这个时间段已经有日程，不能重复叠加。');
      return undefined;
    }

    mutateState((current) => ({
      ...current,
      timeBlocks: [...current.timeBlocks, nextBlock]
    }));

    setNotice(null);
    return blockId;
  }

  function updateBlock(blockId: string, patch: Partial<TimeBlock>) {
    mutateState((current) => {
      const target = current.timeBlocks.find((block) => block.id === blockId);
      if (!target) {
        return current;
      }

      const updatedBlock: TimeBlock = {
        ...target,
        ...patch,
        durationMinutes:
          patch.startMinute !== undefined || patch.endMinute !== undefined
            ? Math.max(30, (patch.endMinute ?? target.endMinute) - (patch.startMinute ?? target.startMinute))
            : target.durationMinutes,
        updatedAt: new Date().toISOString()
      };

      if (hasBlockOverlap(current.timeBlocks, updatedBlock, blockId)) {
        showNotice('调整后的时间与已有日程冲突，已保留原排期。');
        return current;
      }

      const timeBlocks = current.timeBlocks.map((block) => (block.id === blockId ? updatedBlock : block));

      let reworkRecords = current.reworkRecords.filter(
        (record) => !(record.timeBlockId === blockId && !updatedBlock.isRework)
      );

      if (updatedBlock.isRework) {
        const existing = reworkRecords.find((record) => record.timeBlockId === blockId);
        if (existing) {
          reworkRecords = reworkRecords.map((record) =>
            record.id === existing.id
              ? { ...record, reason: updatedBlock.reworkReason ?? record.reason, taskId: updatedBlock.taskId ?? record.taskId }
              : record
          );
        } else {
          const newRecord: ReworkRecord = {
            id: crypto.randomUUID(),
            taskId: updatedBlock.taskId ?? 'manual-entry',
            timeBlockId: updatedBlock.id,
            reason: updatedBlock.reworkReason ?? 'requirements_change',
            source: 'time_block_flag',
            createdAt: new Date().toISOString(),
            createdBy: current.currentUserId
          };
          reworkRecords = [...reworkRecords, newRecord];
        }
      }

      let blockRecords = current.blockRecords.filter(
        (record) => !(record.timeBlockId === blockId && !updatedBlock.isBlocked)
      );

      if (updatedBlock.isBlocked) {
        const existing = blockRecords.find((record) => record.timeBlockId === blockId);
        if (existing) {
          blockRecords = blockRecords.map((record) =>
            record.id === existing.id
              ? { ...record, reason: updatedBlock.blockReason ?? record.reason, taskId: updatedBlock.taskId }
              : record
          );
        } else {
          const newRecord: BlockRecord = {
            id: crypto.randomUUID(),
            taskId: updatedBlock.taskId,
            timeBlockId: updatedBlock.id,
            employeeId: updatedBlock.employeeId,
            reason: updatedBlock.blockReason ?? 'waiting_feedback',
            note: updatedBlock.summary,
            startedAt: new Date().toISOString()
          };
          blockRecords = [...blockRecords, newRecord];
        }
      }

      return {
        ...current,
        timeBlocks,
        reworkRecords,
        blockRecords
      };
    });
  }

  function deleteBlock(blockId: string) {
    mutateState((current) => ({
      ...current,
      timeBlocks: current.timeBlocks.filter((block) => block.id !== blockId),
      reworkRecords: current.reworkRecords.filter((record) => record.timeBlockId !== blockId),
      blockRecords: current.blockRecords.filter((record) => record.timeBlockId !== blockId)
    }));
    setSelectedBlockId(undefined);
  }

  function clearSelectedDateBlocks(date: string) {
    const blocksForDate = state.timeBlocks.filter(
      (block) => block.employeeId === state.currentUserId && block.date === date
    );

    if (blocksForDate.length === 0) {
      showNotice('这一天没有可删除的日程。', 'info');
      return;
    }

    const ids = new Set(blocksForDate.map((block) => block.id));
    mutateState((current) => ({
      ...current,
      timeBlocks: current.timeBlocks.filter((block) => !ids.has(block.id)),
      reworkRecords: current.reworkRecords.filter((record) => !record.timeBlockId || !ids.has(record.timeBlockId)),
      blockRecords: current.blockRecords.filter((record) => !record.timeBlockId || !ids.has(record.timeBlockId))
    }));

    if (selectedBlockId && ids.has(selectedBlockId)) {
      setSelectedBlockId(undefined);
    }

    showNotice(`已删除 ${date} 的 ${blocksForDate.length} 条日程。`, 'info');
  }

  function createTask(draft: {
    title: string;
    projectId: string;
    assigneeId: string;
    priority: Task['priority'];
    estimateHours: number;
    dueDate: string;
    taskType: Task['taskType'];
    moduleId?: string;
    description: string;
  }) {
    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();
    const task: Task = {
      id: taskId,
      projectId: draft.projectId,
      moduleId: draft.moduleId,
      title: draft.title,
      description: draft.description,
      dispatcherId: currentUser.id,
      assigneeId: draft.assigneeId,
      priority: draft.priority,
      status: 'todo',
      estimateHours: draft.estimateHours,
      dueDate: draft.dueDate,
      reopenedCount: 0,
      taskType: draft.taskType,
      createdAt: now,
      updatedAt: now
    };

    mutateState((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      statusHistory: [
        {
          id: crypto.randomUUID(),
          taskId,
          toStatus: 'todo',
          changedBy: current.currentUserId,
          changedAt: now
        },
        ...current.statusHistory
      ]
    }));
    setSelectedTaskId(taskId);
    setActiveView('tasks');
  }

  function changeTaskStatus(taskId: string, status: TaskStatus) {
    mutateState((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task || task.status === status) {
        return current;
      }

      const now = new Date().toISOString();
      const isFallback =
        (task.status === 'in_review' || task.status === 'done') &&
        (status === 'todo' || status === 'in_progress' || status === 'blocked');
      const reopenedCount = isFallback ? task.reopenedCount + 1 : task.reopenedCount;

      let reworkRecords = current.reworkRecords;
      if (isFallback) {
        reworkRecords = [
          {
            id: crypto.randomUUID(),
            taskId,
            reason: 'test_failure',
            source: 'status_fallback',
            createdAt: now,
            createdBy: current.currentUserId
          },
          ...reworkRecords
        ];
      }

      return {
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === taskId
            ? {
                ...item,
                status,
                reopenedCount,
                completedAt: status === 'done' ? now : item.completedAt,
                updatedAt: now
              }
            : item
        ),
        statusHistory: [
          {
            id: crypto.randomUUID(),
            taskId,
            fromStatus: task.status,
            toStatus: status,
            changedBy: current.currentUserId,
            changedAt: now
          },
          ...current.statusHistory
        ],
        reworkRecords
      };
    });
  }

  function copyPreviousDay(date: string) {
    mutateState((current) => {
      const sourceDate = shiftDate(date, -1);
      const sourceBlocks = current.timeBlocks.filter(
        (block) => block.employeeId === current.currentUserId && block.date === sourceDate
      );

      if (sourceBlocks.length === 0) {
        showNotice('前一天没有可复制的日程。', 'info');
        return current;
      }

      const accepted: TimeBlock[] = [];
      let skipped = 0;

      sourceBlocks.forEach((block) => {
        const clone: TimeBlock = {
          ...block,
          id: crypto.randomUUID(),
          date,
          source: 'batch_copy',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (hasBlockOverlap([...current.timeBlocks, ...accepted], clone)) {
          skipped += 1;
          return;
        }

        accepted.push(clone);
      });

      if (accepted.length === 0) {
        showNotice('复制失败：目标日期已有冲突日程。');
        return current;
      }

      showNotice(
        skipped > 0 ? `已复制 ${accepted.length} 条，跳过 ${skipped} 条冲突日程。` : `已复制 ${accepted.length} 条昨日安排。`,
        'info'
      );

      return {
        ...current,
        timeBlocks: [...current.timeBlocks, ...accepted]
      };
    });
  }

  function copyPreviousWeek(date: string) {
    mutateState((current) => {
      const sourceDateString = shiftDate(date, -7);
      const sourceBlocks = current.timeBlocks.filter(
        (block) => block.employeeId === current.currentUserId && block.date === sourceDateString
      );

      if (sourceBlocks.length === 0) {
        showNotice('上周同日没有可复制的日程。', 'info');
        return current;
      }

      const accepted: TimeBlock[] = [];
      let skipped = 0;

      sourceBlocks.forEach((block) => {
        const clone: TimeBlock = {
          ...block,
          id: crypto.randomUUID(),
          date,
          source: 'batch_copy',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (hasBlockOverlap([...current.timeBlocks, ...accepted], clone)) {
          skipped += 1;
          return;
        }

        accepted.push(clone);
      });

      if (accepted.length === 0) {
        showNotice('复制失败：目标日期已有冲突日程。');
        return current;
      }

      showNotice(
        skipped > 0 ? `已复制 ${accepted.length} 条，跳过 ${skipped} 条冲突日程。` : `已复制 ${accepted.length} 条上周安排。`,
        'info'
      );

      return {
        ...current,
        timeBlocks: [...current.timeBlocks, ...accepted]
      };
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark">●</span>
          <div>
            <h1>工时</h1>
            <p>任务与记录</p>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              <strong>{item.label}</strong>
            </button>
          ))}
        </nav>
      </aside>

      <div className="profile-card floating-profile-card">
        <div className="avatar-badge">{currentUser.avatar}</div>
        <div>
          <strong>{currentUser.name}</strong>
          <p>{currentUser.title}</p>
        </div>
      </div>

      <section className="workspace-shell">
        <header className="main-toolbar">
          <div className="toolbar-leading">
            <div className="traffic-lights" aria-hidden="true">
              <span className="traffic-light close" />
              <span className="traffic-light minimize" />
              <span className="traffic-light expand" />
            </div>
            <div className="toolbar-title-group">
              <strong>{viewMeta[activeView].title}</strong>
              <span>{viewMeta[activeView].subtitle}</span>
            </div>
          </div>
          {activeView === 'timeline' ? (
            <div className="toolbar-inline-controls" aria-label="日程控制">
              <div className="toolbar-month-chip">{toolbarMonthLabel}</div>
              <div className="segmented-control">
                <button className={timelineMode === 'day' ? 'active' : ''} onClick={() => setTimelineMode('day')}>
                  日视图
                </button>
                <button className={timelineMode === 'week' ? 'active' : ''} onClick={() => setTimelineMode('week')}>
                  周视图
                </button>
              </div>
              <div className="date-nav-group">
                <button
                  className="icon-button"
                  aria-label={timelineMode === 'week' ? '上一周' : '上一天'}
                  onClick={() => setSelectedDate(shiftDate(selectedDate, timelineMode === 'week' ? -7 : -1))}
                >
                  ←
                </button>
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
                <button
                  className="icon-button"
                  aria-label={timelineMode === 'week' ? '下一周' : '下一天'}
                  onClick={() => setSelectedDate(shiftDate(selectedDate, timelineMode === 'week' ? 7 : 1))}
                >
                  →
                </button>
              </div>
              <button className="secondary-button" onClick={() => copyPreviousDay(selectedDate)}>
                复制昨日
              </button>
              <button className="secondary-button" onClick={() => copyPreviousWeek(selectedDate)}>
                复制上周
              </button>
              <button className="secondary-button" onClick={() => setSelectedDate(toIsoDate(new Date()))}>
                {timelineMode === 'week' ? '回到本周' : '回到今日'}
              </button>
              <button
                className="danger-button"
                disabled={selectedDateBlockCount === 0}
                onClick={() => clearSelectedDateBlocks(selectedDate)}
              >
                删除当日日程
              </button>
            </div>
          ) : null}
        </header>
        {notice ? <div className={`top-notice ${notice.tone}`}>{notice.text}</div> : null}

        <main className="main-stage">
          {activeView === 'dashboard' ? (
            <DashboardView
              state={state}
              selectedDate={selectedDate}
              onOpenTimeline={() => setActiveView('timeline')}
              onOpenTaskBoard={() => setActiveView('tasks')}
            />
          ) : null}
          {activeView === 'timeline' ? (
            <TimelineView
              state={state}
              selectedDate={selectedDate}
              mode={timelineMode}
              selectedTaskId={selectedTaskId}
              selectedBlockId={selectedBlockId}
              onSelectedDateChange={setSelectedDate}
              onModeChange={setTimelineMode}
              onSelectTask={setSelectedTaskId}
              onSelectBlock={setSelectedBlockId}
              onCreateBlock={createBlock}
              onUpdateBlock={updateBlock}
              onDeleteBlock={deleteBlock}
              onCopyPreviousDay={copyPreviousDay}
              onCopyPreviousWeek={copyPreviousWeek}
            />
          ) : null}
          {activeView === 'tasks' ? (
            <TaskBoardView
              state={state}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onStatusChange={changeTaskStatus}
              onCreateTask={createTask}
            />
          ) : null}
          {activeView === 'analytics' ? <AnalyticsView state={state} selectedDate={selectedDate} /> : null}
        </main>
      </section>
    </div>
  );
}
