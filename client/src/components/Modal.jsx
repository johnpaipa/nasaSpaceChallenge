import { useEffect } from 'react';

/** Ventana modal del juego: se cierra con Esc o tocando fuera. `onKey` recibe las demás teclas. */
export default function Modal({ onClose, onKey, wide = false, children }) {
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'Escape') onClose?.();
      else onKey?.(e);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
