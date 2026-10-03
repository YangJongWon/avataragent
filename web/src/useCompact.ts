import { useEffect, useState } from 'react';

// Keep in sync with the compact @media block in styles.css.
export const COMPACT_QUERY = '(max-width: 900px), (max-height: 520px)';

export function useCompact() {
  const [compact, setCompact] = useState(() => window.matchMedia(COMPACT_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setCompact(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return compact;
}
