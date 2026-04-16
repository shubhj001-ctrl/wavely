/**
 * party.js — Party Room state and socket management (FIXED)
 *
 * Handles all real-time syncing, room management, and party state.
 * Uses Socket.IO for WebSocket communication.
 * BUG FIXES:
 * - Proper error event handling
 * - Support for 4-digit passcodes
 * - User removal capability
 * - Better public/private room handling
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
    roomPassword: null, // 4-digit passcode for private rooms
    maxUsers: 10,
    creatorId: null,

    // User info
    userId: null,
    role: null, // 'dj' or 'guest'
    partyName: null,

    // Room state
    djs: [],
    users: [],
    bucket: [], // { songId, title, artist, image, addedBy, addedAt }
    currentSong: null,
    currentTime: 0,
    isPlaying: false,
  };

  // ── Initialization ───────────────────────────────────────────────

  function _setupSocket() {
    if (socket) return;

    // Get Socket.IO library - it should be loaded from CDN
    if (typeof io === 'undefined') {
      console.error('[PartyRoom] Socket.IO not loaded! Add to index.html.');
      return;
    }

    // Determine environment
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let backendUrl;
    
    if (isDev) {
      backendUrl = 'http://localhost:3001';
      console.log('[PartyRoom] 🔧 Development mode - using localhost backend');
    } else {
      backendUrl = 'https://mu-labz-backend.onrender.com';
      console.log('[PartyRoom] 🌐 Production mode - using Render backend');
      
      // Show backend status check
      _checkBackendHealth(backendUrl);
    }

    console.log('[PartyRoom] Connecting to backend at', backendUrl);

    socket = io(backendUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      reconnectionInitialDelay: 1000,
      transports: ['websocket', 'polling'],
      secure: !isDev,
      rejectUnauthorized: false,
      timeout: 20000,
      forceNew: true,
      path: '/socket.io/',
      upgrade: true,
      rememberUpgrade: true,
    });

    _attachSocketListeners();
  }

  function _checkBackendHealth(url) {
    console.log('[PartyRoom] 🏥 Checking backend health...');
    fetch(`${url}/health`, { 
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      mode: 'cors'
    })
      .then(res => res.json())
      .then(data => {
        console.log('[PartyRoom] ✅ Backend is ONLINE:', data);
        document.dispatchEvent(new CustomEvent('party:backendOnline'));
      })
      .catch(err => {
        console.error('[PartyRoom] ❌ Backend is OFFLINE or unreachable');
        console.error('[PartyRoom] Error:', err.message);
        console.error('[PartyRoom] ⚠️  Cannot reach: ' + url + '/health');
        document.dispatchEvent(new CustomEvent('party:backendOffline', { 
          detail: { url, error: err.message } 
        }));
      });
  }

  // ── Socket Event Listeners ───────────────────────────────────────

  function _attachSocketListeners() {
    if (!socket) return;

    socket.on('connect', () => {
      console.log('[PartyRoom] ✅ Connected to server:', socket.id);
      isConnected = true;
      document.dispatchEvent(new CustomEvent('party:connected'));
    });

    socket.on('disconnect', () => {
      console.log('[PartyRoom] ❌ Disconnected from server');
      isConnected = false;
      document.dispatchEvent(new CustomEvent('party:disconnected'));
    });

    // Connection success
    socket.on('connect:success', (data) => {
      console.log('[PartyRoom] ✅ Backend connection successful:', data.message);
    });

    socket.on('connect_error', (error) => {
      console.error('[PartyRoom] ⚠️ Connection error:', error?.message || error);
      document.dispatchEvent(new CustomEvent('party:connectionError', { detail: error }));
    });

    socket.on('error', (err) => {
      console.error('[PartyRoom] ⚠️ Socket error:', err?.type, err?.message || err);
      document.dispatchEvent(new CustomEvent('party:error', { detail: err }));
    });

    // ── Room Events ══════════════════════════════════════════════

    // Room created
    socket.on('room:created', (data) => {
      console.log('[PartyRoom] Room created:', data.roomId);
      PartyState.roomId = data.roomId;
      PartyState.roomName = data.roomName;
      PartyState.roomType = data.roomType;
      PartyState.roomPassword = data.roomPassword;
      PartyState.creatorId = data.creatorId;
      PartyState.userId = data.userId;
      PartyState.role = 'dj';
      PartyState.djs = [{ userId: data.userId, partyName: currentPartyName }];
      document.dispatchEvent(new CustomEvent('party:roomCreated', { detail: PartyState }));
    });

    // Room joined successfully
    socket.on('room:joined', (data) => {
      console.log('[PartyRoom] Room joined:', data.roomId);
      PartyState.roomId = data.roomId;
      PartyState.roomName = data.roomName;
      PartyState.roomType = data.roomType;
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

    // Room closed
    socket.on('room:closed', (data) => {
      console.log('[PartyRoom] Room closed:', data.reason);
      document.dispatchEvent(new CustomEvent('party:roomClosed', { detail: data }));
    });

    // ── User Events ══════════════════════════════════════════════

    // User joined room
    socket.on('user:joined', (data) => {
      console.log('[PartyRoom] User joined:', data.partyName);
      const user = { userId: data.userId, partyName: data.partyName, role: data.role || 'guest' };
      if (!PartyState.users.find(u => u.userId === data.userId) && !PartyState.djs.find(d => d.userId === data.userId)) {
        PartyState.users.push(user);
      }
      document.dispatchEvent(new CustomEvent('party:userJoined', { detail: user }));
    });

    // User left room
    socket.on('user:left', (data) => {
      console.log('[PartyRoom] User left:', data.userId);
      PartyState.users = PartyState.users.filter(u => u.userId !== data.userId);
      PartyState.djs = PartyState.djs.filter(u => u.userId !== data.userId);
      document.dispatchEvent(new CustomEvent('party:userLeft', { detail: data }));
    });

    // User removed from room
    socket.on('user:removed', (data) => {
      console.log('[PartyRoom] User removed:', data.userId || 'you');
      if (data.userId === PartyState.userId) {
        // Current user was removed
        document.dispatchEvent(new CustomEvent('party:userRemovedSelf', { detail: data }));
      } else {
        PartyState.users = PartyState.users.filter(u => u.userId !== data.userId);
      }
      document.dispatchEvent(new CustomEvent('party:userRemoved', { detail: data }));
    });

    // ── Playback Events ══════════════════════════════════════════

    socket.on('playback:play', (data) => {
      console.log('[PartyRoom] Playing:', data.currentSong?.title);
      PartyState.isPlaying = true;
      PartyState.currentSong = data.currentSong;
      PartyState.currentTime = data.currentTime;
      document.dispatchEvent(new CustomEvent('party:play', { detail: data }));
    });

    socket.on('playback:pause', (data) => {
      console.log('[PartyRoom] Paused');
      PartyState.isPlaying = false;
      PartyState.currentTime = data.currentTime;
      document.dispatchEvent(new CustomEvent('party:pause', { detail: data }));
    });

    socket.on('playback:resume', (data) => {
      console.log('[PartyRoom] Resumed');
      PartyState.isPlaying = true;
      PartyState.currentTime = data.currentTime;
      document.dispatchEvent(new CustomEvent('party:resume', { detail: data }));
    });

    socket.on('playback:seek', (data) => {
      PartyState.currentTime = data.currentTime;
      document.dispatchEvent(new CustomEvent('party:seek', { detail: data }));
    });

    socket.on('playback:next', (data) => {
      console.log('[PartyRoom] Next track:', data.currentSong?.title);
      PartyState.currentSong = data.currentSong;
      PartyState.currentTime = 0;
      PartyState.isPlaying = data.currentSong ? true : false;
      if (data.currentSong) {
        PartyState.bucket = PartyState.bucket.filter(b => b.songId !== data.currentSong.id);
      }
      document.dispatchEvent(new CustomEvent('party:next', { detail: data }));
    });

    socket.on('playback:syncTime', (data) => {
      PartyState.currentTime = data.currentTime;
      document.dispatchEvent(new CustomEvent('party:syncTime', { detail: data }));
    });

    // ── Bucket Events ════════════════════════════════════════════

    socket.on('bucket:add', (data) => {
      console.log('[PartyRoom] Added to bucket:', data.title);
      const item = {
        songId: data.songId,
        title: data.title,
        artist: data.artist,
        image: data.image,
        addedBy: data.addedBy,
        addedAt: data.addedAt,
      };
      PartyState.bucket.push(item);
      document.dispatchEvent(new CustomEvent('party:bucketAdd', { detail: item }));
    });

    socket.on('bucket:remove', (data) => {
      console.log('[PartyRoom] Removed from bucket:', data.songId);
      PartyState.bucket = PartyState.bucket.filter(b => b.songId !== data.songId);
      document.dispatchEvent(new CustomEvent('party:bucketRemove', { detail: data.songId }));
    });

    // ── Error Events ═════════════════════════════════════════════

    socket.on('error', (err) => {
      console.error('[PartyRoom] Socket error:', err.type, err.message);
      document.dispatchEvent(new CustomEvent('party:error', { detail: err }));
    });

    socket.on('connect_error', (error) => {
      console.error('[PartyRoom] Connection error:', error.message);
      document.dispatchEvent(new CustomEvent('party:connectionError', { detail: error }));
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

    // Socket initialization
    init: () => _setupSocket(),

    // ── Room Management ──────────────────────────────────────────

    createRoom: (roomName, maxUsers, roomType, password = null) => {
      if (!socket || !isConnected) {
        console.error('[PartyRoom] Socket not connected');
        document.dispatchEvent(new CustomEvent('party:error', {
          detail: { type: 'NOT_CONNECTED', message: 'Not connected to server' }
        }));
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
        document.dispatchEvent(new CustomEvent('party:error', {
          detail: { type: 'NOT_CONNECTED', message: 'Not connected to server' }
        }));
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

    // ── User Management ──────────────────────────────────────────

    removeUser: (userIdToRemove) => {
      if (!socket || !isConnected) return;
      socket.emit('user:remove', {
        roomId: PartyState.roomId,
        userIdToRemove,
      });
    },

    // ── Playback Controls (DJ only) ──────────────────────────────

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

    // ── Bucket Management (Everyone) ─────────────────────────────

    addToBucket: (track) => {
      if (!socket || !isConnected) return;
      socket.emit('bucket:add', {
        roomId: PartyState.roomId,
        songId: track.id,
        title: track.title,
        artist: track.artist,
        image: track.image || track.thumb,
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
  };
})();

// Load saved party name
const savedPartyName = localStorage.getItem('mu_labz_party_name');
if (savedPartyName) {
  PartyRoom.setPartyName(savedPartyName);
}
