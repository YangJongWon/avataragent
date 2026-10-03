import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { can, seesEverything, SHARE_ROLES, type Action } from '../../shared/access.ts';
import { TEAMS } from '../../shared/teams.ts';
import type { Agent, OfficeEvent, Snapshot } from '../../shared/types.ts';
import { currentStepLabel, planProgress } from '../../shared/workflow.ts';
import { api, useOffice } from './api.ts';
import { Drawer } from './components/Drawer.tsx';
import { HireTab } from './components/HireTab.tsx';
import { AgentCardModal, HelpDialog, NewOfficeModal, NewTaskModal, PlanEditModal, RulesModal } from './components/Modals.tsx';
import { ModelsTab } from './components/ModelsTab.tsx';
import { ProfitTab } from './components/ProfitTab.tsx';
import { ReportPanel } from './components/ReportPanel.tsx';
import { OfficeTabMenu } from './components/OfficeTabMenu.tsx';
import { ShareModal } from './components/ShareModal.tsx';
import { TeamDataPanel } from './components/TeamDataPanel.tsx';
import { WorkflowView } from './components/WorkflowView.tsx';
import { krw, roleTitle } from './format.ts';
import { OfficeView } from './office/OfficeView.tsx';
import { useCompact } from './useCompact.ts';

type Tab = 'office' | 'hire' | 'models' | 'profit';
type Dialog =
  | { kind: 'newTask' }
  | { kind: 'newOffice' }
  | { kind: 'help' }
  | { kind: 'share'; officeIds?: string[] }
  | { kind: 'plan'; taskId: string }
  | { kind: 'rules'; agentId: string }
  | { kind: 'card'; agentId: string }
  | null;

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

const DISABLED_TABS = ['업무 게시판', '업무 설계', '근무·효율', '설정'];
const ACTIVE = ['running', 'awaiting_help', 'awaiting_approval'];
const LONG_PRESS_MS = 500;

function officeIdOfEvent(event: OfficeEvent, snapshot: Snapshot) {
  if (event.agentId) return snapshot.agents.find((a) => a.id === event.agentId)?.officeId ?? null;
  if (event.taskId) return snapshot.tasks.find((t) => t.id === event.taskId)?.officeId ?? null;
  const officeId = event.payload.officeId;
  return typeof officeId === 'string' ? officeId : null;
}

export function App() {
  const { snapshot, events, connected, onEvent } = useOffice();
  const [tab, setTab] = useState<Tab>('office');
  const [officeId, setOfficeId] = useState('office_dev');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drawer, setDrawer] = useState<'flow' | 'report' | null>(null);
  const [tabMenu, setTabMenu] = useState<{ officeId: string; x: number; y: number } | null>(null);
  const closeTabMenu = useCallback(() => setTabMenu(null), []);
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const compact = useCompact();
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const officeIdRef = useRef(officeId);
  officeIdRef.current = officeId;

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);
  const showError = useCallback((text: string) => toast(text, 'error'), [toast]);

  useEffect(
    () =>
      onEvent((event) => {
        const snap = snapshotRef.current;
        const eventOffice = snap ? officeIdOfEvent(event, snap) : null;
        const here = eventOffice === null || eventOffice === officeIdRef.current;
        const officeName = snap?.offices.find((o) => o.id === eventOffice)?.name ?? '';
        if (event.type === 'task.created' && here && !event.payload.queued) setSelectedTaskId(event.taskId ?? null);
        if (event.type === 'task.created' && event.payload.queued) toast(`${officeName} 대기열에 추가했어요: ${String(event.payload.title ?? '')}`);
        if (event.type === 'budget.threshold_reached') toast('월 AI 예산의 80%를 사용했어요.', 'error');
        if (event.type === 'budget.exceeded') toast(`${officeName || '회사'} 예산을 모두 써서 실행을 멈췄어요.`, 'error');
        if (event.type === 'task.failed') toast(`${officeName} 업무가 중단됐어요: ${String(event.payload.reason ?? '')}`, 'error');
        if (event.type === 'team.applied') toast(`${officeName}: ${String(event.payload.summary ?? '')}`);
        if (!here && event.type === 'agent.help_requested') toast(`${officeName} 직원이 곤란해하고 있어요. 탭을 눌러 도와주세요.`);
        if (!here && event.type === 'approval.requested') toast(`${officeName}에서 승인을 기다리고 있어요.`);
      }),
    [onEvent, toast],
  );

  const officeOnEvent = useCallback(
    (listener: (event: OfficeEvent) => void) =>
      onEvent((event) => {
        const snap = snapshotRef.current;
        if (snap && officeIdOfEvent(event, snap) === officeIdRef.current) listener(event);
      }),
    [onEvent],
  );

  const view = useMemo(() => {
    if (!snapshot) return null;
    return {
      ...snapshot,
      agents: snapshot.agents.filter((a) => a.officeId === officeId),
      tasks: snapshot.tasks.filter((t) => t.officeId === officeId),
    };
  }, [snapshot, officeId]);

  const officeEvents = useMemo(
    () => (snapshot ? events.filter((e) => officeIdOfEvent(e, snapshot) === officeId) : []),
    [events, snapshot, officeId],
  );

  const firstOfficeId = snapshot?.offices[0]?.id;
  const officeMissing = Boolean(snapshot && !snapshot.offices.some((o) => o.id === officeId));
  useEffect(() => {
    if (officeMissing && firstOfficeId) setOfficeId(firstOfficeId);
  }, [officeMissing, firstOfficeId]);

  if (!snapshot || !view) {
    return <div className="loading">사무실 문을 여는 중… {connected ? '' : '(서버 연결 대기)'}</div>;
  }
  if (snapshot.offices.length === 0) {
    return (
      <div className="loading">
        공유받은 사무실이 없어요. 공유한 사람에게 새 링크를 받아 주세요. <a href="/logout">나가기</a>
      </div>
    );
  }

  const viewer = snapshot.viewer;
  const isOwner = viewer.kind === 'owner';
  const office = snapshot.offices.find((o) => o.id === officeId) ?? snapshot.offices[0];
  const allowed = (action: Action) => can(viewer, action, office.id);
  const denied = (what: string) => toast(`이 공유 링크로는 ${what}할 수 없어요.`, 'error');
  const team = TEAMS[office.team];
  const task =
    view.tasks.find((t) => t.id === selectedTaskId) ?? view.tasks.find((t) => ACTIVE.includes(t.status)) ?? view.tasks[0];
  const queuedCount = view.tasks.filter((t) => t.status === 'queued').length;
  const helpTask = view.tasks.find((t) => t.help);
  const officeBusy = view.tasks.some((t) => ACTIVE.includes(t.status));
  const pendingCount =
    office.team === 'hr'
      ? snapshot.mailbox.filter((m) => !m.processed).length
      : office.team === 'support'
        ? snapshot.inquiries.filter((q) => q.status === 'new').length
        : 0;
  const agentById = (id: string) => snapshot.agents.find((a) => a.id === id);
  const remaining = snapshot.budget.monthlyKrw - snapshot.budget.spentKrw;
  const profit = snapshot.budget.valueKrw - snapshot.budget.spentKrw;

  const switchOffice = (id: string) => {
    setOfficeId(id);
    setSelectedTaskId(null);
    setDialog(null);
  };

  const closeOffice = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" 사무실을 닫을까요? 직원과 업무 기록이 함께 사라져요.`)) return;
    try {
      await api.deleteOffice(id);
      if (id === officeId) switchOffice('office_dev');
      toast(`${name} 사무실을 닫았어요.`);
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };

  const openTabMenu = (id: string, x: number, y: number) => {
    if (isOwner) setTabMenu({ officeId: id, x, y });
  };
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  const tabPressHandlers = (id: string) =>
    isOwner
      ? {
          onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault();
            cancelPress();
            if (press.current) press.current.fired = true;
            openTabMenu(id, e.clientX, e.clientY);
          },
          onPointerDown: (e: React.PointerEvent) => {
            cancelPress();
            press.current = null;
            if (e.pointerType === 'mouse') return;
            const { clientX: x, clientY: y } = e;
            press.current = {
              x,
              y,
              fired: false,
              timer: window.setTimeout(() => {
                if (press.current) press.current.fired = true;
                navigator.vibrate?.(15);
                openTabMenu(id, x, y);
              }, LONG_PRESS_MS),
            };
          },
          onPointerMove: (e: React.PointerEvent) => {
            const p = press.current;
            if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
          },
          onPointerUp: cancelPress,
          onPointerCancel: cancelPress,
        }
      : {};
  const menuOffice = tabMenu ? snapshot.offices.find((o) => o.id === tabMenu.officeId) : undefined;
  const menuBusy = menuOffice ? snapshot.tasks.some((t) => t.officeId === menuOffice.id && ACTIVE.includes(t.status)) : false;

  const togglePause = async (agent: Agent) => {
    try {
      await api.setPaused(agent.id, !agent.paused);
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };

  const startTask = async () => {
    try {
      await api.createTask({ officeId: office.id });
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };

  const needsMeHere = view.tasks.filter((t) => t.status === 'awaiting_help' || t.status === 'awaiting_approval').length;
  const progress = task ? planProgress(task) : null;
  const flowSummary = task && progress ? `${task.title} · ${currentStepLabel(task)} (${progress.done}/${progress.total})` : '아직 업무가 없어요';

  const scene = (
    <OfficeView
      key={`${office.id}-scene`}
      snapshot={view}
      office={office}
      onEvent={officeOnEvent}
      onNewTask={() => (allowed('operate') ? setDialog({ kind: 'newTask' }) : denied('업무를 등록'))}
      onHelp={() => {
        if (!allowed('operate')) return denied('도움 요청에 답');
        if (helpTask) setDialog({ kind: 'help' });
        else toast('지금은 도움을 기다리는 직원이 없어요.');
      }}
      onShowTask={() => {
        setSelectedTaskId(view.tasks[0]?.id ?? null);
        if (compact) setDrawer('report');
      }}
      onEditRules={(agentId) => (allowed('manage') ? setDialog({ kind: 'rules', agentId }) : denied('규칙을 편집'))}
      onShowCard={(agentId) => setDialog({ kind: 'card', agentId })}
      onTogglePause={(agent) => (allowed('manage') ? togglePause(agent) : denied('직원을 멈추거나 재개'))}
    />
  );
  const workflow = (
    <WorkflowView
      key={`${office.id}-flow`}
      task={task}
      agents={view.agents}
      team={office.team}
      onEdit={task?.status === 'queued' && allowed('operate') ? () => setDialog({ kind: 'plan', taskId: task.id }) : undefined}
    />
  );
  const report = (
    <ReportPanel
      key={`${office.id}-report`}
      team={office.team}
      teamData={
        <TeamDataPanel
          snapshot={snapshot}
          office={office}
          busy={officeBusy}
          canManage={allowed('manage')}
          onStart={startTask}
          onError={showError}
          onNotice={toast}
        />
      }
      task={task}
      tasks={view.tasks}
      agents={view.agents}
      events={officeEvents}
      canOperate={allowed('operate')}
      onSelectTask={setSelectedTaskId}
      onHelp={() => setDialog({ kind: 'help' })}
      onError={showError}
    />
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🏢 {snapshot.companyName}</div>
        <nav className="main-tabs">
          {(
            [
              ['office', '사무실'],
              ['hire', '직원 고용'],
              ['models', '모델 관리'],
              ['profit', '손익·결산'],
            ] as [Tab, string][]
          )
            .filter(([id]) => isOwner || id === 'office')
            .map(([id, label]) => (
              <button key={id} className={`main-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          {isOwner &&
            DISABLED_TABS.map((label) => (
              <button key={label} className="main-tab" disabled title="알파 이후 추가 예정">
                {label}
              </button>
            ))}
        </nav>
        <div className="money">
          {viewer.kind === 'share' && (
            <span className="share-viewer" title={viewer.officeIds === 'all' ? '전체 사무실' : `${viewer.officeIds.length}개 사무실`}>
              👀 {viewer.name} · {SHARE_ROLES[viewer.role].label}
              <a href="/logout">나가기</a>
            </span>
          )}
          {seesEverything(viewer) && (
            <>
              <span title="이번 달 남은 AI 예산">잔액 {krw(remaining)}</span>
              <span title="인정 가치 - 비용" className={profit < 0 ? 'neg' : 'pos'}>
                이익 {krw(profit)}
              </span>
            </>
          )}
          <span className={`provider ${snapshot.provider}`} title={snapshot.model}>
            {snapshot.provider === 'mock' ? '시뮬레이션' : snapshot.provider === 'agents' ? '직원별 AI' : snapshot.provider.toUpperCase()}
          </span>
          <span className={`dot ${connected ? 'on' : 'off'}`} title={connected ? '서버 연결됨' : '연결 끊김'} />
        </div>
      </header>

      {(tab === 'office' || tab === 'hire') && (
        <nav className="office-tabs">
          {snapshot.offices.map((o) => {
            const tasks = snapshot.tasks.filter((t) => t.officeId === o.id);
            const needsMe = tasks.filter((t) => t.status === 'awaiting_help' || t.status === 'awaiting_approval').length;
            const running = tasks.some((t) => t.status === 'running');
            const waiting = tasks.filter((t) => t.status === 'queued').length;
            const meta = TEAMS[o.team];
            return (
              <button
                key={o.id}
                className={`office-tab ${o.id === officeId ? 'active' : ''}`}
                style={{ background: o.id === officeId ? meta.wall : undefined }}
                onClick={() => {
                  if (press.current?.fired) {
                    press.current = null;
                    return;
                  }
                  switchOffice(o.id);
                }}
                {...tabPressHandlers(o.id)}
                title={isOwner ? `${meta.description}\n우클릭(길게 누르기): 공유·닫기` : meta.description}
              >
                {meta.emoji} {o.name}
                {running && <span className="tab-running" title="일하는 중" />}
                {needsMe > 0 && <span className="tab-badge">{needsMe}</span>}
                {waiting > 0 && (
                  <span className="tab-queue" title={`대기 업무 ${waiting}건`}>
                    +{waiting}
                  </span>
                )}
                {o.autoRun && <span className="tab-auto">AUTO</span>}
              </button>
            );
          })}
          {isOwner && (
            <button className="office-tab add" onClick={() => setDialog({ kind: 'newOffice' })} title="새 사무실 열기">
              + 사무실
            </button>
          )}
          <span className="office-tab-desc muted small">{team.description}</span>
        </nav>
      )}
      {tabMenu && menuOffice && (
        <OfficeTabMenu
          title={`${TEAMS[menuOffice.team].emoji} ${menuOffice.name}`}
          x={tabMenu.x}
          y={tabMenu.y}
          onClose={closeTabMenu}
          items={[
            { label: '🔗 이 사무실 공유', run: () => setDialog({ kind: 'share', officeIds: [menuOffice.id] }) },
            { label: '🏢 전체 사무실 공유', run: () => setDialog({ kind: 'share' }) },
            {
              label: '🗑 사무실 닫기',
              danger: true,
              run: () => void closeOffice(menuOffice.id, menuOffice.name),
              disabled: !menuOffice.custom || menuBusy,
              hint: !menuOffice.custom ? '기본 사무실은 닫을 수 없어요' : menuBusy ? '진행 중인 업무가 끝나면 닫을 수 있어요' : undefined,
            },
          ]}
        />
      )}

      {tab === 'office' && !compact && (
        <main className="office-layout">
          <section className="office-col">
            {scene}
            {workflow}
          </section>
          {report}
        </main>
      )}
      {tab === 'office' && compact && (
        <main className="compact-main">
          <div className="compact-stage">{scene}</div>
          <Drawer
            side="bottom"
            open={drawer === 'flow'}
            onOpenChange={(open) => setDrawer(open ? 'flow' : null)}
            handle={
              <>
                <span className="drawer-grip" />
                <span className="drawer-handle-text">
                  업무 여정 · {flowSummary}
                  {queuedCount > 0 && <span className="tab-queue">대기 {queuedCount}</span>}
                </span>
              </>
            }
          >
            {workflow}
          </Drawer>
          <Drawer
            side="right"
            open={drawer === 'report'}
            onOpenChange={(open) => setDrawer(open ? 'report' : null)}
            attention={needsMeHere > 0}
            handle={
              <>
                {needsMeHere > 0 && <span className="tab-badge">{needsMeHere}</span>}
                <span className="drawer-handle-vertical">
                  {helpTask ? '도움 요청' : view.tasks.some((t) => t.status === 'awaiting_approval') ? '승인 대기' : '업무·보고'}
                </span>
              </>
            }
          >
            {report}
          </Drawer>
        </main>
      )}
      {tab === 'hire' && (
        <HireTab key={office.id} office={office} agents={view.agents} onError={showError} onNotice={toast} onManageModels={() => setTab('models')} />
      )}
      {tab === 'models' && <ModelsTab snapshot={snapshot} onError={showError} onNotice={toast} />}
      {tab === 'profit' && <ProfitTab snapshot={snapshot} onError={showError} onNotice={toast} />}

      {dialog?.kind === 'newOffice' && (
        <NewOfficeModal
          onCreated={(created) => {
            switchOffice(created.id);
            toast(`${created.name} 사무실을 열었어요. 직원 4명이 출근했어요!`);
          }}
          onClose={() => setDialog(null)}
          onError={showError}
        />
      )}
      {dialog?.kind === 'newTask' && (
        <NewTaskModal
          office={office}
          agents={view.agents}
          busy={officeBusy}
          queuedCount={queuedCount}
          pendingCount={pendingCount}
          hourlyRateKrw={snapshot.budget.hourlyRateKrw}
          onClose={() => setDialog(null)}
          onError={showError}
        />
      )}
      {dialog?.kind === 'share' && isOwner && (
        <ShareModal snapshot={snapshot} initialOfficeIds={dialog.officeIds} onClose={() => setDialog(null)} onError={showError} onNotice={toast} />
      )}
      {dialog?.kind === 'plan' && view.tasks.find((t) => t.id === dialog.taskId) && (
        <PlanEditModal
          task={view.tasks.find((t) => t.id === dialog.taskId)!}
          team={office.team}
          agents={view.agents}
          onClose={() => setDialog(null)}
          onError={showError}
        />
      )}
      {dialog?.kind === 'help' && helpTask?.help && agentById(helpTask.help.agentId) && (
        <HelpDialog
          task={helpTask}
          agent={agentById(helpTask.help.agentId)!}
          roleTitle={roleTitle(agentById(helpTask.help.agentId)!, snapshot.offices)}
          onClose={() => setDialog(null)}
          onError={showError}
        />
      )}
      {dialog?.kind === 'rules' && agentById(dialog.agentId) && (
        <RulesModal
          agent={agentById(dialog.agentId)!}
          safetyRules={snapshot.safetyRules}
          onClose={() => setDialog(null)}
          onError={showError}
        />
      )}
      {dialog?.kind === 'card' && agentById(dialog.agentId) && (
        <AgentCardModal
          agent={agentById(dialog.agentId)!}
          roleTitle={roleTitle(agentById(dialog.agentId)!, snapshot.offices)}
          onClose={() => setDialog(null)}
        />
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
