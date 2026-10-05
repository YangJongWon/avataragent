import { useEffect, useState } from 'react';
import type { PlanFeature, PlanMeta } from '../../../shared/plans.ts';
import { siteApi } from '../api.ts';
import { Link } from '../router.tsx';

const FEATURE_LABEL: Record<PlanFeature, string> = {
  members: '구성원 계정',
  chat: '회사 채팅과 업무별 대화',
  projectLounge: '프로젝트 라운지',
  assignees: '업무 담당자 지정',
  officeChannels: '사무실별 채널',
  activityExport: '활동 기록 내보내기',
};

/** What every plan has, including the free one. */
const ALWAYS = ['AI 직원 사무실과 업무 여정', '테마·플로우·플레이북 가져오기', '보기·운영 공유 링크', '모든 AI 제공자와 로컬 모델'];

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export function PricingPage() {
  const [plans, setPlans] = useState<PlanMeta[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    siteApi.plans().then(setPlans, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <section className="page">
      <h1>가격</h1>
      <p className="lead">앱은 무료로 설치해 쓸 수 있어요. 사람과 함께 일하는 기능이 필요할 때 팀·비즈니스 플랜을 고르세요. AI 사용료는 각자 쓰는 AI 회사에 직접 내요.</p>
      {error && <p className="error">{error}</p>}
      <div className="plans">
        {plans?.map((plan) => (
          <article key={plan.id} className={`card plan${plan.id === 'team' ? ' featured' : ''}`}>
            <h2>
              {plan.emoji} {plan.label}
            </h2>
            <div className="price">
              {plan.priceKrw ? (
                <>
                  <b>{won(plan.priceKrw)}</b> / 월
                </>
              ) : (
                <b>무료</b>
              )}
            </div>
            <p>{plan.description}</p>
            <ul className="checks">
              {ALWAYS.map((item) => (
                <li key={item}>{item}</li>
              ))}
              {plan.features.map((f) => (
                <li key={f}>
                  <b>{FEATURE_LABEL[f]}</b>
                </li>
              ))}
              {plan.maxMembers > 0 && <li>구성원 최대 {plan.maxMembers}명</li>}
            </ul>
            {plan.priceKrw ? (
              <p className="muted small">앱의 플랜·구성원 화면에서 고르면 이 사이트에서 결제하고, 끝나면 그 설치에 바로 적용돼요. 지금은 시험 결제로 열려 있어요.</p>
            ) : (
              <Link href="/install" className="button ghost">
                설치하기
              </Link>
            )}
          </article>
        ))}
      </div>

      <div className="card note">
        <h3>상업 라이선스</h3>
        <p>
          앱은 AGPL-3.0으로 공개돼 있어요. 고친 코드를 공개하지 않고 서비스에 넣으려면 상업 라이선스가 필요해요. <a href="mailto:doc.corax@gmail.com">doc.corax@gmail.com</a>으로 문의해
          주세요. <Link href="/docs/licensing">라이선스 자세히 보기</Link>
        </p>
      </div>
    </section>
  );
}
