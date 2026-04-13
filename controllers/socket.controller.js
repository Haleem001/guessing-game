const GameSession = require('../models/gamesession.model');

const activeSessions = new Map();
const roomTimers = new Map();
const socketRooms = new Map();

function getOrCreateSession(roomId) {
  if (!activeSessions.has(roomId)) {
    activeSessions.set(roomId, new GameSession(roomId));
  }

  return activeSessions.get(roomId);
}

function emitRoomState(io, roomId) {
  const session = activeSessions.get(roomId);

  if (!session) {
    return;
  }

  io.to(roomId).emit('roomStateUpdated', session.getPublicState());
}

function clearRoomTimers(roomId) {
  const timers = roomTimers.get(roomId);

  if (!timers) {
    return;
  }

  clearInterval(timers.intervalId);
  clearTimeout(timers.timeoutId);
  roomTimers.delete(roomId);
}

function finalizeRound(io, roomId, reason) {
  const session = activeSessions.get(roomId);

  if (!session) {
    return;
  }

  clearRoomTimers(roomId);

  io.to(roomId).emit('roundEnded', {
    reason,
    state: session.getPublicState(),
  });

  const newMaster = session.rotateMaster();

  if (newMaster) {
    io.to(roomId).emit('newMasterAssigned', {
      masterId: newMaster.id,
      masterName: newMaster.name,
    });
  }

  emitRoomState(io, roomId);
}

function startRoomTimer(io, roomId) {
  const session = activeSessions.get(roomId);

  if (!session) {
    return;
  }

  clearRoomTimers(roomId);

  let remainingSeconds = session.timerSeconds;

  io.to(roomId).emit('timerUpdate', { remainingSeconds });

  const intervalId = setInterval(() => {
    remainingSeconds -= 1;

    if (remainingSeconds > 0) {
      io.to(roomId).emit('timerUpdate', { remainingSeconds });
    }
  }, 1000);

  const timeoutId = setTimeout(() => {
    clearRoomTimers(roomId);

    if (session.status !== 'playing') {
      return;
    }

    session.endRound();
    io.to(roomId).emit('timerUpdate', { remainingSeconds: 0 });
    finalizeRound(io, roomId, 'time_up');
  }, session.timerSeconds * 1000);

  roomTimers.set(roomId, {
    intervalId,
    timeoutId,
  });
}

function handleJoinRoom(io, socket, payload = {}) {
  const roomId = String(payload.roomId || '').trim();
  const playerName = String(payload.playerName || '').trim();

  if (!roomId || !playerName) {
    socket.emit('gameError', {
      message: 'roomId and playerName are required.',
    });
    return;
  }

  const existingRoomId = socketRooms.get(socket.id);

  if (existingRoomId && existingRoomId !== roomId) {
    socket.leave(existingRoomId);
  }

  const session = getOrCreateSession(roomId);
  const previousMasterId = session.getCurrentMaster()?.id || null;
  const player = session.addPlayer({
    id: socket.id,
    name: playerName,
  });

  socket.join(roomId);
  socketRooms.set(socket.id, roomId);

  socket.emit('joinedRoom', {
    roomId,
    playerId: player.id,
    state: session.getPublicState(),
  });

  if (session.getCurrentMaster()?.id !== previousMasterId) {
    io.to(roomId).emit('newMasterAssigned', {
      masterId: session.getCurrentMaster()?.id || null,
      masterName: session.getCurrentMaster()?.name || null,
    });
  }

  emitRoomState(io, roomId);
}

function handleStartRound(io, socket, payload = {}) {
  const roomId = socketRooms.get(socket.id);
  const session = activeSessions.get(roomId);

  if (!session) {
    socket.emit('gameError', { message: 'No active session found for this socket.' });
    return;
  }

  if (session.getCurrentMaster()?.id !== socket.id) {
    socket.emit('gameError', { message: 'Only the current Master can start a round.' });
    return;
  }

  try {
    const state = session.startRound(payload.question, payload.answer);

    io.to(roomId).emit('roundStarted', state);
    emitRoomState(io, roomId);
    startRoomTimer(io, roomId);
  } catch (error) {
    socket.emit('gameError', { message: error.message });
  }
}

function handleSubmitGuess(io, socket, payload = {}) {
  const roomId = socketRooms.get(socket.id);
  const session = activeSessions.get(roomId);

  if (!session) {
    socket.emit('gameError', { message: 'No active session found for this socket.' });
    return;
  }

  try {
    const result = session.submitGuess(socket.id, payload.guess);

    io.to(roomId).emit('guessResult', {
      playerId: socket.id,
      ...result,
    });

    emitRoomState(io, roomId);

    if (result.state.status === 'ended') {
      finalizeRound(io, roomId, result.outcome === 'correct' ? 'guessed_correctly' : 'attempts_exhausted');
    }
  } catch (error) {
    socket.emit('gameError', { message: error.message });
  }
}

function handleDisconnect(io, socket) {
  const roomId = socketRooms.get(socket.id);

  if (!roomId) {
    return;
  }

  socketRooms.delete(socket.id);

  const session = activeSessions.get(roomId);

  if (!session) {
    return;
  }

  const previousMasterId = session.getCurrentMaster()?.id || null;
  const removedPlayer = session.removePlayer(socket.id);

  if (!removedPlayer) {
    return;
  }

  if (session.players.length === 0) {
    clearRoomTimers(roomId);
    activeSessions.delete(roomId);
    return;
  }

  if (session.status !== 'playing') {
    clearRoomTimers(roomId);
  }

  if (session.getCurrentMaster()?.id !== previousMasterId) {
    io.to(roomId).emit('newMasterAssigned', {
      masterId: session.getCurrentMaster()?.id || null,
      masterName: session.getCurrentMaster()?.name || null,
    });
  }

  io.to(roomId).emit('playerLeft', {
    playerId: removedPlayer.id,
    playerName: removedPlayer.name,
  });

  emitRoomState(io, roomId);
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('joinRoom', (payload) => {
      handleJoinRoom(io, socket, payload);
    });

    socket.on('startRound', (payload) => {
      handleStartRound(io, socket, payload);
    });

    socket.on('submitGuess', (payload) => {
      handleSubmitGuess(io, socket, payload);
    });

    socket.on('disconnect', () => {
      handleDisconnect(io, socket);
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}

module.exports = registerSocketHandlers;
