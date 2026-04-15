/**
 * party.js — Party Room state and socket management
 *
 * Handles all real-time syncing, room management, and party state.
 * Uses Socket.IO for WebSocket communication.
 */

const PartyRoom = (() => {
  let socket = null;
  let currentPartyName = '';
  let isConnected = false;

  // Party State
  const PartyState = {
    // Room info
    roomId: null,
    roomName: '',
    roomType: 'public', // 'public' or 'private'
    maxUsers: 10,
    creatorId: null,

    // User info
    userId: null,
    role: null, // 'dj' or 'guest'
    partyName: null,

    // Room state
    djs: [],
    users: [],
    bucket: [], // { songId, title, artist, addedBy, addedAt }
    currentSong: null,
    currentTime: 0,
    isPlaying: false,

    // Join requests
    pendingRequests: [],

    // Messages
    messages: [],
  };

  // ── Initialization ───────────────────────────────────────────────

  function _setupSocket() {
    if (socket) return;

    // Get Socket.IO library - it should be loaded from CDN
    if (typeof io === 'undefined') {
      console.error('[PartyRoom] Socket.IO not loaded! Add to index.html.');
      return;
    }

    // Connect to backend
    // LOCAL: http://localhost:3001 (for development)
    // DEPLOYED: https://mu-labz-production.up.railway.app (for production)
    const backendUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : 'https://mu-labz-production.up.railway.app';

    console.log('[PartyRoom] Connecting to backend at', backendUrl);

    socket = io(backendUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['polling', 'websocket'], // polling first, then upgrade to WS
    });

    _attachSocketListeners();
  }

  // ── Socket Event Listeners ───────────────────────────────────────

  function _attachSocketListeners() {
    if (!socket) return;

    // Connection events
    socket.on('connect', () => {
      console.log('[PartyRoom] Connected to server');
      isConnected = true;
      document.dispatchEvent(new CustomEvent('party:connected'));
    });

    socket.on('disconnect', () => {
      console.log('[PartyRoom] Disconnected from server');
      isConnected = false;
      document.dispatchEvent(new CustomEvent('party:disconnected'));
    });

    // Room events
    socket.on('room:created', (data) => {
      PartyState.roomId = data.roomId;
      PartyState.roomName = data.roomName;
      PartyState.creatorId = data.creatorId;
      PartyState.userId = data.userId;
      PartyState.role = 'dj';
      PartyState.djs = [{ userId: data.userId, partyName: currentPartyName }];
      document.dispatchEvent(new CustomEvent('party:roomCreated', { detail: PartyState }));
    });

    socket.on('room:joined', (data) => {
      PartyState.roomId = data.roomId;
      PartyState.roomName = data.roomName;
      PartyState.userId = data.userId;
      PartyState.role = data.role || 'guest';
      PartyState.djs = data.djs || [];
      PartyState.users = data.users || [];
      PartyState.bucket = data.bucket || [];
      PartyState.currentSong = data.currentSong;
      PartyState.isPlaying = data.isPlaying;
      PartyState.currentTime = data.currentTime;
      document.dispatchEvent(new CustomEvent('party:roomJoined', { detail: PartyState }));
    });

    socket.on('user:joined', (data) => {
      const user = { userId: data.userId, partyName: data.partyName, role: data.role };
      if (!PartyState.users.find(u => u.userId === data.userId)) {
        PartyState.users.push(user);
      }
      document.dispatchEvent(new CustomEvent('party:userJoined', { detail: user }));
    });

    socket.on('user:left', (data) => {
      PartyState.users = PartyState.users.filter(u => u.userId !== data.userId);
      PartyState.djs = PartyState.djs.filter(u => u.userId !== data.userId);
      document.dispatchEvent(new CustomEvent('party:userLeft', { detail: data }));
    });

    // Playback sync events
    socket.on('playback:play', (data) => {
      PartyState.isPlaying = true;
      PartyState.currentSong = data.currentSong;
      PartyState.currentTime = data.currentTime;
      document.dispatchEvent(new CustomEvent('party:play', { detail: data }));
    });

    socket.on('playback:pause', (data) => {
      PartyState.isPlaying = false;
      PartyState.currentTime = data.currentTime;
      document.dispatchEvent(new CustomEvent('party:pause', { detail: data }));
    });

    socket.on('playback:seek', (data) => {
      PartyState.currentTime = data.currentTime;
      document.dispatchEvent(new CustomEvent('party:seek', { detail: data }));
    });

    socket.on('playback:next', (data) => {
      PartyState.currentSong = data.currentSong;
      PartyState.currentTime = 0;
      PartyState.isPlaying = true;
      PartyState.bucket = PartyState.bucket.filter(b => b.songId !== data.currentSong.id);
      document.dispatchEvent(new CustomEvent('party:next', { detail: data }));
    });

    // Bucket events
    socket.on('bucket:add', (data) => {
      const item = {
        songId: data.songId,
        title: data.title,
        artist: data.artist,
        addedBy: data.addedBy,
        addedAt: data.addedAt,
      };
      PartyState.bucket.push(item);
      document.dispatchEvent(new CustomEvent('party:bucketAdd', { detail: item }));
    });

    socket.on('bucket:remove', (data) => {
      PartyState.bucket = PartyState.bucket.filter(b => b.songId !== data.songId);
      document.dispatchEvent(new CustomEvent('party:bucketRemove', { detail: data.songId }));
    });

    // Role events
    socket.on('role:djRequest', (data) => {
      if (!PartyState.pendingRequests.find(r => r.userId === data.userId)) {
        PartyState.pendingRequests.push(data);
      }
      document.dispatchEvent(new CustomEvent('party:djRequest', { detail: data }));
    });

    socket.on('role:djApproved', (data) => {
      const user = PartyState.users.find(u => u.userId === data.userId);
      if (user) user.role = 'dj';
      if (!PartyState.djs.find(d => d.userId === data.userId)) {
        PartyState.djs.push({ userId: data.userId, partyName: data.partyName });
      }
      PartyState.pendingRequests = PartyState.pendingRequests.filter(r => r.userId !== data.userId);
      document.dispatchEvent(new CustomEvent('party:djApproved', { detail: data }));
    });

    // Chat events
    socket.on('message:new', (data) => {
      PartyState.messages.push({
        userId: data.userId,
        partyName: data.partyName,
        text: data.text,
        timestamp: data.timestamp,
      });
      document.dispatchEvent(new CustomEvent('party:messageNew', { detail: data }));
    });

    // Join request events
    socket.on('joinRequest:new', (data) => {
      if (!PartyState.pendingRequests.find(r => r.userId === data.userId)) {
        PartyState.pendingRequests.push(data);
      }
      document.dispatchEvent(new CustomEvent('party:joinRequestNew', { detail: data }));
    });

    socket.on('room:closed', () => {
      document.dispatchEvent(new CustomEvent('party:roomClosed'));
    });

    socket.on('error', (err) => {
      console.error('[PartyRoom] Socket error:', err);
      document.dispatchEvent(new CustomEvent('party:error', { detail: err }));
    });
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    // Getters
    getState: () => PartyState,
    isConnected: () => isConnected,
    getPartyName: () => currentPartyName,

    // Setters
    setPartyName: (name) => {
      currentPartyName = name;
      localStorage.setItem('mu_labz_party_name', name);
    },

    // Room creation/joining
    init: () => _setupSocket(),

    createRoom: (roomName, maxUsers, roomType, password = null) => {
      if (!socket || !isConnected) {
        console.error('[PartyRoom] Socket not connected');
        return;
      }
      socket.emit('room:create', {
        roomName,
        maxUsers,
        roomType,
        password,
        partyName: currentPartyName,
      });
    },

    joinRoom: (roomId, password = null) => {
      if (!socket || !isConnected) {
        console.error('[PartyRoom] Socket not connected');
        return;
      }
      socket.emit('room:join', {
        roomId,
        password,
        partyName: currentPartyName,
      });
    },

    leaveRoom: () => {
      if (!socket || !isConnected) return;
      socket.emit('room:leave', { roomId: PartyState.roomId });
      PartyState.roomId = null;
      PartyState.users = [];
      PartyState.djs = [];
      PartyState.bucket = [];
    },

    // Playback controls (DJ only)
    playTrack: (track) => {
      if (!socket || !isConnected) return;
      socket.emit('playback:play', {
        roomId: PartyState.roomId,
        currentSong: track,
        currentTime: 0,
      });
    },

    pausePlayback: () => {
      if (!socket || !isConnected) return;
      socket.emit('playback:pause', {
        roomId: PartyState.roomId,
        currentTime: PartyState.currentTime,
      });
    },

    resumePlayback: () => {
      if (!socket || !isConnected) return;
      socket.emit('playback:resume', {
        roomId: PartyState.roomId,
        currentTime: PartyState.currentTime,
      });
    },

    seekTo: (time) => {
      if (!socket || !isConnected) return;
      socket.emit('playback:seek', {
        roomId: PartyState.roomId,
        currentTime: time,
      });
    },

    skipToNext: () => {
      if (!socket || !isConnected) return;
      socket.emit('playback:next', {
        roomId: PartyState.roomId,
      });
    },

    // Bucket management
    addToBucket: (track) => {
      if (!socket || !isConnected) return;
      socket.emit('bucket:add', {
        roomId: PartyState.roomId,
        songId: track.id,
        title: track.title,
        artist: track.artist,
        addedBy: currentPartyName,
      });
    },

    removeFromBucket: (songId) => {
      if (!socket || !isConnected) return;
      socket.emit('bucket:remove', {
        roomId: PartyState.roomId,
        songId,
      });
    },

    playFromBucket: (songId) => {
      if (!socket || !isConnected) return;
      const track = PartyState.bucket.find(b => b.songId === songId);
      if (track) {
        socket.emit('playback:play', {
          roomId: PartyState.roomId,
          currentSong: { id: track.songId, title: track.title, artist: track.artist },
          currentTime: 0,
        });
      }
    },

    // Role management
    requestDJ: () => {
      if (!socket || !isConnected) return;
      socket.emit('role:requestDJ', {
        roomId: PartyState.roomId,
        userId: PartyState.userId,
        partyName: currentPartyName,
      });
    },

    approveDJ: (userId) => {
      if (!socket || !isConnected) return;
      socket.emit('role:approveDJ', {
        roomId: PartyState.roomId,
        userId,
      });
    },

    rejectDJRequest: (userId) => {
      if (!socket || !isConnected) return;
      socket.emit('role:rejectDJ', {
        roomId: PartyState.roomId,
        userId,
      });
    },

    // Chat
    sendMessage: (text) => {
      if (!socket || !isConnected) return;
      socket.emit('message:send', {
        roomId: PartyState.roomId,
        text,
        partyName: currentPartyName,
      });
    },

    // Sync helpers
    syncPlaybackTime: () => {
      if (!socket || !isConnected) return;
      socket.emit('playback:syncTime', {
        roomId: PartyState.roomId,
        currentTime: PartyState.currentTime,
      });
    },
  };
})();

// Load party name from storage on init
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('mu_labz_party_name');
  if (saved) {
    PartyRoom.setPartyName(saved);
  }
});