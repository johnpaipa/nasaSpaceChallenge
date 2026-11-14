// Servidor monolito: sirve el frontend compilado y sincroniza las salas
// multijugador (hasta 4 jugadores) por Socket.io. El servidor es la
// fuente de verdad: aplica el mismo reducer que el modo un jugador.
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createState, reducer, ROLES } from '../shared/state.js';

const PORT = process.env.PORT || 3001;
const MAX_PLAYERS = 4;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../dist');

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

/** @type {Map<string, {code: string, hostId: string, players: {id: string, name: string, roles: string[]}[], state: any}>} */
const rooms = new Map();

const newCode = () => {
  let code;
  do code = Math.random().toString(36).slice(2, 6).toUpperCase();
  while (rooms.has(code));
  return code;
};

const claimed = (room) => room.players.flatMap((p) => p.roles);

const broadcast = (room) =>
  io.to(room.code).emit('room:state', {
    code: room.code,
    hostId: room.hostId,
    players: room.players,
    state: room.state,
  });

function joinRoom(socket, room, name) {
  if (room.players.length >= MAX_PLAYERS) return socket.emit('room:error', 'La sala está llena (máx. 4).');
  room.players.push({ id: socket.id, name: String(name || 'Jugador').slice(0, 20), roles: [] });
  socket.join(room.code);
  socket.data.room = room.code;
  broadcast(room);
}

function leaveRoom(socket) {
  const room = rooms.get(socket.data.room);
  if (!room) return;
  room.players = room.players.filter((p) => p.id !== socket.id);
  socket.leave(room.code);
  socket.data.room = null;
  if (room.players.length === 0) return rooms.delete(room.code);
  if (room.hostId === socket.id) room.hostId = room.players[0].id;
  delete room.state.ready[socket.id];
  broadcast(room);
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name, missionId }) => {
    leaveRoom(socket);
    const room = { code: newCode(), hostId: socket.id, players: [], state: createState(missionId) };
    rooms.set(room.code, room);
    joinRoom(socket, room, name);
  });

  socket.on('room:join', ({ code, name }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return socket.emit('room:error', 'No existe una sala con ese código.');
    leaveRoom(socket);
    joinRoom(socket, room, name);
  });

  // Tomar o soltar un rol. Cada rol pertenece a un solo jugador; con menos
  // de 4 jugadores, alguien puede tomar varios roles.
  socket.on('room:toggleRole', (role) => {
    const room = rooms.get(socket.data.room);
    const me = room?.players.find((p) => p.id === socket.id);
    if (!me || !ROLES[role]) return;
    if (me.roles.includes(role)) me.roles = me.roles.filter((r) => r !== role);
    else if (!claimed(room).includes(role)) me.roles.push(role);
    broadcast(room);
  });

  socket.on('game:action', (action) => {
    const room = rooms.get(socket.data.room);
    const me = room?.players.find((p) => p.id === socket.id);
    if (!me || !action || typeof action.type !== 'string') return;

    // La simulación y el rediseño son decisiones de equipo: se lanzan
    // cuando todos marcan "listo".
    if (action.type === 'simulate') return;
    if (action.type === 'ready') action = { type: 'ready', playerId: me.id, value: !!action.value };

    const ctx = { roles: me.roles, claimed: claimed(room), player: me.name };
    room.state = reducer(room.state, action, ctx);

    const allReady = room.players.every((p) => room.state.ready[p.id]);
    if (room.state.phase === 'design' && allReady)
      room.state = reducer(room.state, { type: 'simulate', seed: Date.now() >>> 0 }, ctx);
    broadcast(room);
  });

  socket.on('room:leave', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

http.listen(PORT, () => {
  console.log(`🚀 Servidor en http://localhost:${PORT}${existsSync(dist) ? '' : '  (frontend: npm run dev → http://localhost:5173)'}`);
});
