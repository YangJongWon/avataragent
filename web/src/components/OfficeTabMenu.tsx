import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  run: () => void;
  disabled?: boolean;
  hint?: string;
  danger?: boolean;
}

interface Props {
  title: string;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function OfficeTabMenu({ title, x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu floating"
      style={pos}
      role="menu"
      tabIndex={-1}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        onClose();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="context-title">
        <span>{title}</span>
        <button className="context-close" onClick={onClose} aria-label="닫기">X</button>
      </div>
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          className={`context-item${item.danger ? ' danger' : ''}`}
          disabled={item.disabled}
          title={item.hint}
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          {item.label}
          {item.disabled && item.hint && <span className="context-hint">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}
