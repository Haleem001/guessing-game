class GameSession {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.masterIndex = -1;
    this.question = null;
    this.answer = null;
    this.status = 'waiting';
    this.maxAttempts = 3;
    this.pointsPerRound = 10;
    this.winnerId = null;
    this.timerSeconds = 60;
  }

  addPlayer(player) {
    if (!player?.id || !player?.name) {
      throw new Error('Player id and name are required.');
    }

    const existingPlayer = this.getPlayerById(player.id);

    if (existingPlayer) {
      existingPlayer.name = player.name;
      return existingPlayer;
    }

    const newPlayer = {
      id: player.id,
      name: player.name,
      score: 0,
      attemptsLeft: this.maxAttempts,
      isMaster: false,
    };

    this.players.push(newPlayer);

    if (this.masterIndex === -1) {
      this.masterIndex = 0;
      this.syncMasterRole();
    }

    return newPlayer;
  }

  removePlayer(playerId) {
    const playerIndex = this.players.findIndex((player) => player.id === playerId);

    if (playerIndex === -1) {
      return null;
    }

    const [removedPlayer] = this.players.splice(playerIndex, 1);

    if (this.players.length === 0) {
      this.resetSession();
      return removedPlayer;
    }

    if (playerIndex < this.masterIndex) {
      this.masterIndex -= 1;
    } else if (playerIndex === this.masterIndex) {
      this.masterIndex = this.masterIndex % this.players.length;
    }

    this.syncMasterRole();

    if (!this.canStartGame() && this.status === 'playing') {
      this.endRound();
      this.status = 'waiting';
    }

    return removedPlayer;
  }

  canStartGame() {
    return this.players.length >= 3;
  }

  startRound(question, answer) {
    if (!this.canStartGame()) {
      throw new Error('At least 3 players are required to start the game.');
    }

    if (!question || !answer) {
      throw new Error('Question and answer are required to start.');
    }

    this.question = String(question).trim();
    this.answer = String(answer).toLowerCase().trim();
    this.status = 'playing';
    this.winnerId = null;

    this.players.forEach((player) => {
      player.attemptsLeft = this.maxAttempts;
    });

    this.syncMasterRole();

    return this.getPublicState();
  }

  submitGuess(playerId, guess) {
    if (this.status !== 'playing') {
      throw new Error('Game is not in progress.');
    }

    const player = this.getPlayerById(playerId);

    if (!player || player.isMaster || player.attemptsLeft <= 0) {
      throw new Error('Invalid guess attempt.');
    }

    const normalizedGuess = String(guess || '').toLowerCase().trim();

    if (!normalizedGuess) {
      throw new Error('Guess is required.');
    }

    player.attemptsLeft -= 1;

    const isCorrect = normalizedGuess === this.answer;

    if (isCorrect) {
      player.score += this.pointsPerRound;
      this.winnerId = player.id;
      this.endRound();

      return {
        outcome: 'correct',
        winner: player.name,
        attemptsLeft: player.attemptsLeft,
        player: this.getPlayerSummary(player.id),
        state: this.getPublicState(),
      };
    }

    if (this.haveGuessersExhaustedAttempts()) {
      this.endRound();
    }

    return {
      outcome: 'incorrect',
      attemptsLeft: player.attemptsLeft,
      player: this.getPlayerSummary(player.id),
      state: this.getPublicState(),
    };
  }

  rotateMaster() {
    if (this.players.length === 0) {
      this.masterIndex = -1;
      return null;
    }

    this.masterIndex = (this.masterIndex + 1) % this.players.length;
    this.syncMasterRole();

    return this.getCurrentMaster();
  }

  endRound() {
    this.status = 'ended';
  }

  resetSession() {
    this.players = [];
    this.masterIndex = -1;
    this.question = null;
    this.answer = null;
    this.status = 'waiting';
    this.winnerId = null;
  }

  getCurrentMaster() {
    if (this.masterIndex < 0 || this.masterIndex >= this.players.length) {
      return null;
    }

    return this.players[this.masterIndex];
  }

  getPlayerById(playerId) {
    return this.players.find((player) => player.id === playerId) || null;
  }

  getPlayerSummary(playerId) {
    const player = this.getPlayerById(playerId);

    if (!player) {
      return null;
    }

    return {
      id: player.id,
      name: player.name,
      score: player.score,
      attemptsLeft: player.attemptsLeft,
      isMaster: player.isMaster,
    };
  }

  getPublicState() {
    return {
      roomId: this.roomId,
      status: this.status,
      question: this.question,
      answer: this.status === 'ended' ? this.answer : null,
      masterId: this.getCurrentMaster()?.id || null,
      winnerId: this.winnerId,
      playerCount: this.players.length,
      players: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score,
        attemptsLeft: player.attemptsLeft,
        isMaster: player.isMaster,
      })),
      canStart: this.canStartGame(),
      maxAttempts: this.maxAttempts,
      pointsPerRound: this.pointsPerRound,
      timerSeconds: this.timerSeconds,
    };
  }

  haveGuessersExhaustedAttempts() {
    return this.players
      .filter((player) => !player.isMaster)
      .every((player) => player.attemptsLeft === 0);
  }

  syncMasterRole() {
    this.players.forEach((player, index) => {
      player.isMaster = index === this.masterIndex;
    });
  }
}

module.exports = GameSession;
