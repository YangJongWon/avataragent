import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { LanguageProvider } from './LanguageProvider.tsx';
import './styles.css';

// LanguageProvider는 App보다 위에 있어야 한다. App 자신도 useLanguage()로 t()를 얻기
// 때문에 안에 두면 컨텍스트를 못 받아서 언어 설정을 바꿔도 상단 탭·버튼이 그대로 한국어로 남는다.
createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>,
);
