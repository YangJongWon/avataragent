import { planHas } from '../../../shared/plans.ts';
import { projectProgress } from '../../../shared/project.ts';
import type { Office, Person, Snapshot, Task } from '../../../shared/types.ts';
import { planProgress } from '../../../shared/workflow.ts';
import { api } from '../api.ts';

const THEMES: Record<Office['team'], { icon: string; name: string; scene: string }> = {
  dev: { icon: '🚀', name: '우주선', scene: '발사 준비' },
  hr: { icon: '🏠', name: '팀 하우스', scene: '입주 준비' },
  mgmt: { icon: '🏙️', name: '본부 빌딩', scene: '준공 준비' },
  support: { icon: '🚢', name: '지원선', scene: '출항 준비' },
  welfare: { icon: '🌳', name: '회복 정원', scene: '개장 준비' },
};

const ACTIVE = new Set<Task['status']>(['running', 'awaiting_help', 'awaiting_approval']);

function taskUnits(task: Task) {
  const { done, total } = planProgress(task);
  return { done: task.status === 'completed' ? Math.max(1, total) : done, total: Math.max(1, total) };
}

function ownerId(snapshot: Snapshot) {
  return snapshot.viewer.kind === 'member' ? snapshot.viewer.memberId : snapshot.viewer.kind === 'owner' ? 'owner' : null;
}

function contribution(person: Person, tasks: Task[]) {
  const assigned = tasks.filter((task) => task.assigneeId === person.id);
  const units = assigned.map(taskUnits);
  return {
    assigned: assigned.length,
    completed: assigned.filter((task) => task.status === 'completed').length,
    done: units.reduce((sum, item) => sum + item.done, 0),
  };
}

export function ProjectLounge({ snapshot, onOpenOffice, onError }: { snapshot: Snapshot; onOpenOffice: (officeId: string) => void; onError: (message: string) => void }) {
  if (!planHas(snapshot.plan, 'projectLounge')) {
    return (
      <main className="lounge-page lounge-locked">
        <div className="lounge-lock-card">
          <div className="lounge-lock-model">🏗️</div>
          <h2>공용 프로젝트 라운지</h2>
          <p>팀이 맡은 일이 하나의 모형으로 완성되는 공간이에요.</p>
          <p className="muted">팀 플랜부터 프로젝트 진행 모형, 구성원 담당 업무와 기여 현황을 함께 볼 수 있어요.</p>
          <button onClick={() => onOpenOffice('plan')}>팀 플랜 살펴보기</button>
        </div>
      </main>
    );
  }

  const visiblePeople = snapshot.people ?? [];
  const me = ownerId(snapshot);
  const officeProgresses = snapshot.offices.map((office) => projectProgress(office, snapshot.tasks.filter((task) => task.officeId === office.id)));
  const overall = officeProgresses.length ? Math.round(officeProgresses.reduce((sum, item) => sum + item.progress, 0) / officeProgresses.length * 100) : 0;
  const completedUnits = snapshot.tasks.map(taskUnits).reduce((sum, item) => sum + item.done, 0);

  return (
    <main className="lounge-page">
      <section className="lounge-hero">
        <div>
          <span className="eyebrow">공용 세미나실</span>
          <h1>우리 프로젝트가 {overall}% 완성됐어요</h1>
          <p>사무실에서 끝낸 업무가 이곳의 모형과 설계도를 조금씩 완성합니다.</p>
        </div>
        <div className="lounge-overall" aria-label={`전체 진행률 ${overall}%`}>
          <strong>{overall}%</strong>
          <span>전체 진행</span>
        </div>
      </section>

      <section className="project-model-grid">
        {snapshot.offices.map((office) => {
          const theme = THEMES[office.team];
          const tasks = snapshot.tasks.filter((task) => task.officeId === office.id);
          const calculated = projectProgress(office, tasks);
          const progress = calculated.percent;
          const active = tasks.filter((task) => ACTIVE.has(task.status)).length;
          const waiting = tasks.filter((task) => task.status === 'queued').length;
          return (
            <article className="project-model-card" key={office.id}>
              <header>
                <div>
                  <span className="model-kind">{theme.icon} {theme.name}</span>
                  <h2>{office.name}</h2>
                </div>
                <strong className="model-percent">{progress}%</strong>
              </header>
              <div className={`project-model theme-${office.team}`}>
                <div className="blueprint-grid" />
                <div className="model-icon" style={{ filter: `grayscale(${progress === 0 ? 1 : 0})`, opacity: 0.3 + progress / 143 }}>
                  {theme.icon}
                </div>
                <div className="model-parts">
                  {calculated.milestones.map((milestone) => (
                    <span key={milestone.id} className={milestone.progress >= 1 ? 'built' : milestone.progress > 0 ? 'building' : ''} title={`${milestone.label}: ${Math.round(milestone.progress * 100)}% · 가중치 ${milestone.weight}%`}>
                      {milestone.progress >= 1 ? '◆' : milestone.progress > 0 ? '◈' : '◇'} {milestone.label} {Math.round(milestone.progress * 100)}%
                    </span>
                  ))}
                </div>
              </div>
              <div className="model-progress"><span style={{ width: `${progress}%` }} /></div>
              <footer>
                <span>{tasks.filter((task) => task.status === 'completed').length}개 완료</span>
                <span>{active ? `${active}개 작업 중` : waiting ? `${waiting}개 대기` : theme.scene}</span>
                <button onClick={() => onOpenOffice(office.id)}>작업실 가기</button>
              </footer>
              {calculated.unclassified.length > 0 && (
                <details className="unclassified-tasks">
                  <summary>⚠ 진행률 미분류 업무 {calculated.unclassified.length}개</summary>
                  {calculated.unclassified.map((task) => (
                    <label key={task.id}>
                      <span>{task.title}</span>
                      <select
                        value=""
                        onChange={(event) => {
                          const milestoneId = event.target.value;
                          if (!milestoneId) return;
                          void api.setTaskMilestone(task.id, milestoneId).catch((error) => onError(error instanceof Error ? error.message : String(error)));
                        }}
                      >
                        <option value="">마일스톤 지정…</option>
                        {calculated.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.label} ({milestone.weight}%)</option>)}
                      </select>
                    </label>
                  ))}
                </details>
              )}
            </article>
          );
        })}
      </section>

      <section className="contribution-board">
        <header>
          <div>
            <span className="eyebrow">역할과 기여</span>
            <h2>누가 어느 부분을 만들고 있나요?</h2>
          </div>
          <span className="muted">완료 단계 기준 · 순위가 아닌 협업 현황</span>
        </header>
        <div className="contribution-list">
          {visiblePeople.map((person) => {
            const c = contribution(person, snapshot.tasks);
            const share = completedUnits ? Math.round((c.done / completedUnits) * 100) : 0;
            const current = snapshot.tasks.find((task) => task.assigneeId === person.id && ACTIVE.has(task.status));
            return (
              <div className={`contribution-row ${person.id === me ? 'mine' : ''}`} key={person.id}>
                <span className="person-avatar">{person.id === 'owner' ? '👑' : '🙂'}</span>
                <div className="person-work">
                  <strong>{person.name}{person.id === me ? ' · 나' : ''}</strong>
                  <span>{current ? `${current.title} 담당 중` : c.assigned ? `담당 업무 ${c.assigned}개` : '새 역할을 기다리는 중'}</span>
                </div>
                <div className="person-meter"><span style={{ width: `${Math.min(100, share)}%` }} /></div>
                <strong className="person-share">{share}%</strong>
                <span className="person-done">완료 {c.completed}/{c.assigned}</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
