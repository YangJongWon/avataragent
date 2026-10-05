import officeShot from '../../../docs/office-mobile.png';
import { Link } from '../router.tsx';

const FEATURES: [string, string, string][] = [
  ['👀', '일하는 모습이 보여요', 'AI 직원이 칠판에서 과제를 가져가고, 자료를 찾고, 서류를 직접 건네주며 일해요. 누가 무엇을 하는지 한눈에 보여요.'],
  ['🧭', '업무 여정을 내 방식대로', '브리프 → 조사 → 작성 → 검토 → 승인. 단계와 반려 조건을 직접 짜거나 AI에게 맡길 수 있어요.'],
  ['💰', '비용과 가치를 같이', 'AI 호출 비용과 사람이 했을 때의 가치를 비교해 손익과 월 예산을 보여 줘요. 결과는 내가 승인해야 반영돼요.'],
  ['🎨', '테마와 커뮤니티', '사무실 배경과 직원 캐릭터를 테마로 바꿔요. 직접 만들고, 다른 사람이 만든 테마·업무 흐름·플레이북을 받아 쓸 수 있어요.'],
  ['🏠', '내 PC에서, 내 AI 키로', '설치형이라 데이터가 내 PC에 남아요. OpenAI·Anthropic·Gemini·로컬 모델 중 원하는 걸 직원마다 다르게 쓸 수 있어요.'],
  ['👥', '팀과 함께', '구성원 계정, 회사 채팅, 프로젝트 라운지로 사람과 AI 직원이 같은 사무실에서 일해요.'],
];

export function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <h1>
            AI 직원이 일하는 모습이
            <br />
            보이는 사무실
          </h1>
          <p className="lead">업무를 맡기면 관리자·조사원·작성자·검수자가 차례로 일하고, 마지막 승인은 내가 해요. 무료로 설치해서 바로 써 보세요.</p>
          <div className="row">
            <Link href="/install" className="button big">
              무료로 설치하기
            </Link>
            <Link href="/pricing" className="button big ghost">
              팀 플랜 보기
            </Link>
          </div>
        </div>
        <img className="hero-shot" src={officeShot} alt="휴대폰에서 본 개발팀 사무실" />
      </section>

      <section className="page">
        <div className="features">
          {FEATURES.map(([icon, title, text]) => (
            <article key={title} className="card">
              <div className="feature-icon">{icon}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="page cta">
        <h2>내 사무실을 꾸미고 나눠 보세요</h2>
        <p>테마 스튜디오로 배경과 캐릭터를 만들고, 커뮤니티에 올려 다른 사무실과 나눌 수 있어요.</p>
        <div className="row center">
          <Link href="/docs/theme-guide" className="button">
            테마 만들기 가이드
          </Link>
          <Link href="/community" className="button ghost">
            커뮤니티 둘러보기
          </Link>
        </div>
      </section>
    </>
  );
}
