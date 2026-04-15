const GameSession = require('../models/gamesession.model.js');
const logger = require('../utils/logger');

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
    logger.info('Socket connected', {
      socketId: socket.id,
    });

    socket.on('joinRoom', ({ roomId, name } = {}) => {
      const normalizedRoomId = String(roomId || '').trim();
      const normalizedName = String(name || '').trim();

      if (!normalizedRoomId || !normalizedName) {
        logger.error('Join room validation failed', {
          socketId: socket.id,
          roomId: normalizedRoomId,
        });
        socket.emit('error', 'roomId and name are required.');
        return;
      }

      const session = getOrCreateSession(normalizedRoomId);
      const previousMasterId = session.getCurrentMaster()?.id || null;

      try {
        if (session.status === 'playing') {
          logger.info('Join rejected while round is in progress', {
            socketId: socket.id,
            roomId: normalizedRoomId,
          });
          socket.emit('error', 'You cannot join while a game is in progress.');
          return;
        }

        session.addPlayer({ id: socket.id, name: normalizedName });
        socket.join(normalizedRoomId);
        socketRooms[socket.id] = normalizedRoomId;
        logger.info('Player joined room', {
          socketId: socket.id,
          roomId: normalizedRoomId,
          playerName: normalizedName,
          playerCount: session.players.length,
        });

        emitRoomState(io, normalizedRoomId);

        if (session.getCurrentMaster()?.id !== previousMasterId) {
          emitNewMasterAssigned(io, normalizedRoomId, session);
        }
      } catch (err) {
        logger.error('Join room failed', {
          socketId: socket.id,
          roomId: normalizedRoomId,
          error: err.message,
        });
        socket.emit('error', err.message);
      }
    });

    socket.on('startGame', ({ roomId, question, answer } = {}) => {
      const normalizedRoomId = String(roomId || socketRooms[socket.id] || '').trim();
      const session = getSession(normalizedRoomId);

      if (!session) {
        logger.error('Start game failed because session was not found', {
          socketId: socket.id,
          roomId: normalizedRoomId,
        });
        socket.emit('error', 'Session not found.');
        return;
      }

      if (socket.id !== session.getCurrentMaster()?.id) {
        logger.info('Start game rejected for non-master player', {
          socketId: socket.id,
          roomId: normalizedRoomId,
        });
        socket.emit('error', 'Only the Master can start the game.');
        return;
      }

      try {
        session.startRound(question, answer);
        logger.info('Game started', {
          socketId: socket.id,
          roomId: normalizedRoomId,
          playerCount: session.players.length,
        });
        io.to(normalizedRoomId).emit('gameStarted', session.getPublicState());
        emitRoomState(io, normalizedRoomId);
        startRoundTimer(io, normalizedRoomId);
      } catch (err) {
        logger.error('Start game failed', {
          socketId: socket.id,
          roomId: normalizedRoomId,
          error: err.message,
        });
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
        logger.debug('Guess submitted', {
          socketId: socket.id,
          roomId: normalizedRoomId,
          playerName: player?.name || 'Unknown Player',
          outcome: result.outcome,
        });

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
          logger.info('Round won by player', {
            socketId: socket.id,
            roomId: normalizedRoomId,
            winner: result.winner,
          });
          endRoundAndRotate(io, normalizedRoomId, `${result.winner} got it right!`);
        } else if (session.status === 'ended') {
          logger.info('Round ended with all attempts exhausted', {
            roomId: normalizedRoomId,
          });
          endRoundAndRotate(io, normalizedRoomId, 'All attempts exhausted.');
        } else {
          emitRoomState(io, normalizedRoomId);
        }
      } catch (err) {
        logger.error('Submit guess failed', {
          socketId: socket.id,
          roomId: normalizedRoomId,
          error: err.message,
        });
        socket.emit('error', err.message);
      }
    });

    socket.on('disconnect', () => {
      const roomId = socketRooms[socket.id];

      if (!roomId) {
        logger.info('Socket disconnected without room', {
          socketId: socket.id,
        });
        return;
      }

      const session = getSession(roomId);
      delete socketRooms[socket.id];

      if (!session) {
        logger.info('Socket disconnected after session was already unavailable', {
          socketId: socket.id,
          roomId,
        });
        return;
      }

      const previousMasterId = session.getCurrentMaster()?.id || null;
      const wasPlaying = session.status === 'playing';
      const removedPlayer = session.removePlayer(socket.id);

      if (!removedPlayer) {
        logger.info('Socket disconnected but player was not found in room', {
          socketId: socket.id,
          roomId,
        });
        return;
      }

      logger.info('Player disconnected from room', {
        socketId: socket.id,
        roomId,
        playerName: removedPlayer.name,
        remainingPlayers: session.players.length,
      });

      if (session.players.length === 0) {
        clearRoomTimer(roomId);
        delete sessions[roomId];
        logger.info('Session deleted after last player left', {
          roomId,
        });
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

      if (wasPlaying && session.status === 'waiting') {
        logger.info('Round cancelled after disconnect reduced room below minimum players', {
          roomId,
          remainingPlayers: session.players.length,
        });
        io.to(roomId).emit('roundCancelled', {
          reason: 'Round cancelled because there are no longer enough players to continue.',
          state: session.getPublicState(),
        });
      }

      if (session.getCurrentMaster()?.id !== previousMasterId) {
        emitNewMasterAssigned(io, roomId, session);
      }

      logger.info('Socket disconnected', {
        socketId: socket.id,
        roomId,
      });
    });
  });
};
