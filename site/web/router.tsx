import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/** A tiny history router: the site has a handful of pages and does not need a routing library. */

const listeners = new Set<() => void>();

export function navigate(to: string) {
  history.pushState(null, '', to);
  window.scrollTo(0, 0);
  for (const l of listeners) l();
}

export function useLocation() {
  const [location, setLocation] = useState(() => ({ path: location_path(), search: window.location.search }));
  useEffect(() => {
    const update = () => setLocation({ path: location_path(), search: window.location.search });
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return location;
}

function location_path() {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const follow = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !href.startsWith('/')) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={follow} {...rest} />;
}
