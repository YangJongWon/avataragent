import { num, t, tpl } from '../../../shared/i18n.ts';
import type { FreeQuota } from '../../../shared/types.ts';

/** Today's free OpenRouter requests: how many are left of the allowance every free model shares, and when it fills up again. */
export function FreeQuotaBadge({ quota }: { quota: FreeQuota | undefined }) {
  // A server from before the count sends none.
  if (!quota) return null;
  const left = Math.max(0, quota.limit - quota.used);
  const level = left === 0 ? 'out' : left <= quota.limit * 0.2 ? 'low' : 'ok';
  const reset = new Date(quota.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <span
      className={`free-quota free-quota-${level}`}
      title={
        quota.checkedAt
          ? tpl('모든 OpenRouter 무료 모델이 함께 쓰는 하루 {limit}회 한도예요. OpenRouter 계정 기준 횟수이고 {time}에 다시 채워져요.', { limit: num(quota.limit), time: reset })
          : tpl('모든 OpenRouter 무료 모델이 함께 쓰는 하루 {limit}회 한도예요. 이 앱에서 보낸 횟수로 셉니다. {time}에 다시 채워져요.', { limit: num(quota.limit), time: reset })
      }
    >
      {tpl('무료 모델 공용 · 오늘 {left}/{limit}회 남음', { left: num(left), limit: num(quota.limit) })}
      {left === 0 && <> · {t('다 썼어요')}</>}
    </span>
  );
}
