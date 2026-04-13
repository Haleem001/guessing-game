const GameSession = require('../models/gamesession.model.js');

const sessions = {};
const roomTimers = {};
const socketRooms = {};

function getSession(roomId) {
  return sessions[roomId] || null;
}

function getOrCreateSession(roomId) {
  if (!sessions[roomId]) {
    sessions[roomId] = new GameSession(roomId);
  }

  return sessions[roomId];
}

function clearRoomTimer(roomId) {
  if (!roomTimers[roomId]) {
    return;
  }

  clearInterval(roomTimers[roomId]);
  delete roomTimers[roomId];
}

function emitRoomState(io, roomId) {
  const session = getSession(roomId);

  if (!session) {
    return;
  }

  io.to(roomId).emit('roomState', session.getPublicState());
}

function emitNewMasterAssigned(io, roomId, session) {
  const master = session.getCurrentMaster();

  io.to(roomId).emit('newMasterAssigned', {
    masterId: master?.id || null,
    masterName: master?.name || null,
    state: session.getPublicState(),
  });
}

function endRoundAndRotate(io, roomId, reason) {
  const session = getSession(roomId);

  if (!session) {
    return;
  }

  clearRoomTimer(roomId);

  io.to(roomId).emit('gameOver', {
    reason,
    state: session.getPublicState(),
  });

  const newMaster = session.rotateMaster();

  if (newMaster) {
    emitNewMasterAssigned(io, roomId, session);
  }

  emitRoomState(io, roomId);
}

function startRoundTimer(io, roomId) {
  const session = getSession(roomId);

  if (!session) {
    return;
  }

  clearRoomTimer(roomId);

  let timeLeft = session.timerSeconds;
  io.to(roomId).emit('timerUpdate', timeLeft);

  roomTimers[roomId] = setInterval(() => {
    const currentSession = getSession(roomId);

    if (!currentSession) {
      clearRoomTimer(roomId);
      return;
    }

    timeLeft -= 1;

    if (timeLeft >= 0) {
      io.to(roomId).emit('timerUpdate', timeLeft);
    }

    if (timeLeft <= 0 || currentSession.status !== 'playing') {
      clearRoomTimer(roomId);

      if (timeLeft <= 0 && currentSession.status === 'playing') {
        currentSession.endRound();
        endRoundAndRotate(io, roomId, 'Time is up!');
      }
    }
  }, 1000);
}

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('joinRoom', ({ roomId, name } = {}) => {
      const normalizedRoomId = String(roomId || '').trim();
      const normalizedName = String(name || '').trim();

      if (!normalizedRoomId || !normalizedName) {
        socket.emit('error', 'roomId and name are required.');
        return;
      }

      const session = getOrCreateSession(normalizedRoomId);
      const previousMasterId = session.getCurrentMaster()?.id || null;

      try {
        session.addPlayer({ id: socket.id, name: normalizedName });
        socket.join(normalizedRoomId);
        socketRooms[socket.id] = normalizedRoomId;

        emitRoomState(io, normalizedRoomId);

        if (session.getCurrentMaster()?.id !== previousMasterId) {
          emitNewMasterAssigned(io, normalizedRoomId, session);
        }
      } catch (err) {
        socket.emit('error', err.message);
      }
    });

    socket.on('startGame', ({ roomId, question, answer } = {}) => {
      const normalizedRoomId = String(roomId || socketRooms[socket.id] || '').trim();
      const session = getSession(normalizedRoomId);

      if (!session) {
        socket.emit('error', 'Session not found.');
        return;
      }

      if (socket.id !== session.getCurrentMaster()?.id) {
        socket.emit('error', 'Only the Master can start the game.');
        return;
      }

      try {
        session.startRound(question, answer);
        io.to(normalizedRoomId).emit('gameStarted', session.getPublicState());
        emitRoomState(io, normalizedRoomId);
        startRoundTimer(io, normalizedRoomId);
      } catch (err) {
        socket.emit('error', err.message);
      }
    });

    socket.on('submitGuess', ({ roomId, guess } = {}) => {
      const normalizedRoomId = String(roomId || socketRooms[socket.id] || '').trim();
      const session = getSession(normalizedRoomId);

      if (!session || session.status !== 'playing') {
        return;
      }

      try {
        const player = session.getPlayerById(socket.id);
        const result = session.submitGuess(socket.id, guess);

        io.to(normalizedRoomId).emit('chatMessage', {
          sender: player?.name || 'Unknown Player',
          text: guess,
          isCorrect: result.outcome === 'correct',
        });

        io.to(normalizedRoomId).emit('guessResult', {
          playerId: socket.id,
          ...result,
        });

        if (result.outcome === 'correct') {
          endRoundAndRotate(io, normalizedRoomId, `${result.winner} got it right!`);
        } else if (session.status === 'ended') {
          endRoundAndRotate(io, normalizedRoomId, 'All attempts exhausted.');
        } else {
          emitRoomState(io, normalizedRoomId);
        }
      } catch (err) {
        socket.emit('error', err.message);
      }
    });

    socket.on('disconnect', () => {
      const roomId = socketRooms[socket.id];

      if (!roomId) {
        console.log(`User Disconnected: ${socket.id}`);
        return;
      }

      const session = getSession(roomId);
      delete socketRooms[socket.id];

      if (!session) {
        console.log(`User Disconnected: ${socket.id}`);
        return;
      }

      const previousMasterId = session.getCurrentMaster()?.id || null;
      const removedPlayer = session.removePlayer(socket.id);

      if (!removedPlayer) {
        console.log(`User Disconnected: ${socket.id}`);
        return;
      }

      if (session.players.length === 0) {
        clearRoomTimer(roomId);
        delete sessions[roomId];
        console.log(`User Disconnected: ${socket.id}`);
        return;
      }

      if (session.status !== 'playing') {
        clearRoomTimer(roomId);
      }

      io.to(roomId).emit('playerLeft', {
        playerId: removedPlayer.id,
        playerName: removedPlayer.name,
      });

      emitRoomState(io, roomId);

      if (session.getCurrentMaster()?.id !== previousMasterId) {
        emitNewMasterAssigned(io, roomId, session);
      }

      console.log(`User Disconnected: ${socket.id}`);
    });
  });
};
