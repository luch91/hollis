import { HOLLIS_MARK_PATH } from "./hollis-brand-assets";

export function HollisMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" focusable="false" viewBox="0 0 64 64">
      <path d={HOLLIS_MARK_PATH} fill="currentColor" />
    </svg>
  );
}

export function HollisBrand() {
  return (
    <span className="hollis-brand-lockup">
      <HollisMark className="hollis-brand-mark" />
      <span>Hollis</span>
    </span>
  );
}
