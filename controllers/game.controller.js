const renderLobby = (req, res) => {
  res.render('lobby', {
    title: 'Guessing Game Lobby',
  });
};

const renderRoom = (req, res) => {
  res.render('room', {
    title: 'Guessing Game Room',
    roomId: req.params.roomId,
  });
};

module.exports = {
  renderLobby,
  renderRoom,
};
