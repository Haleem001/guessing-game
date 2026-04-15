# Guessing Game

A real-time multiplayer guessing game built with Node.js, Express, Socket.io, and EJS.

Players join a shared room, one player becomes the game master, and the rest try to guess the correct answer before time runs out. Scores, attempts, answers, and round state are updated live for everyone in the room.

## Features

- Real-time multiplayer gameplay with Socket.io
- Chat-style game session interface
- Room creation and shareable room links
- Auto-generated room codes
- Game master creates the question and answer
- Minimum of 3 players required before a round can start
- 60-second timer per round
- 3 attempts per player
- Live player count, scores, attempts, and round updates
- Master rotation after each completed round
- Session cleanup when all players leave
- HTTP rate limiting
- Structured logging with `error`, `info`, and `debug` levels

## Stack

- Node.js
- Express
- Socket.io
- EJS
- dotenv

## Project Structure

```text
controllers/
models/
routes/
views/
public/
server.js
```

## How It Works

The app follows a simple MVC flow:

- The model stores the game state
- The socket controller updates the game state based on player events
- The views render the UI and react to live socket events

## Gameplay Rules

- The first player in a room becomes the game master
- Other players can join before the round starts
- A round can only start when there are at least 3 players in the room
- Only the game master can start a round
- The game master creates a question and answer
- Each player gets 3 attempts to guess correctly
- The round ends when:
  - a player guesses correctly
  - all attempts are exhausted
  - the 60-second timer expires
- A correct guess awards 10 points
- After a round ends, a new game master is assigned

## Environment Variables

The project uses a single `.env` file.

Example values:

```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=200
```

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Update `.env` if needed

3. Start the server:

```bash
npm start
```

4. Open your browser:

```text
http://localhost:3000
```

## Logging

The app includes structured logging with three levels:

- `error` for failures and invalid operations
- `info` for normal application events
- `debug` for development-level gameplay traces

Set the log level in `.env`:

```env
LOG_LEVEL=debug
```

## Rate Limiting

HTTP requests are rate-limited using an in-memory middleware.

Configurable values:

- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`
