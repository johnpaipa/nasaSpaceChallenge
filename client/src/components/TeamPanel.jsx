import { useState } from 'react';
import { useGame } from '../game.jsx';
import { ROLES } from '../../../shared/state.js';
import { t } from '../../../shared/i18n.js';

export default function TeamPanel() {
  const { room, me, toggleRole, dispatch, ownerOf, game } = useGame();
  const [text, setText] = useState('');
  const send = (e) => {
    e.preventDefault();
    if (text.trim()) dispatch({ type: 'chat', text });
    setText('');
  };

  return (
    <div className="team">
      <h3>{t('Equipo')} · {room.players.length}/4</h3>
      <div className="roles">
        {Object.entries(ROLES).map(([id, r]) => {
          const owner = ownerOf(id);
          const mine = owner?.id === me?.id;
          return (
            <button key={id} className={`role ${mine ? 'mine' : ''}`} disabled={owner && !mine} onClick={() => toggleRole(id)} title={r.desc}>
              <span>{r.icon} {r.name}</span>
              <span className="muted">{owner ? owner.name : t('libre — clic para tomar')}</span>
            </button>
          );
        })}
      </div>
      <ul className="players">
        {room.players.map((p) => (
          <li key={p.id}>{game.ready[p.id] ? '✅' : '⏳'} {p.name}{p.id === me?.id && ` (${t('tú')})`}{p.id === room.hostId && ' ⭐'}</li>
        ))}
      </ul>
      <div className="log">
        {game.log.slice(-30).map((l, i) => (
          <div key={i} className={l.chat ? 'chat' : 'event'}><b>{l.who}:</b> {l.chat ? l.text : t(l.text, l.params)}</div>
        ))}
      </div>
      <form onSubmit={send} className="row">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Negocia con tu equipo…')} />
        <button>{t('Enviar')}</button>
      </form>
    </div>
  );
}
