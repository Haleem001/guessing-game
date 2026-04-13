const renderLobby = (req, res) => {
  res.render('lobby', {
    title: 'Join a Game',
  });
};

const renderRoom = (req, res) => {
  const { roomId } = req.params;
  const { name = '' } = req.query;

  res.render('room', {
    title: `Room: ${roomId}`,
    roomId,
    name,
  });
};

module.exports = {
  renderLobby,
  renderRoom,
};
