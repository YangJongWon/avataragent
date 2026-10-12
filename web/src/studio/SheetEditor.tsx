import { t, tpl } from '../../../shared/i18n.ts';
import { STATE_FALLBACK, type StateClip, type ThemeState } from '../../../shared/theme-pack.ts';
import { gridSize, type StudioCharacter } from './buildPackage.ts';

/** States grouped the way people think about them; every name here is a ThemeState. */
export const STATE_GROUPS: { label: string; states: { id: ThemeState; label: string }[] }[] = [
  {
    label: t('기본'),
    states: [
      { id: 'idle', label: t('서 있기 (필수)') },
      { id: 'walk', label: t('걷기') },
      { id: 'sit', label: t('앉기') },
      { id: 'back', label: t('뒷모습') },
      { id: 'walk_back', label: t('뒷모습 걷기') },
    ],
  },
  {
    label: t('직원 상태'),
    states: [
      { id: 'working', label: t('일하는 중') },
      { id: 'collaborating', label: t('협업 중') },
      { id: 'waiting', label: t('기다리는 중') },
      { id: 'awaiting_approval', label: t('승인 대기') },
      { id: 'help_requested', label: t('도움 요청') },
      { id: 'paused', label: t('일시정지') },
      { id: 'error', label: t('오류') },
    ],
  },
  {
    label: t('표정'),
    states: [
      { id: 'smile', label: t('웃음') },
      { id: 'focus', label: t('집중') },
      { id: 'sweat', label: t('진땀') },
      { id: 'troubled', label: t('곤란') },
      { id: 'panic', label: t('당황') },
      { id: 'thanks', label: t('고마움') },
      { id: 'celebrate', label: t('축하') },
    ],
  },
  {
    label: t('업무 순간'),
    states: [
      { id: 'step.brief', label: t('과제 접수') },
      { id: 'step.research', label: t('자료 조사') },
      { id: 'step.draft', label: t('초안 작성') },
      { id: 'step.review', label: t('검토') },
      { id: 'review.rejected', label: t('반려당함') },
      { id: 'task.approved', label: t('업무 승인') },
      { id: 'budget.exceeded', label: t('예산 초과') },
    ],
  },
];

/** Labels are Korean catalogue keys, shown through t(). */
export const stateLabel = (id: ThemeState) => t(STATE_GROUPS.flatMap((g) => g.states).find((s) => s.id === id)?.label ?? id);

interface Props {
  character: StudioCharacter;
  sheetUrl: string;
  state: ThemeState;
  onState: (state: ThemeState) => void;
  onChange: (patch: Partial<StudioCharacter>) => void;
}

export function SheetEditor({ character, sheetUrl, state, onState, onChange }: Props) {
  const { cols, rows } = gridSize(character);
  const clip = character.states[state];
  const fallback = STATE_FALLBACK[state];

  const setClip = (next: StateClip | null) => {
    const states = { ...character.states };
    if (next && next.frames.length) states[state] = next;
    else delete states[state];
    onChange({ states });
  };
  const addFrame = (frame: string) => setClip({ frames: [...(clip?.frames ?? []), frame], fps: clip?.fps ?? 6, loop: clip?.loop ?? true });
  const num = (value: string, fallbackValue: number) => (Number.isFinite(Number(value)) && value !== '' ? Number(value) : fallbackValue);

  return (
    <div className="sheet-editor">
      <div className="row studio-fields">
        <label>
          {t('프레임 너비')}
          <input type="number" min={1} value={character.frameW} onChange={(e) => onChange({ frameW: num(e.target.value, 0) })} />
        </label>
        <label>
          {t('프레임 높이')}
          <input type="number" min={1} value={character.frameH} onChange={(e) => onChange({ frameH: num(e.target.value, 0) })} />
        </label>
        <label>
          {t('크기 배율')}
          <input type="number" min={0.05} max={16} step={0.05} value={character.scale} onChange={(e) => onChange({ scale: num(e.target.value, 1) })} />
        </label>
        <label title={t('프레임 안에서 발이 닿는 위치 (0~1)')}>
          {t('발 위치 y')}
          <input type="number" min={0} max={1} step={0.01} value={character.anchor.y} onChange={(e) => onChange({ anchor: { ...character.anchor, y: num(e.target.value, 1) } })} />
        </label>
        <label title={t('프레임 안에서 머리 꼭대기 위치 (0~1). 모자를 여기에 얹어요')}>
          {t('머리 위치 y')}
          <input type="number" min={0} max={1} step={0.01} value={character.head.y} onChange={(e) => onChange({ head: { ...character.head, y: num(e.target.value, 0) } })} />
        </label>
        <span className="muted small">
          {tpl('{cols}×{rows} = {n}칸', { cols, rows, n: cols * rows })}
        </span>
      </div>

      <div className="state-picker">
        {STATE_GROUPS.map((group) => (
          <div key={group.label} className="state-group">
            <span className="muted small">{t(group.label)}</span>
            {group.states.map((s) => (
              <button key={s.id} className={`state-chip${s.id === state ? ' selected' : ''}${character.states[s.id] ? ' filled' : ''}`} onClick={() => onState(s.id)}>
                {t(s.label)}
                {character.states[s.id] && <b> {character.states[s.id]!.frames.length}</b>}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="state-clip">
        <b>{stateLabel(state)}</b>
        {clip ? (
          <>
            <span className="clip-frames">
              {clip.frames.map((f, i) => (
                <button key={`${f}-${i}`} className="state-chip filled" title={t('눌러서 빼기')} onClick={() => setClip({ ...clip, frames: clip.frames.filter((_, j) => j !== i) })}>
                  {f}
                </button>
              ))}
            </span>
            <label>
              {t('초당 장 수')}
              <input type="number" min={1} max={30} value={clip.fps} onChange={(e) => setClip({ ...clip, fps: num(e.target.value, 6) })} />
            </label>
            <label className="toggle">
              <input type="checkbox" checked={clip.loop} onChange={(e) => setClip({ ...clip, loop: e.target.checked })} />
              {t('반복')}
            </label>
            <button className="pixel-btn small" onClick={() => setClip(null)}>
              {t('비우기')}
            </button>
          </>
        ) : (
          <span className="muted small">
            {t('아래 칸을 눌러 프레임을 넣으세요.')}{fallback && ` ${tpl('비워 두면 “{state}” 동작으로 보여요.', { state: stateLabel(fallback) })}`}
          </span>
        )}
      </div>

      <div className="sheet-grid" style={{ aspectRatio: `${character.sheet.w} / ${character.sheet.h}` }}>
        <img src={sheetUrl} alt="" draggable={false} />
        {Array.from({ length: cols * rows }, (_, i) => (
          <button
            key={i}
            className={`sheet-cell${clip?.frames.includes(`f${i}`) ? ' used' : ''}`}
            style={{
              left: `${((i % cols) * character.frameW * 100) / character.sheet.w}%`,
              top: `${(Math.floor(i / cols) * character.frameH * 100) / character.sheet.h}%`,
              width: `${(character.frameW * 100) / character.sheet.w}%`,
              height: `${(character.frameH * 100) / character.sheet.h}%`,
            }}
            title={`f${i}`}
            onClick={() => addFrame(`f${i}`)}
          >
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}
