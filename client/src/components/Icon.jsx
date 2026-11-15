// Iconos de trazo de la pantalla de inicio: un solo estilo (24 px, mismo
// grosor) para no depender de los emojis del sistema.
const PATHS = {
  science: <><path d="m10 3 5 2-4 9-5-2zM13 10a6 6 0 0 1 3 11H4M5 16h7M9 21v-3" /></>,
  antenna: <><path d="M4 4a13 13 0 0 0 16 16L4 4ZM12 12l6-6M16 4a4 4 0 0 1 4 4M8 17l-3 5h12l-3-4" /></>,
  rocket: <><path d="M9 15c-1-6 4-11 12-12 0 8-5 13-12 12ZM9 9H5l-3 6h7M15 15v4l-6 3v-7M6 18l-3 3" /><circle cx="16" cy="8" r="2" /></>,

  layers: <><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
  planet: <><circle cx="12" cy="12" r="5.5" /><ellipse cx="12" cy="12" rx="10.5" ry="3.4" transform="rotate(-24 12 12)" /></>,
  satellite: (
    <g transform="rotate(-45 12 12)">
      <rect x="9.5" y="8" width="5" height="8" rx="1" />
      <rect x="1.5" y="9.5" width="6" height="5" /><rect x="16.5" y="9.5" width="6" height="5" />
      <path d="M4.5 9.5v5M19.5 9.5v5M7.5 12h2M14.5 12h2M12 16v2.2M9.6 20.6a2.4 2.4 0 0 1 4.8 0" />
    </g>
  ),
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.2c2.6.3 4.5 2.6 4.5 5.8" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4v3h-4z" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8Z" />,
  medal: <><path d="m8 3 2.5 6M16 3l-2.5 6" /><circle cx="12" cy="15" r="5.5" /><circle cx="12" cy="15" r="2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><ellipse cx="12" cy="12" rx="4" ry="9" /></>,
  play: <path d="m8 5 11 7-11 7Z" fill="currentColor" />,
  pause: <path d="M9 6v12M15 6v12" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  hurricane: <><circle cx="12" cy="12" r="2.5" /><path d="M18.5 12a6.5 6.5 0 0 1-6.5 6.5M5.5 12A6.5 6.5 0 0 1 12 5.5M12 5.5c2-1.8 4.5-2.3 7-1.5M12 18.5c-2 1.8-4.5 2.3-7 1.5" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /><path d="m12 12 6.4-6.4" /></>,
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.3 1.6 1 2.4 1.8 2.6C11 8.5 11 5.5 12 3Z" />,
  thermo: <><path d="M10 4.5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z" /><path d="M12 9v7" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  drop: <path d="M12 3.5c3 4 5.5 6.8 5.5 10a5.5 5.5 0 0 1-11 0c0-3.2 2.5-6 5.5-10Z" />,
  rover: <><rect x="5" y="9" width="12" height="5" rx="1" /><circle cx="6.5" cy="17.5" r="2" /><circle cx="12" cy="17.5" r="2" /><circle cx="17.5" cy="17.5" r="2" /><path d="M15 9V5h3" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>,
  bell: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  sprout: <><path d="M12 20v-8" /><path d="M12 12c0-3-2-5-6-5 0 3 2 5 6 5ZM12 14c0-2.5 2-4.5 5.5-4.5 0 2.5-2 4.5-5.5 4.5Z" /></>,
};

/** Icono decorativo (oculto a lectores de pantalla). `fill` rellena la figura (estrellas ganadas). */
export default function Icon({ name, size = 22, fill = false, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
