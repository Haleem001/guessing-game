const express = require('express');
const {
  renderLobby,
  renderRoom,
} = require('../controllers/game.controller');

const router = express.Router();

router.get('/', renderLobby);
router.get('/game/:roomId', renderRoom);

module.exports = router;
