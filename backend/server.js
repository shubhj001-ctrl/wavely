/**
 * backend/server.js — Party Room Backend
 *
 * Node.js + Express + Socket.IO server
 * Handles room management, real-time sync, and user connections
 *
 * Run: npm install express socket.io uuid cors
 * Then: node server.js
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// CORS Configuration - Allow requests from both local and production
// UPDATE: Add your Render backend URL here after deployment
const corsOrigins = [
  'http://localhost:3000',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  'https://mulabz.vercel.app',
  'https://mulabz.onrender.com', // Render backend URL (UPDATE AFTER DEPLOYMENT)
];

const corsOptions = {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
};

// Apply CORS to Express
app.use(cors(corsOptions));

// Socket.IO with matching CORS
const io = socketIO(server, {
  cors: corsOptions,
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000
});

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rooms list endpoint
app.get('/rooms', (req, res) => {
  const roomsList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    type: room.type,
    users: room.users.length + room.djs.length,
    maxUsers: room.maxUsers,
  }));
  res.json(roomsList);
});

// ── Room Storage ───────────────────────────────────────────────────

const rooms = new Map(); // roomId -> room object
const userSockets = new Map(); // userId -> socket id
const socketToUser = new Map(); // socket id -> { userId, roomId }

// ── Room Structure ─────────────────────────────────────────────────

function createRoom(roomName, maxUsers, roomType, password, creatorId, creatorPartyName) {
  const roomId = uuidv4().substring(0, 8);
  const room = {
    id: roomId,
    name: roomName,
    type: roomType,
    password: roomType === 'private' ? password : null,
    maxUsers,
    createdAt: Date.now(),
    creatorId,
    
    // Users
    djs: [{ userId: creatorId, partyName: creatorPartyName }],
    users: [],
    
    // Playback state
    currentSong: null,
    currentTime: 0,
    isPlaying: false,
    
    // Bucket list
    bucket: [],
    
    // Join requests (for public rooms)
    pendingRequests: [],
  };
  
  rooms.set(roomId, room);
  console.log(`[Room] Created room: ${roomId} - ${roomName}`);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function deleteRoom(roomId) {
  const room = getRoom(roomId);
  if (room) {
    rooms.delete(roomId);
    console.log(`[Room] Deleted room: ${roomId}`);
    
    // Notify all users in room
    io.to(roomId).emit('room:closed', { reason: 'DJ left' });
  }
}

// ── Socket Events ───────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`✅ [Socket] User connected: ${socket.id}`);
  console.log(`📍 [Socket] From origin: ${socket.handshake.headers.origin}`);

  socket.emit('connect:success', { 
    message: 'Connected to Party Room backend',
    timestamp: new Date().toISOString()
  });

  socket.on('room:create', (data) => {
    const userId = socket.id; // Use socket id as temporary userId
    const { roomName, maxUsers, roomType, password, partyName } = data;

    const room = createRoom(roomName, maxUsers, roomType, password, userId, partyName);
    
    socket.join(room.id);
    socketToUser.set(socket.id, { userId, roomId: room.id });
    userSockets.set(userId, socket.id);

    socket.emit('room:created', {
      roomId: room.id,
      roomName: room.name,
      creatorId: userId,
      userId,
    });

    console.log(`[Socket] ${partyName} created room ${room.id}`);
  });

  socket.on('room:join', (data) => {
    const userId = socket.id;
    const { roomId, password, partyName } = data;
    const room = getRoom(roomId);

    if (!room) {
      socket.emit('error', { type: 'ROOM_NOT_FOUND', message: 'Room does not exist' });
      return;
    }

    if (room.type === 'private' && room.password !== password) {
      socket.emit('error', { type: 'INVALID_PASSWORD', message: 'Invalid room password' });
      return;
    }

    if (room.users.length + room.djs.length >= room.maxUsers) {
      socket.emit('error', { type: 'ROOM_FULL', message: 'Room is full' });
      return;
    }

    // For public rooms, send join request
    if (room.type === 'public') {
      room.pendingRequests.push({ userId, partyName, requestedAt: Date.now() });
      
      // Notify DJs of join request
      const djSocketIds = room.djs.map(dj => userSockets.get(dj.userId)).filter(Boolean);
      io.to(djSocketIds).emit('joinRequest:new', {
        userId,
        partyName,
        roomId,
      });
      
      socket.emit('joinRequest:pending', { message: 'Join request sent to DJ' });
      console.log(`[Socket] ${partyName} requested to join ${roomId}`);
      return;
    }

    // Private room: direct join
    const user = { userId, partyName, role: 'guest' };
    room.users.push(user);
    
    socket.join(room.id);
    socketToUser.set(socket.id, { userId, roomId });
    userSockets.set(userId, socket.id);

    // Send room state to new user
    socket.emit('room:joined', {
      roomId: room.id,
      roomName: room.name,
      userId,
      role: 'guest',
      djs: room.djs,
      users: room.users,
      bucket: room.bucket,
      currentSong: room.currentSong,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime,
    });

    // Notify others
    io.to(room.id).emit('user:joined', {
      userId,
      partyName,
      role: 'guest',
    });

    console.log(`[Socket] ${partyName} joined room ${roomId}`);
  });

  // DJ approval for join requests (public rooms)
  socket.on('joinRequest:approve', (data) => {
    const { roomId, userId: requestingUserId } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.pendingRequests = room.pendingRequests.filter(r => r.userId !== requestingUserId);
    
    // Find user in pending and add to users
    const requestingSocket = userSockets.get(requestingUserId);
    if (requestingSocket) {
      const req = data.pendingRequest || {};
      room.users.push({ userId: requestingUserId, partyName: req.partyName, role: 'guest' });
      
      // Notify requesting user
      io.to(requestingSocket).emit('joinRequest:approved', {
        roomId,
        roomName: room.name,
      });
      
      // Broadcast to room
      io.to(roomId).emit('user:joined', {
        userId: requestingUserId,
        partyName: req.partyName,
        role: 'guest',
      });
    }
  });

  // Playback events (DJ only)
  socket.on('playback:play', (data) => {
    const { roomId, currentSong, currentTime } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.currentSong = currentSong;
    room.currentTime = currentTime || 0;
    room.isPlaying = true;

    io.to(roomId).emit('playback:play', {
      currentSong,
      currentTime,
    });

    console.log(`[Playback] Playing: ${currentSong?.title} in ${roomId}`);
  });

  socket.on('playback:pause', (data) => {
    const { roomId, currentTime } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.isPlaying = false;
    room.currentTime = currentTime;

    io.to(roomId).emit('playback:pause', {
      currentTime,
    });
  });

  socket.on('playback:resume', (data) => {
    const { roomId, currentTime } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.isPlaying = true;
    room.currentTime = currentTime;

    io.to(roomId).emit('playback:resume', {
      currentTime,
    });
  });

  socket.on('playback:seek', (data) => {
    const { roomId, currentTime } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.currentTime = currentTime;

    io.to(roomId).emit('playback:seek', {
      currentTime,
    });
  });

  socket.on('playback:next', (data) => {
    const { roomId } = data;
    const room = getRoom(roomId);
    if (!room) return;

    // Get next from bucket
    if (room.bucket.length > 0) {
      const nextItem = room.bucket.shift();
      room.currentSong = {
        id: nextItem.songId,
        title: nextItem.title,
        artist: nextItem.artist,
      };
    } else {
      room.currentSong = null;
    }

    room.currentTime = 0;
    room.isPlaying = room.currentSong ? true : false;

    io.to(roomId).emit('playback:next', {
      currentSong: room.currentSong,
    });
  });

  socket.on('playback:syncTime', (data) => {
    const { roomId, currentTime } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.currentTime = currentTime;
    // Broadcast sync to all except sender
    socket.to(roomId).emit('playback:syncTime', {
      currentTime,
    });
  });

  // Bucket events
  socket.on('bucket:add', (data) => {
    const { roomId, songId, title, artist, addedBy } = data;
    const room = getRoom(roomId);
    if (!room) return;

    const item = {
      songId,
      title,
      artist,
      addedBy,
      addedAt: Date.now(),
    };

    room.bucket.push(item);

    io.to(roomId).emit('bucket:add', item);
    console.log(`[Bucket] Added song to ${roomId}: ${title}`);
  });

  socket.on('bucket:remove', (data) => {
    const { roomId, songId } = data;
    const room = getRoom(roomId);
    if (!room) return;

    room.bucket = room.bucket.filter(b => b.songId !== songId);

    io.to(roomId).emit('bucket:remove', {
      songId,
    });
  });

  // Role management
  socket.on('role:requestDJ', (data) => {
    const { roomId, userId, partyName } = data;
    const room = getRoom(roomId);
    if (!room) return;

    // Notify DJs
    const djSocketIds = room.djs.map(dj => userSockets.get(dj.userId)).filter(Boolean);
    io.to(djSocketIds).emit('role:djRequest', {
      userId,
      partyName,
      roomId,
    });

    console.log(`[Role] ${partyName} requested DJ in ${roomId}`);
  });

  socket.on('role:approveDJ', (data) => {
    const { roomId, userId } = data;
    const room = getRoom(roomId);
    if (!room) return;

    // Find user and promote to DJ
    const user = room.users.find(u => u.userId === userId);
    if (user) {
      room.users = room.users.filter(u => u.userId !== userId);
      room.djs.push({ userId, partyName: user.partyName });

      io.to(roomId).emit('role:djApproved', {
        userId,
        partyName: user.partyName,
      });

      console.log(`[Role] User ${userId} promoted to DJ in ${roomId}`);
    }
  });

  socket.on('role:rejectDJ', (data) => {
    const { roomId, userId } = data;
    const room = getRoom(roomId);
    if (!room) return;

    const userSock = userSockets.get(userId);
    if (userSock) {
      io.to(userSock).emit('role:djRejected', {
        reason: 'DJ rejected your request',
      });
    }

    room.pendingRequests = room.pendingRequests.filter(r => r.userId !== userId);
  });

  // Chat
  socket.on('message:send', (data) => {
    const { roomId, text, partyName } = data;
    const room = getRoom(roomId);
    if (!room) return;

    const message = {
      userId: socket.id,
      partyName,
      text,
      timestamp: Date.now(),
    };

    // Store in room (optional, for history)
    if (room.messages === undefined) {
      room.messages = [];
    }
    room.messages.push(message);

    io.to(roomId).emit('message:new', message);
    console.log(`[Chat] ${partyName} in ${roomId}: ${text}`);
  });

  // Leave room
  socket.on('room:leave', (data) => {
    const { roomId } = data;
    const room = getRoom(roomId);
    const userInfo = socketToUser.get(socket.id);

    if (room && userInfo) {
      const { userId } = userInfo;

      // Remove user from room
      room.users = room.users.filter(u => u.userId !== userId);
      room.djs = room.djs.filter(d => d.userId !== userId);
      room.pendingRequests = room.pendingRequests.filter(r => r.userId !== userId);

      socket.leave(roomId);
      socketToUser.delete(socket.id);
      userSockets.delete(userId);

      // Check if room is empty
      if (room.users.length === 0 && room.djs.length === 0) {
        deleteRoom(roomId);
      } else {
        io.to(roomId).emit('user:left', {
          userId,
        });
      }

      console.log(`[Socket] User ${userId} left room ${roomId}`);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const userInfo = socketToUser.get(socket.id);
    if (userInfo) {
      const { roomId, userId } = userInfo;
      const room = getRoom(roomId);

      if (room) {
        room.users = room.users.filter(u => u.userId !== userId);
        room.djs = room.djs.filter(d => d.userId !== userId);
        room.pendingRequests = room.pendingRequests.filter(r => r.userId !== userId);

        if (room.users.length === 0 && room.djs.length === 0) {
          deleteRoom(roomId);
        } else {
          io.to(roomId).emit('user:left', { userId });
        }
      }

      socketToUser.delete(socket.id);
      userSockets.delete(userId);
    }

    console.log(`[Socket] User disconnected: ${socket.id}`);
  });

  // Debug: List active rooms
  socket.on('debug:rooms', () => {
    const roomsList = Array.from(rooms.values()).map(r => ({
      id: r.id,
      name: r.name,
      users: r.users.length + r.djs.length,
      maxUsers: r.maxUsers,
    }));
    socket.emit('debug:rooms', roomsList);
  });
});

// ── Server Startup ────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🎵 MU LABZ Party Room Server Running\n`);
  console.log(`   Socket.IO:  ws://localhost:${PORT}`);
  console.log(`   HTTP:       http://localhost:${PORT}`);
  console.log(`   Health:     http://localhost:${PORT}/health`);
  console.log(`   Rooms:      GET http://localhost:${PORT}/rooms`);
  console.log(`\n`);
});
