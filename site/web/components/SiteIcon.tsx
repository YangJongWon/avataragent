import type { ReactNode, SVGProps } from 'react';

export type SiteIconName = 'spark' | 'pricing' | 'download' | 'community' | 'forum' | 'ranking' | 'docs' | 'theme' | 'flow' | 'playbook' | 'upload' | 'profit' | 'team' | 'model' | 'notice' | 'question' | 'tip' | 'idea' | 'office' | 'pin' | 'comment' | 'pen';

const paths: Record<SiteIconName, ReactNode> = {
  spark: <><path d="m12 2 1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
  pricing: <><path d="M4 7.5V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3.5"/><path d="M14 3v6h6M8 13h8M8 17h5"/></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></>,
  community: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M14 15c3.8-.5 5.8 1.2 6.2 4.5"/></>,
  forum: <><path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 9h8M8 12h5"/></>,
  ranking: <><path d="M5 21V11h4v10M10 21V5h4v16M15 21v-7h4v7"/><path d="m12 2 .7 1.5 1.6.2-1.2 1.1.3 1.6L12 5.6l-1.4.8.3-1.6-1.2-1.1 1.6-.2L12 2Z"/></>,
  docs: <><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/></>,
  theme: <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3a6 6 0 0 0 0-12h-3Z"/><circle cx="7.5" cy="9" r=".7"/><circle cx="10" cy="6" r=".7"/></>,
  flow: <><rect x="3" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="15" width="6" height="5" rx="1.5"/><path d="M9 6.5h3a4 4 0 0 1 4 4V15m0 0-2.5-2.5M16 15l2.5-2.5"/></>,
  playbook: <><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M5 19h15M9 7h7M9 11h5"/></>,
  upload: <><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M5 14v6h14v-6"/></>,
  profit: <><path d="M4 19V9m6 10V5m6 14v-7m4 7V3"/><path d="m3 7 5-4 5 4 7-5"/></>,
  team: <><circle cx="8" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M12.5 20c.4-4 1.9-6 4.5-6s4.1 2 4.5 6"/></>,
  model: <><rect x="4" y="6" width="16" height="13" rx="3"/><path d="M9 11h.01M15 11h.01M9 15h6M12 6V3"/></>,
  notice: <><path d="M4 13V9l11-4v12L4 13Z"/><path d="M15 9c3 0 5 1.3 5 2s-2 2-5 2M6 13l1.5 6h3L9 14"/></>,
  question: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.1 2.3c-.9.4-1.2 1-1.2 1.9M12 17h.01"/></>,
  tip: <><path d="M9 18h6M10 21h4"/><path d="M8.2 14.5A6 6 0 1 1 15.8 14.5C14.7 15.3 14.5 16 14.5 17h-5c0-1-.2-1.7-1.3-2.5Z"/></>,
  idea: <><path d="m14.7 6.3 3-3 3 3-3 3"/><path d="m16.2 7.8-8.8 8.8-3 3-1-4 3-3 8.8-8.8"/><path d="M13 14h7v7H9v-5"/></>,
  office: <><path d="M4 21V5l8-3v19M12 7h8v14M7 7h2M7 11h2M7 15h2M15 10h2M15 14h2M15 18h2M2 21h20"/></>,
  pin: <><path d="m9 3 6 6M7 8l5 5-4 4-5-5 4-4Zm5 5 5-5 3 3-5 5M8 17l-5 4"/></>,
  comment: <><path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 9h8M8 12h5"/></>,
  pen: <><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3M8.5 19 5 15.5"/></>,
};

export function SiteIcon({ name, ...props }: { name: SiteIconName } & SVGProps<SVGSVGElement>) {
  return <svg className="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
