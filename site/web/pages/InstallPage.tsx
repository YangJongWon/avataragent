import { useState } from 'react';
import { Link } from '../router.tsx';

const WINDOWS = 'irm https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.ps1 | iex';
const UNIX = 'curl -fsSL https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.sh | bash';

function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="command">
      <code>{text}</code>
      <button
        className="button small"
        onClick={() =>
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}

export function InstallPage() {
  return (
    <section className="page narrow">
      <h1>설치하기</h1>
      <p className="lead">프로그래밍을 몰라도 돼요. 명령 한 줄이면 필요한 것을 알아서 설치하고 사무실을 열어 줘요. 처음에는 5~10분쯤 걸려요.</p>

      <div className="card">
        <h2>Windows 10/11</h2>
        <ol>
          <li>
            시작 메뉴에서 <b>PowerShell</b>을 검색해 열어요.
          </li>
          <li>아래 줄을 붙여 넣고 Enter를 눌러요.</li>
        </ol>
        <Command text={WINDOWS} />
        <p className="muted small">바탕화면에 켜기·끄기·업데이트 바로가기가 생겨요. ZIP으로 받았다면 폴더의 설치.cmd를 두 번 눌러도 돼요.</p>
      </div>

      <div className="card">
        <h2>macOS / Linux</h2>
        <p>터미널을 열고 아래 줄을 붙여 넣어요. 홈 폴더의 avataragent에 설치돼요.</p>
        <Command text={UNIX} />
      </div>

      <div className="card">
        <h2>설치한 다음</h2>
        <ul>
          <li>처음에는 API 키 없이 시뮬레이션으로 돌아가요. 실제 AI를 쓰려면 앱의 모델 관리 탭에서 키를 넣으세요.</li>
          <li>
            휴대폰이나 밖에서 열고 싶다면 <Link href="/docs/operations">운영 가이드</Link>의 Tailscale 안내를 보세요.
          </li>
          <li>
            소스 코드는 <a href="https://github.com/YangJongWon/avataragent">GitHub</a>에 있어요.
          </li>
        </ul>
      </div>
    </section>
  );
}
