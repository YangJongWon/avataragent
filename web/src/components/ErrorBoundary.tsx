import { Component, type ReactNode } from 'react';
import { t } from '../../../shared/i18n.ts';

interface State {
  error: Error | null;
  stack: string;
}

/** Catches render/commit crashes anywhere below and shows them instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.setState({ stack: info.componentStack ?? '' });
    // eslint-disable-next-line no-console
    console.error('AvatarCast UI crash:', error, info.componentStack);
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="loading">
        <p>
          <strong>{t('화면이 멈췄어요.')}</strong>
        </p>
        <p className="muted small">{error.message}</p>
        {stack && (
          <details>
            <summary className="small">{t('자세히')}</summary>
            <pre className="small" style={{ textAlign: 'left', whiteSpace: 'pre-wrap' }}>
              {stack}
            </pre>
          </details>
        )}
        <p>
          <button className="pixel-btn" onClick={() => location.reload()}>
            {t('다시 읽기')}
          </button>
        </p>
      </div>
    );
  }
}
