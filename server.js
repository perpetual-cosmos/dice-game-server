const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const httpServer = createServer(app);
const PORT = 3001;

const io = new Server(httpServer, {
  cors: {
    origin: "https://dice-game-frontend-two.vercel.app/",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

const calculateNewScore = (currentScore, diceValues) => {
  const sum = diceValues.reduce((a, b) => a + b, 0);
  const isDouble = diceValues[0] === diceValues[1];
  return isDouble ? currentScore + (sum * 2) : currentScore + sum;
};

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('join-game', ({ roomId, playerName }) => {
    const roomKey = roomId || 'default';
    
    if (!rooms.has(roomKey)) {
      rooms.set(roomKey, {
        players: [],
        diceValues: [1, 1],
        currentPlayer: null,
        status: 'waiting'
      });
    }

    const room = rooms.get(roomKey);
    const existingPlayer = room.players.find(p => p.id === socket.id);
    
    if (!existingPlayer) {
      const newPlayer = {
        id: socket.id,
        name: playerName,
        score: 0,
        rollCount: 0,
        doublesCount: 0,
        isActive: false
      };

      room.players.push(newPlayer);
      
      if (room.players.length === 1) {
        room.currentPlayer = socket.id;
        newPlayer.isActive = true;
        room.status = 'playing';
      }
    }

    socket.join(roomKey);
    io.to(roomKey).emit('game-state', room);
  });

  socket.on('roll-dice', (roomId) => {
    const roomKey = roomId || 'default';
    const room = rooms.get(roomKey);
    
    if (!room || socket.id !== room.currentPlayer) return;

    const newValues = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1
    ];

    const currentPlayer = room.players.find(p => p.id === socket.id);
    currentPlayer.score = calculateNewScore(currentPlayer.score, newValues);
    currentPlayer.rollCount++;

    const isDouble = newValues[0] === newValues[1];
    if (isDouble) currentPlayer.doublesCount++;

    if (currentPlayer.score >= 100) {
      io.to(roomKey).emit('game-over', currentPlayer);
      rooms.delete(roomKey);
      return;
    }

    room.diceValues = newValues;

    if (!isDouble) {
      const currentIndex = room.players.findIndex(p => p.id === socket.id);
      const nextIndex = (currentIndex + 1) % room.players.length;
      room.currentPlayer = room.players[nextIndex].id;
    }

    room.players.forEach(p => p.isActive = p.id === room.currentPlayer);
    io.to(roomKey).emit('game-state', room);
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, roomKey) => {
      room.players = room.players.filter(p => p.id !== socket.id);
      
      if (room.players.length === 0) {
        rooms.delete(roomKey);
      } else {
        if (room.currentPlayer === socket.id) {
          room.currentPlayer = room.players[0].id;
          room.players[0].isActive = true;
        }
        io.to(roomKey).emit('game-state', room);
      }
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
