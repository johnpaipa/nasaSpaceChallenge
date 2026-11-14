// Estado del juego en el cliente. Expone la misma interfaz para el modo
// un jugador (reducer local) y el modo equipo (estado del servidor).
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { createState, reducer, canEdit } from '../../shared/state.js';
import { sfx } from './sound.js';
import { loadProgress, saveProgress, recordResult, resetProgress } from './campaign.js';

export const GameContext = createContext(null);
const SOLO_PLAYER = { id: 'solo', name: 'Tú', roles: ['all'] };

export function GameProvider({ children }) {
  const [mode, setMode] = useState(null); // null | 'solo' | 'multi'
  const [solo, setSolo] = useState(() => createState());
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [explore, setExplore] = useState(null); // { design, missionId, counts } durante la exploración
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  // Registra un resultado en la campaña (solo suma si mejora la mejor marca).
  const record = (ctx) => {
    const out = recordResult(progressRef.current, ctx);
    if (!out.repeated) { progressRef.current = out.progress; saveProgress(out.progress); setProgress(out.progress); }
    return out;
  };
  const socketRef = useRef(null);

  const socket = () => {
    if (!socketRef.current) {
      const s = io();
      s.on('room:state', (r) => { setRoom(r); setError(null); });
      s.on('room:error', (msg) => { setError(msg); setMode(null); });
      s.on('disconnect', () => setRoom(null));
      socketRef.current = s;
    }
    return socketRef.current;
  };

  const value = useMemo(() => {
    const multi = mode === 'multi';
    const me = multi ? room?.players.find((p) => p.id === socketRef.current?.id) : SOLO_PLAYER;
    const claimed = multi ? room?.players.flatMap((p) => p.roles) ?? [] : [];

    return {
      mode,
      error,
      room,
      me,
      game: multi ? room?.state : solo,
      explore,
      // counts = false para los demos de la pantalla de inicio (no suman a la campaña)
      startExplore: (design, missionId, counts = true) => setExplore({ design, missionId, counts }),
      progress,
      record,
      resetCampaign: () => { const p = resetProgress(); progressRef.current = p; setProgress(p); },
      endExplore: () => setExplore(null),
      startSolo: (missionId) => { setSolo(createState(missionId)); setMode('solo'); },
      createRoom: (name, missionId) => { setMode('multi'); socket().emit('room:create', { name, missionId }); },
      joinRoom: (name, code) => { setMode('multi'); socket().emit('room:join', { name, code }); },
      leave: () => { socketRef.current?.emit('room:leave'); setRoom(null); setMode(null); },
      toggleRole: (role) => socket().emit('room:toggleRole', role),
      canEdit: (field) => !!me && canEdit(me.roles, field, claimed),
      ownerOf: (role) => room?.players.find((p) => p.roles.includes(role)),
      dispatch: (action) => {
        if (action.type === 'set' || action.type === 'toggleInstrument') sfx.select();
        if (multi) return socket().emit('game:action', action);
        // En solitario "listo" lanza la simulación directamente.
        if (action.type === 'ready') action = { type: 'simulate', seed: Date.now() >>> 0 };
        setSolo((s) => reducer(s, action));
      },
    };
  }, [mode, solo, room, error, explore, progress]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export const useGame = () => useContext(GameContext);
