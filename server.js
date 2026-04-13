const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const gameRoutes = require('./routes/game.routes');
const registerSocketHandlers = require('./controllers/socket.controller');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', gameRoutes);

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`Guessing Game server listening on port ${PORT}`);
});
