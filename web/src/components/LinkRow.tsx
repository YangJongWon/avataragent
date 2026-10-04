export function LinkRow({ links, label = '바로가기' }: { links?: { label: string; url: string }[]; label?: string }) {
  if (!links?.length) return null;
  return (
    <div className="row wrap link-row">
      {label && <span className="muted small">{label}</span>}
      {links.map((link) => (
        <a key={link.url} className="pixel-btn small link-out" href={link.url} target="_blank" rel="noopener noreferrer">
          {link.label} ↗
        </a>
      ))}
    </div>
  );
}
