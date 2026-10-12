import { useEffect, useState } from 'react';

// Keep in sync with the compact @media block in styles.css.
export const COMPACT_QUERY = '(max-width: 900px), (max-height: 520px)';
// Tall narrow screens fit the avatar stage and the workflow stacked, so no flow drawer.
export const STACK_QUERY = '(max-width: 900px) and (min-height: 720px)';

function useQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useCompact() {
  return useQuery(COMPACT_QUERY);
}

export function useStacked() {
  return useQuery(STACK_QUERY);
}
