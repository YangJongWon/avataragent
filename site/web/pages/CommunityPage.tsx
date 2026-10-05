import { Link } from '../router.tsx';

const COMING: [string, string, string][] = [
  ['🎨', '테마', '사무실 배경과 직원 캐릭터. 앱의 테마 스튜디오나 로컬 AI로 만들어 올릴 수 있어요.'],
  ['🧭', '업무 흐름', '단계와 반려 조건까지 담은 업무 여정 템플릿.'],
  ['📘', '플레이북', '역할별 성격·규칙·모델 등급과 실제 성과표. 이름·업무 내용·키는 담기지 않아요.'],
  ['🏆', '크리에이터와 랭킹', '만든 사람 페이지, 인기 순위, 배지.'],
  ['💬', '게시판과 Q&A', '질문, 팁, 기능 제안, 내 사무실 자랑.'],
];

export function CommunityPage() {
  return (
    <section className="page">
      <h1>커뮤니티</h1>
      <p className="lead">곧 열려요. 여기서 테마·업무 흐름·플레이북을 나누고, 앱의 커뮤니티 탭에서 바로 설치할 수 있게 돼요.</p>
      <div className="features">
        {COMING.map(([icon, title, text]) => (
          <article key={title} className="card">
            <div className="feature-icon">{icon}</div>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <p>
        지금은 <Link href="/docs/theme-guide">테마 만들기 가이드</Link>를 보고 첫 테마를 준비해 두세요.
      </p>
    </section>
  );
}
