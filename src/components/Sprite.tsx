/** Shared SVG defs: the wobble filters that make borders look hand-drawn, plus UI icon sprites. */
export function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="wobble" x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="wobble-fine" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <symbol id="i-back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></symbol>
      <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></symbol>
      <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-6-6.2-6-11a6 6 0 1112 0c0 4.8-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></symbol>
      <symbol id="i-nav" viewBox="0 0 24 24"><path d="M4 11l16-7-7 16-2-7z" /></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="M4 13l6 6L21 5" /></symbol>
      <symbol id="i-leaf" viewBox="0 0 24 24"><path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15zM5 19l8-8" /></symbol>
      <symbol id="i-bag" viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 016 0v2" /></symbol>
      <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3l2.4 5.6 6 .6-4.5 4 1.4 6-5.3-3.2L6.7 19l1.4-6-4.5-4 6-.6z" /></symbol>
      <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16zM14 7l3 3" /></symbol>
      <symbol id="i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></symbol>
      <symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></symbol>
    </svg>
  )
}

export function Icon({ name, size }: { name: string; size?: number }) {
  return (
    <svg className="ic" style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}
