import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { can, seesEverything, shareRoleLabel, type Action } from '../../shared/access.ts';
import { TEAMS } from '../../shared/teams.ts';
import { usesFreeQuota } from '../../shared/models.ts';
import type { Agent, OfficeEvent, Snapshot } from '../../shared/types.ts';
import { currentStepLabel, planProgress } from '../../shared/workflow.ts';
import { api, useOffice } from './api.ts';
import { DemoTour } from './components/DemoTour.tsx';
import { Drawer } from './components/Drawer.tsx';
import { FreeQuotaBadge } from './components/FreeQuotaBadge.tsx';
import { HelpPanel } from './components/HelpPanel.tsx';
import { CommunityTab } from './components/CommunityTab.tsx';
import { HireTab } from './components/HireTab.tsx';
import { AgentCardModal, HelpDialog, NewOfficeModal, NewTaskModal, RulesModal } from './components/Modals.tsx';
import { McpTab } from './components/McpTab.tsx';
import { ModelsTab } from './components/ModelsTab.tsx';
import { ChatPanel, isMine } from './components/ChatPanel.tsx';
import { MembersTab } from './components/MembersTab.tsx';
import { PerformanceTab } from './components/PerformanceTab.tsx';
import { COMPANY_CHANNEL, taskChannel } from '../../shared/chat.ts';
import { planHas } from '../../shared/plans.ts';
import { ProfitTab } from './components/ProfitTab.tsx';
import { ProjectLounge } from './components/ProjectLounge.tsx';
import { ReportPanel } from './components/ReportPanel.tsx';
import { OfficeTabMenu } from './components/OfficeTabMenu.tsx';
import { OfficeSettingsModal } from './components/OfficeSettingsModal.tsx';
import { SettingsTab } from './components/SettingsTab.tsx';
import { ShareModal } from './components/ShareModal.tsx';
import { TeamDataPanel } from './components/TeamDataPanel.tsx';
import { WorkflowView } from './components/WorkflowView.tsx';
import { WorkTab } from './components/WorkTab.tsx';
import { krw, roleTitle } from './format.ts';
import { OfficeView } from './office/OfficeView.tsx';
import { useDemoPlayback } from './demoPlayback.ts';
import { useCompact, useStacked } from './useCompact.ts';
import { useLanguage } from './LanguageProvider.tsx';
import { tpl } from '../../shared/i18n.ts';
import { officeTheme } from '../../shared/theme-pack.ts';
import { ThemesTab } from './components/ThemesTab.tsx';
import { ThemeStudio } from './studio/ThemeStudio.tsx';
import { themeApi } from './themeApi.ts';
import { useThemePack } from './useThemePack.ts';
import { currencyFor, saveCurrency, savedCurrency, setDisplayCurrency, type CurrencyChoice } from './currency.ts';

type Tab = 'office' | 'lounge' | 'hire' | 'models' | 'mcp' | 'profit' | 'perf' | 'work' | 'members' | 'settings' | 'themes' | 'studio' | 'community';
type Dialog =
  | { kind: 'newTask' }
  | { kind: 'newOffice' }
  | { kind: 'help' }
  | { kind: 'share'; officeIds?: string[] }
  | { kind: 'officeSettings'; officeId: string }
  | { kind: 'rules'; agentId: string }
  | { kind: 'card'; agentId: string }
  | null;

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

const DISABLED_TABS = ['업무 게시판', '업무 설계'];
const ACTIVE = ['running', 'awaiting_help', 'awaiting_approval'];
const LONG_PRESS_MS = 500;

function officeIdOfEvent(event: OfficeEvent, snapshot: Snapshot) {
  if (event.agentId) return snapshot.agents.find((a) => a.id === event.agentId)?.officeId ?? null;
  if (event.taskId) return snapshot.tasks.find((t) => t.id === event.taskId)?.officeId ?? null;
  const officeId = event.payload.officeId;
  return typeof officeId === 'string' ? officeId : null;
}

export function App() {
  const { t, language } = useLanguage();
  const { snapshot: rawSnapshot, events, connected, onEvent } = useOffice();
  // 기본 직원 이름은 나라별 이름으로 보여 준다. 직접 지은 이름은 그대로 두고, 원래 이름은 sourceName에 남긴다.
  const snapshot = useMemo(
    () => (rawSnapshot ? { ...rawSnapshot, agents: rawSnapshot.agents.map((a) => (t(a.name) === a.name ? a : { ...a, name: t(a.name), sourceName: a.name })) } : rawSnapshot),
    [rawSnapshot, language, t],
  );
  const [tab, setTab] = useState<Tab>('office');
  const [officeId, setOfficeId] = useState('office_dev');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drawer, setDrawer] = useState<'flow' | 'report' | null>(null);
  const [tabMenu, setTabMenu] = useState<{ officeId: string; x: number; y: number } | null>(null);
  const closeTabMenu = useCallback(() => setTabMenu(null), []);
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const [demo, setDemo] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatChannel, setChatChannel] = useState(COMPANY_CHANNEL);
  const [chatSeenAt, setChatSeenAt] = useState(() => localStorage.getItem('chatSeenAt') ?? '');
  const latestChatAt = snapshot?.chat?.at(-1)?.at ?? '';
  useEffect(() => {
    if (!chatOpen || !latestChatAt || latestChatAt <= chatSeenAt) return;
    setChatSeenAt(latestChatAt);
    localStorage.setItem('chatSeenAt', latestChatAt);
  }, [chatOpen, latestChatAt, chatSeenAt]);
  // 화면 언어와 통화는 사람마다 다르게 고를 수 있는 개인 설정이라 이 브라우저에만 저장한다.
  // 서버의 언어 값은 AI 결과물을 쓸 언어(회사 공통)일 뿐 화면 언어를 바꾸지 않는다.
  const [currencyChoice, setCurrencyChoice] = useState<CurrencyChoice>(savedCurrency);
  const currency = currencyFor(currencyChoice, language);
  const [, setFxVersion] = useState(0);
  useEffect(() => {
    let active = true;
    if (currency === 'KRW') {
      setDisplayCurrency('KRW', null);
      setFxVersion((n) => n + 1);
      return;
    }
    api.krwRate(currency).then(
      ({ rate }) => {
        if (!active) return;
        setDisplayCurrency(currency, rate);
        setFxVersion((n) => n + 1);
      },
      () => {
        if (!active) return;
        setDisplayCurrency('KRW', null);
        setFxVersion((n) => n + 1);
      },
    );
    return () => {
      active = false;
    };
  }, [currency]);
  const chooseCurrency = (choice: CurrencyChoice) => {
    saveCurrency(choice);
    setCurrencyChoice(choice);
  };
  const demoPress = useRef<number | null>(null);
  const compact = useCompact();
  const stacked = useStacked() && compact;
  useEffect(() => {
    if (stacked) setDrawer((d) => (d === 'flow' ? null : d));
  }, [stacked]);
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

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('billing');
    if (!result) return;
    const message: Record<string, [string, Toast['tone']]> = {
      success: ['결제가 끝나 플랜이 바뀌었어요.', 'info'],
      failed: ['결제가 실패했어요. 플랜은 그대로예요.', 'error'],
      canceled: ['결제를 취소했어요.', 'info'],
      expired: ['끝났거나 없는 결제예요.', 'error'],
    };
    const [text, tone] = message[result] ?? message.expired;
    toast(t(text), tone);
    if (result === 'success') setTab('members');
    url.searchParams.delete('billing');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [toast]);

  useEffect(
    () =>
      onEvent((event) => {
        const snap = snapshotRef.current;
        const eventOffice = snap ? officeIdOfEvent(event, snap) : null;
        const here = eventOffice === null || eventOffice === officeIdRef.current;
        const officeName = snap?.offices.find((o) => o.id === eventOffice)?.name ?? '';
        if (event.type === 'task.created' && here && !event.payload.queued) setSelectedTaskId(event.taskId ?? null);
        if (event.type === 'task.created' && event.payload.queued) toast(tpl('{officeName} 대기열에 추가했어요: {v}', { officeName, v: String(event.payload.title ?? '') }));
        if (event.type === 'budget.threshold_reached') toast(t('월 AI 예산의 80%를 사용했어요.'), 'error');
        if (event.type === 'budget.exceeded') toast(tpl('{v} 예산을 모두 써서 실행을 멈췄어요.', { v: officeName || t('회사') }), 'error');
        if (event.type === 'task.failed') toast(tpl('{officeName} 업무가 중단됐어요: {v}', { officeName, v: String(event.payload.reason ?? '') }), 'error');
        if (event.type === 'team.applied') toast(`${officeName}: ${String(event.payload.summary ?? '')}`);
        if (!here && event.type === 'agent.help_requested') toast(tpl('{officeName} 직원이 곤란해하고 있어요. 탭을 눌러 도와주세요.', { officeName }));
        if (!here && event.type === 'approval.requested') toast(tpl('{officeName}에서 승인을 기다리고 있어요.', { officeName }));
      }),
    [onEvent, toast],
  );

  const playback = useDemoPlayback(demo, snapshot, officeId);
  const demoPlaying = playback.agents !== null;
  const demoPlayingRef = useRef(demoPlaying);
  demoPlayingRef.current = demoPlaying;
  const subscribeDemo = playback.subscribe;

  const officeOnEvent = useCallback(
    (listener: (event: OfficeEvent) => void) => {
      const offServer = onEvent((event) => {
        const snap = snapshotRef.current;
        if (demoPlayingRef.current) return;
        if (snap && officeIdOfEvent(event, snap) === officeIdRef.current) listener(event);
      });
      const offDemo = subscribeDemo(listener);
      return () => {
        offServer();
        offDemo();
      };
    },
    [onEvent, subscribeDemo],
  );

  const view = useMemo(() => {
    if (!snapshot) return null;
    if (playback.agents && playback.task) {
      return { ...snapshot, agents: playback.agents, tasks: [playback.task] };
    }
    return {
      ...snapshot,
      agents: snapshot.agents.filter((a) => a.officeId === officeId),
      tasks: snapshot.tasks.filter((t) => t.officeId === officeId),
    };
  }, [snapshot, officeId, playback.agents, playback.task]);

  const officeEvents = useMemo(
    () => (snapshot ? events.filter((e) => officeIdOfEvent(e, snapshot) === officeId) : []),
    [events, snapshot, officeId],
  );

  const firstOfficeId = snapshot?.offices[0]?.id;
  const officeMissing = Boolean(snapshot && !snapshot.offices.some((o) => o.id === officeId));
  useEffect(() => {
    if (officeMissing && firstOfficeId) setOfficeId(firstOfficeId);
  }, [officeMissing, firstOfficeId]);

  // The whole page wears the site theme when one is set, otherwise the theme of the office being looked at.
  const themedOffice = snapshot?.offices.find((o) => o.id === officeId) ?? snapshot?.offices[0];
  const siteTheme = snapshot?.siteTheme ?? null;
  const themePack = useThemePack(
    siteTheme ?? (themedOffice && officeTheme(themedOffice, snapshot?.theme, snapshot?.themeBookings)),
    siteTheme !== null || themedOffice?.themeCss !== false,
  );

  if (!snapshot || !view) {
    return <div className="loading">{t('사무실 문을 여는 중…')} {connected ? '' : t('(서버 연결 대기)')}</div>;
  }
  if (snapshot.offices.length === 0) {
    return (
      <div className="loading">
        {t('공유받은 사무실이 없어요. 공유한 사람에게 새 링크를 받아 주세요.')} <a href="/logout">{t('나가기')}</a>
      </div>
    );
  }

  const viewer = snapshot.viewer;
  const isOwner = viewer.kind === 'owner';
  const office = snapshot.offices.find((o) => o.id === officeId) ?? snapshot.offices[0];
  const themeId = officeTheme(office, snapshot.theme, snapshot.themeBookings);
  const allowed = (action: Action) => can(viewer, action, office.id);
  const denied = (what: string) => toast(tpl('지금 권한으로는 {what}할 수 없어요.', { what }), 'error');
  const chatOn = planHas(snapshot.plan, 'chat') && viewer.kind !== 'share';
  const unread = chatOn ? snapshot.chat.filter((m) => m.at > chatSeenAt && !isMine(snapshot, m)).length : 0;
  const openChat = (channel: string) => {
    setChatChannel(channel);
    setChatOpen(true);
  };
  const openTask = (taskId: string) => {
    const target = snapshot.tasks.find((t) => t.id === taskId);
    if (!target) return;
    setTab('office');
    setOfficeId(target.officeId);
    setSelectedTaskId(target.id);
    if (compact) setDrawer('report');
  };
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
    if (!window.confirm(tpl('"{name}" 사무실을 닫을까요? 직원과 업무 기록이 함께 사라져요.', { name }))) return;
    try {
      await api.deleteOffice(id);
      if (id === officeId) switchOffice('office_dev');
      toast(tpl('{name} 사무실을 닫았어요.', { name }));
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
  const startDemo = () => {
    setTab('office');
    setDialog(null);
    setShowHelp(false);
    setTabMenu(null);
    setDrawer(null);
    setDemo(true);
  };
  const demoPressHandlers = {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (demoPress.current) window.clearTimeout(demoPress.current);
      startDemo();
    },
    onPointerDown: () => {
      if (demoPress.current) window.clearTimeout(demoPress.current);
      demoPress.current = window.setTimeout(() => {
        demoPress.current = null;
        navigator.vibrate?.(15);
        startDemo();
      }, LONG_PRESS_MS);
    },
    onPointerUp: () => demoPress.current && window.clearTimeout(demoPress.current),
    onPointerLeave: () => demoPress.current && window.clearTimeout(demoPress.current),
    onPointerCancel: () => demoPress.current && window.clearTimeout(demoPress.current),
  };
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
  const flowSummary = task && progress ? `${t(task.title)} · ${t(currentStepLabel(task))} (${progress.done}/${progress.total})` : t('아직 업무가 없어요');

  const scene = (
    <OfficeView
      key={`${office.id}-scene`}
      snapshot={view}
      office={office}
      onEvent={officeOnEvent}
      onNewTask={() => (allowed('operate') ? setDialog({ kind: 'newTask' }) : denied(t('업무를 등록')))}
      onHelp={() => {
        if (!allowed('operate')) return denied(t('도움 요청에 답'));
        if (helpTask) setDialog({ kind: 'help' });
        else toast(t('지금은 도움을 기다리는 직원이 없어요.'));
      }}
      onShowTask={() => {
        setSelectedTaskId(view.tasks[0]?.id ?? null);
        if (compact) setDrawer('report');
      }}
      onEditRules={(agentId) => (allowed('manage') ? setDialog({ kind: 'rules', agentId }) : denied(t('규칙을 편집')))}
      onShowCard={(agentId) => setDialog({ kind: 'card', agentId })}
      onTogglePause={(agent) => (allowed('manage') ? togglePause(agent) : denied(t('직원을 멈추거나 재개')))}
    />
  );
  const workflow = (
    <WorkflowView
      key={`${office.id}-flow`}
      task={task}
      agents={view.agents}
      team={office.team}
      dense={compact}
      maxRows={stacked ? 3 : compact ? 2 : undefined}
      edit={
        allowed('operate')
          ? {
              officeId: office.id,
              flows: snapshot.flows,
              canManageFlows: isOwner,
              canSaveFlows: isOwner,
              onSave: async (steps) => {
                await api.updatePlan(task!.id, steps);
                toast(t('업무 여정을 저장했어요.'));
              },
              onApprove: async (valueKrw) => {
                await api.approve(task!.id, valueKrw);
              },
              onRequestChanges: async (comment) => {
                await api.requestChanges(task!.id, comment);
              },
              onSaveFlow: async (flow) => {
                await api.saveFlow(flow, 'mine');
                toast(t('다음 업무에서 쓸 흐름으로 저장했어요.'));
              },
              onError: showError,
            }
          : undefined
      }
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
      onDiscuss={chatOn ? (taskId) => openChat(taskChannel(taskId)) : undefined}
      people={
        planHas(snapshot.plan, 'assignees') && viewer.kind !== 'share'
          ? (snapshot.people ?? []).filter((p) => p.officeIds === 'all' || p.officeIds.includes(office.id))
          : undefined
      }
    />
  );

  return (
    <div className="app" {...themePack.attrs}>
        <header className="topbar">
          <div className="brand">
            {planHas(snapshot.plan, 'companyLogo') ? <img className="brand-logo" src={snapshot.companyLogo ?? '/company-logo.png'} alt="" /> : '🏢'} {t(snapshot.companyName)}
          </div>
          <nav className="main-tabs">
            {(
              [
                ['office', t('사무실')],
                ['lounge', t('프로젝트 라운지')],
                ['hire', t('직원 관리')],
                ['themes', t('테마')],
                ['community', t('커뮤니티')],
                ['models', t('모델 관리')],
                ['mcp', t('MCP 관리')],
                ['profit', t('손익·결산')],
                ['perf', t('성과·개선')],
                ['members', t('플랜·구성원')],
                ['settings', t('환경 설정')],
                ['work', t('근무·효율')],
              ] as [Tab, string][]
            )
              .filter(([id]) => isOwner || id === 'office' || id === 'lounge')
              .map(([id, label]) => (
                <button key={id} className={`main-tab ${tab === id || (id === 'themes' && tab === 'studio') ? 'active' : ''}`} onClick={() => setTab(id)}>
                  {t(label)}
                </button>
              ))}
            {isOwner &&
              DISABLED_TABS.map((label) => (
                <button key={label} className="main-tab" disabled title={t('알파 이후 추가 예정')}>
                  {t(label)}
                </button>
              ))}
          </nav>
          <div className="money">
            <button className="main-tab help-btn" onClick={() => setShowHelp(true)} title={t('사용법 묻기')}>
              ❓ {t('도움말')}
            </button>
            {chatOn && (
              <button
                className="main-tab chat-btn"
                onClick={() => (chatOpen ? setChatOpen(false) : openChat(chatChannel))}
                title={t('그룹 채팅')}
              >
                💬 {t('채팅')}
                {unread > 0 && <span className="chat-unread">{unread > 99 ? '99+' : unread}</span>}
              </button>
            )}
            {viewer.kind !== 'owner' && (
              <span className="share-viewer" title={viewer.officeIds === 'all' ? t('전체 사무실') : tpl('{officeIdsCount}개 사무실', { officeIdsCount: viewer.officeIds.length })}>
                {viewer.kind === 'member' ? '🙂' : '👀'} {viewer.name} · {shareRoleLabel(viewer.role)}
                <a href="/logout">{t('나가기')}</a>
              </span>
            )}
            {seesEverything(viewer) && (
              <>
                <span title={t('이번 달 남은 AI 예산')}>
                  {t('잔액')} {krw(remaining)}
                </span>
                <span title={t('인정 가치 - 비용')} className={profit < 0 ? 'neg' : 'pos'}>
                  {t('이익')} {krw(profit)}
                </span>
              </>
            )}
            <span
              className={`provider ${snapshot.provider}${demo ? ' demo' : ''}`}
              title={tpl('{model}\n길게 누르기(우클릭): 사용법 데모', { model: snapshot.model })}
              {...demoPressHandlers}
            >
              {demo ? t('📝 데모 중') : snapshot.provider === 'mock' ? t('시뮬레이션') : snapshot.provider === 'agents' ? t('직원별 AI') : snapshot.provider.toUpperCase()}
            </span>
            <span className={`dot ${connected ? 'on' : 'off'}`} title={connected ? t('서버 연결됨') : t('연결 끊김')} />
          </div>
        </header>

        {(tab === 'office' || tab === 'hire' || tab === 'themes') && (
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
                    // 이미 고른 사무실을 한 번 더 누르면 그 사무실 설정을 연다.
                    if (o.id === officeId) setDialog({ kind: 'officeSettings', officeId: o.id });
                    else switchOffice(o.id);
                  }}
                  {...tabPressHandlers(o.id)}
                  title={[o.description || t(meta.description), o.id === officeId ? t('한 번 더 누르면 사무실 설정') : '', isOwner ? t('우클릭(길게 누르기): 공유·닫기') : ''].filter(Boolean).join('\n')}
                >
                  {meta.emoji} {t(o.name)}
                  {running && <span className="tab-running" title={t('일하는 중')} />}
                  {needsMe > 0 && <span className="tab-badge">{needsMe}</span>}
                  {waiting > 0 && (
                    <span className="tab-queue" title={tpl('대기 업무 {waiting}건', { waiting })}>
                      +{waiting}
                    </span>
                  )}
                  {o.autoRun && <span className="tab-auto">AUTO</span>}
                </button>
              );
            })}
            {isOwner && (
              <button className="office-tab add" onClick={() => setDialog({ kind: 'newOffice' })} title={t('새 사무실 열기')}>
                + {t('사무실')}
              </button>
            )}
            <button type="button" className="office-tab-desc muted small link-button" title={t('사무실 설정')} onClick={() => setDialog({ kind: 'officeSettings', officeId: office.id })}>
              {office.description || t(team.description)} ⚙️
            </button>
            {view.agents.some((a) => usesFreeQuota(a.model)) && <FreeQuotaBadge quota={snapshot.freeQuota} />}
          </nav>
        )}
        {tabMenu && menuOffice && (
          <OfficeTabMenu
            title={`${TEAMS[menuOffice.team].emoji} ${menuOffice.name}`}
            x={tabMenu.x}
            y={tabMenu.y}
            onClose={closeTabMenu}
            items={[
              {
                label: t('⚙️ 사무실 설정'),
                run: () => {
                  switchOffice(menuOffice.id);
                  setDialog({ kind: 'officeSettings', officeId: menuOffice.id });
                },
              },
              { label: t('🔗 이 사무실 공유'), run: () => setDialog({ kind: 'share', officeIds: [menuOffice.id] }) },
              { label: t('🏢 전체 사무실 공유'), run: () => setDialog({ kind: 'share' }) },
              {
                label: t('🎨 테마 바꾸기'),
                run: () => {
                  switchOffice(menuOffice.id);
                  setTab('themes');
                },
              },
              {
                label: t('🗑 사무실 닫기'),
                danger: true,
                run: () => void closeOffice(menuOffice.id, menuOffice.name),
                disabled: !menuOffice.custom || menuBusy,
                hint: !menuOffice.custom ? t('기본 사무실은 닫을 수 없어요') : menuBusy ? t('진행 중인 업무가 끝나면 닫을 수 있어요') : undefined,
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
          <main className={`compact-main${stacked ? ' stacked' : ''}`}>
            <div className="compact-stage">{scene}</div>
            {stacked ? (
              <section className="stacked-flow">{workflow}</section>
            ) : (
              <Drawer
                side="bottom"
                open={drawer === 'flow'}
                onOpenChange={(open) => setDrawer(open ? 'flow' : null)}
                handle={
                  <>
                    <span className="drawer-grip" />
                    <span className="drawer-handle-text">
                      {tpl('업무 여정 · {flowSummary}', { flowSummary })}
                      {queuedCount > 0 && <span className="tab-queue">{t('대기')} {queuedCount}</span>}
                    </span>
                  </>
                }
              >
                {workflow}
              </Drawer>
            )}
            <Drawer
              side="right"
              open={drawer === 'report'}
              onOpenChange={(open) => setDrawer(open ? 'report' : null)}
              attention={needsMeHere > 0}
              handle={
                <>
                  {needsMeHere > 0 && <span className="tab-badge">{needsMeHere}</span>}
                  <span className="drawer-handle-vertical">
                    {helpTask ? t('도움 요청') : view.tasks.some((t) => t.status === 'awaiting_approval') ? t('승인 대기') : t('업무·보고')}
                  </span>
                </>
              }
            >
              {report}
            </Drawer>
          </main>
        )}
        {tab === 'hire' && (
          <HireTab key={office.id} office={office} themeId={themeId} agents={view.agents} freeQuota={snapshot.freeQuota} onError={showError} onNotice={toast} onManageModels={() => setTab('models')} />
        )}
        {tab === 'lounge' && (
          <ProjectLounge
            snapshot={snapshot}
            onError={showError}
            onOpenOffice={(id) => {
              if (id === 'plan') setTab('members');
              else switchOffice(id);
            }}
          />
        )}
        {tab === 'models' && <ModelsTab snapshot={snapshot} onError={showError} onNotice={toast} />}
        {tab === 'mcp' && <McpTab snapshot={snapshot} onError={showError} onNotice={toast} />}
        {demo && <DemoTour onClose={() => setDemo(false)} />}
        {showHelp && <HelpPanel tab={tab} officeId={office?.id} onClose={() => setShowHelp(false)} />}
        {tab === 'profit' && <ProfitTab snapshot={snapshot} onError={showError} onNotice={toast} />}
        {tab === 'perf' && <PerformanceTab snapshot={snapshot} officeId={officeId} onError={showError} onNotice={toast} />}
        {tab === 'work' && <WorkTab snapshot={snapshot} onError={showError} onNotice={toast} />}
        {tab === 'members' && <MembersTab snapshot={snapshot} onError={showError} onNotice={toast} />}
        {tab === 'settings' && <SettingsTab snapshot={snapshot} currency={currencyChoice} onCurrency={chooseCurrency} onError={showError} onNotice={toast} />}
        {tab === 'community' && (
          <main className="page">
            <CommunityTab flows={snapshot.flows ?? []} onError={showError} onNotice={toast} />
          </main>
        )}
        {tab === 'themes' && (
          <main className="page">
          <ThemesTab
            isOwner={isOwner}
            companyTheme={snapshot.theme}
            bookings={snapshot.themeBookings ?? []}
            onBook={
              isOwner
                ? (bookings) =>
                    api
                      .setThemeBookings(bookings)
                      .then(() => toast(t('기간별 테마를 저장했어요.')))
                      .catch((e) => {
                        showError(e instanceof Error ? e.message : String(e));
                        throw e;
                      })
                : undefined
            }
            siteTheme={snapshot.siteTheme ?? null}
            onUseSite={
              isOwner
                ? (id) =>
                    void api
                      .setSiteTheme(id)
                      .then(
                        () => toast(id === null ? t('사이트 화면이 다시 사무실 테마를 따라요.') : t('사이트 화면 테마를 바꿨어요.')),
                        (e) => showError(e instanceof Error ? e.message : String(e)),
                      )
                : undefined
            }
            officeName={office.name}
            ownTheme={office.theme}
            onUseCompany={
              isOwner
                ? (id) =>
                    void api
                      .setCompanyTheme(id)
                      .then(() => toast(t('모든 사무실의 테마를 바꿨어요.')), (e) => showError(e instanceof Error ? e.message : String(e)))
                : undefined
            }
            onUseOffice={
              allowed('manage')
                ? (id) =>
                    void api
                      .updateOffice(office.id, { theme: id })
                      .then(
                        () => toast(id === null ? tpl('{name}이(가) 다시 공통 테마를 따라요.', { name: office.name }) : tpl('{name}에만 다른 테마를 쓰도록 바꿨어요.', { name: office.name })),
                        (e) => showError(e instanceof Error ? e.message : String(e)),
                      )
                : undefined
            }
            cssOn={office.themeCss !== false}
            onCssOn={(on) => void api.updateOffice(office.id, { themeCss: on }).catch((e) => showError(e instanceof Error ? e.message : String(e)))}
            onMake={() => setTab('studio')}
            onError={showError}
            onNotice={toast}
          />
          </main>
        )}
        {tab === 'studio' && (
          <main className="page">
            <div className="row studio-back">
              <button className="pixel-btn small" onClick={() => setTab('themes')}>
                {t('← 테마 목록')}
              </button>
              {snapshot.siteUrl && (
                <a className="pixel-btn small" href={`${snapshot.siteUrl}/community/upload?type=theme`} target="_blank" rel="noreferrer" title={t('스튜디오에서 내보낸 zip을 사이트에 올려요.')}>
                  {t('커뮤니티에 올리기')}
                </a>
              )}
            </div>
            <ThemeStudio
              onInstall={isOwner ? async (zip) => void (await themeApi.importZip(zip)) : undefined}
              onError={showError}
              onNotice={toast}
            />
          </main>
        )}
        {chatOn && chatOpen && (
          <ChatPanel
            snapshot={snapshot}
            channel={chatChannel}
            onChannel={setChatChannel}
            onOpenTask={openTask}
            onClose={() => setChatOpen(false)}
            onError={showError}
          />
        )}

        {dialog?.kind === 'newOffice' && (
          <NewOfficeModal
            onCreated={(created) => {
              switchOffice(created.id);
              toast(tpl('{name} 사무실을 열었어요. 직원 4명이 출근했어요!', { name: created.name }));
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
            flows={snapshot.flows ?? []}
            canSaveFlows={isOwner}
            onClose={() => setDialog(null)}
            onError={showError}
          />
        )}
        {dialog?.kind === 'share' && isOwner && (
          <ShareModal snapshot={snapshot} initialOfficeIds={dialog.officeIds} onClose={() => setDialog(null)} onError={showError} onNotice={toast} />
        )}
        {dialog?.kind === 'officeSettings' && snapshot.offices.find((o) => o.id === dialog.officeId) && (
          <OfficeSettingsModal
            office={snapshot.offices.find((o) => o.id === dialog.officeId)!}
            isOwner={isOwner}
            canManage={can(viewer, 'manage', dialog.officeId)}
            busy={snapshot.tasks.some((x) => x.officeId === dialog.officeId && ACTIVE.includes(x.status))}
            onShare={() => setDialog({ kind: 'share', officeIds: [dialog.officeId] })}
            onCloseOffice={() => {
              const target = snapshot.offices.find((o) => o.id === dialog.officeId)!;
              setDialog(null);
              void closeOffice(target.id, target.name);
            }}
            onClose={() => setDialog(null)}
            onError={showError}
            onNotice={toast}
          />
        )}
        {dialog?.kind === 'help' && helpTask?.help && agentById(helpTask.help.agentId) && (
          <HelpDialog
            task={helpTask}
            agent={agentById(helpTask.help.agentId)!}
            roleTitle={roleTitle(agentById(helpTask.help.agentId)!, snapshot.offices)}
            themeId={themeId}
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
            themeId={themeId}
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
