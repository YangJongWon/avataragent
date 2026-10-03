import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

const DRAG_START_PX = 6;
const SNAP_PX = 40;

interface Props {
  side: 'bottom' | 'right';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handle: ReactNode;
  attention?: boolean;
  children: ReactNode;
}

export function Drawer({ side, open, onOpenChange, handle, attention, children }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; size: number; delta: number; moved: boolean } | null>(null);
  const [shown, setShown] = useState<number | null>(null);

  const coord = (e: PointerEvent) => (side === 'bottom' ? e.clientY : e.clientX);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const body = bodyRef.current;
    if (!body) return;
    drag.current = { start: coord(e), size: side === 'bottom' ? body.offsetHeight : body.offsetWidth, delta: 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.delta = d.start - coord(e);
    if (Math.abs(d.delta) > DRAG_START_PX) d.moved = true;
    if (d.moved) setShown(Math.min(d.size, Math.max(0, (open ? d.size : 0) + d.delta)));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setShown(null);
    if (!d) return;
    if (!d.moved) onOpenChange(!open);
    else if (d.delta > SNAP_PX) onOpenChange(true);
    else if (d.delta < -SNAP_PX) onOpenChange(false);
  };

  const size = bodyRef.current ? (side === 'bottom' ? bodyRef.current.offsetHeight : bodyRef.current.offsetWidth) : 0;
  const style =
    shown === null
      ? undefined
      : { transform: side === 'bottom' ? `translateY(${size - shown}px)` : `translateX(${size - shown}px)` };

  return (
    <>
      {open && <div className="drawer-scrim" onClick={() => onOpenChange(false)} />}
      <div className={`drawer drawer-${side}${open ? ' open' : ''}${shown !== null ? ' dragging' : ''}`} style={style}>
        <div
          className={`drawer-handle${attention && !open ? ' attention' : ''}`}
          role="button"
          aria-expanded={open}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {handle}
        </div>
        <div className="drawer-body" ref={bodyRef}>
          {children}
        </div>
      </div>
    </>
  );
}
