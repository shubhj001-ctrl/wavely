/**
 * party.js — Party Room state and socket management (FIXED v2)
 *
 * Handles all real-time syncing, room management, and party state.
 * Uses Socket.IO for WebSocket communication.
 *
 * FIXES in this version:
 * - Removed duplicate socket.on('error') listener (was registered twice)
 * - Removed duplicate socket.on('connect_error') listener (was registered twice)
 * - Added _pendingRequestQueue to buffer joinRequest:new events that arrive
 *   before the DJ's UI has mounted its event listener (race condition fix)
 * - Added getPendingJoins() to public API so UI can hydrate lobby on mount
 * - Support for 4-digit passcodes
 * - User removal capability
 * - Better public/private room handling
 */

const PartyRoom = (() => {
  let socket = null;
  let currentPartyName = '';
  let isConnected = false;

  // Buffer for join requests that arrive before the UI listener is attached
  let _pendingRequestQueue = [];
  let _uiReady = false; // set to true after party:roomCreated fires

  // Party State
  const PartyState = {
    // Room info
    roomId: null,
    roomName: '',
    roomType: 'public', // 'public' or 'private'
    roomPassword: null, // 4-digit passcode for private rooms
    maxUsers: 10,
    creatorId: null,
    roomCreatorId: null,

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
    pendingJoins: [], // { userId, partyName, requestedAt } - waiting in lobby
  };

  // ── Initialization ───────────────────────────────────────────────

  function _setupSocket() {
    if (socket) return;

    if (typeof io === 'undefined') {
      console.error('[PartyRoom] Socket.IO not loaded! Add to index.html.');
      return;
    }

    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let backendUrl;

    if (isDev) {
      backendUrl = 'http://localhost:3001';
      console.log('[PartyRoom] 🔧 Development mode - using localhost backend');
    } else {
      backendUrl = 'https://mulabz.onrender.com';
      console.log('[PartyRoom] 🌐 Production mode - using Render backend');
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
      mode: 'cors',
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
          detail: { url, error: err.message },
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
      _uiReady = false;
      document.dispatchEvent(new CustomEvent('party:disconnected'));
    });

    socket.on('connect:success', (data) => {
      console.log('[PartyRoom] ✅ Backend connection successful:', data.message);
    });

    // FIX: Only one connect_error listener (duplicate removed from bottom of file)
    socket.on('connect_error', (error) => {
      console.error('[PartyRoom] ⚠️ Connection error:', error?.message || error);
      document.dispatchEvent(new CustomEvent('party:connectionError', { detail: error }));
    });

    // FIX: Only one 'error' listener (duplicate at line ~283 in original removed)
    socket.on('error', (err) => {
      console.error('[PartyRoom] ⚠️ Socket error:', err?.type, err?.message || err);

      if (err.type === 'ROOM_NOT_FOUND' && err.action === 'bucket:add') {
        console.error('[PartyRoom] Room was not found when adding song. Room might have closed.');
        document.dispatchEvent(new CustomEvent('party:bucketAddError', { detail: err }));
      }

      document.dispatchEvent(new CustomEvent('party:error', { detail: err }));
    });

    // ── Room Events ══════════════════════════════════════════════

    socket.on('room:created', (data) => {
      console.log('[PartyRoom] Room created:', data.roomId);
      PartyState.roomId = data.roomId;
      PartyState.roomName = data.roomName;
      PartyState.roomType = data.roomType;
      PartyState.roomPassword = data.roomPassword;
      PartyState.creatorId = data.creatorId;
      PartyState.roomCreatorId = data.creatorId;
      PartyState.userId = data.userId;
      PartyState.role = 'dj';
      PartyState.djs = [{ userId: data.userId, partyName: currentPartyName }];

      _savePartySession(PartyState);

      // Mark UI as ready so future join requests dispatch immediately
      _uiReady = true;

      document.dispatchEvent(new CustomEvent('party:roomCreated', { detail: PartyState }));

      // FIX: Flush any join requests that arrived before the UI was ready
      if (_pendingRequestQueue.length > 0) {
        console.log('[PartyRoom] Flushing', _pendingRequestQueue.length, 'queued join request(s)');
        _pendingRequestQueue.forEach(requestData => {
          document.dispatchEvent(new CustomEvent('party:joinRequest:new', { detail: requestData }));
        });
        _pendingRequestQueue = [];
      }
    });

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

    socket.on('room:closed', (data) => {
      console.log('[PartyRoom] Room closed:', data.reason);
      _uiReady = false;
      document.dispatchEvent(new CustomEvent('party:roomClosed', { detail: data }));
    });

    socket.on('joinRequest:pending', (data) => {
      console.log('[PartyRoom] Join request pending:', data);
      document.dispatchEvent(new CustomEvent('party:joinRequest:pending', { detail: data }));
    });

    socket.on('joinRequest:approved', (data) => {
      console.log('[PartyRoom] Join request approved, entering room:', data.roomId);
      PartyState.roomId = data.roomId;
      PartyState.roomName = data.roomName;
      PartyState.roomType = data.roomType;
      PartyState.creatorId = data.creatorId;
      PartyState.roomCreatorId = data.creatorId;
      PartyState.userId = data.userId;
      PartyState.role = data.role || 'guest';
      PartyState.djs = data.djs || [];
      PartyState.users = data.users || [];
      PartyState.bucket = data.bucket || [];
      PartyState.currentSong = data.currentSong;
      PartyState.isPlaying = data.isPlaying;
      PartyState.currentTime = data.currentTime;

      _savePartySession(PartyState);

      document.dispatchEvent(new CustomEvent('party:joinRequest:approved', { detail: PartyState }));
    });

    socket.on('joinRequest:rejected', (data) => {
      console.log('[PartyRoom] Join request rejected:', data);
      document.dispatchEvent(new CustomEvent('party:joinRequest:rejected', { detail: data }));
    });

    // Full pending list update from server (e.g. on reconnect)
    socket.on('joinRequest:list', (data) => {
      console.log('[PartyRoom] Pending requests updated:', data);
      PartyState.pendingJoins = data.pendingRequests || [];
      document.dispatchEvent(new CustomEvent('party:joinRequest:list', { detail: data }));
    });

    // FIX: New join request — buffer if DJ UI isn't ready yet
    socket.on('joinRequest:new', (data) => {
      console.log('[PartyRoom] New join request from:', data.partyName);

      // Update with full pending requests list from server
      if (data.pendingRequests && Array.isArray(data.pendingRequests)) {
        PartyState.pendingJoins = data.pendingRequests;
      } else {
        // Fallback: manually add if server didn't send list
        if (!PartyState.pendingJoins.find(r => r.userId === data.requestId)) {
          PartyState.pendingJoins.push({
            userId: data.requestId,
            partyName: data.partyName,
            requestedAt: new Date().toISOString(),
          });
        }
      }

      if (!_uiReady) {
        // DJ's lobby listener may not be attached yet — queue for later
        console.log('[PartyRoom] UI not ready yet, queuing join request from:', data.partyName);
        if (!_pendingRequestQueue.find(r => r.userId === data.requestId)) {
          _pendingRequestQueue.push(data);
        }
        return;
      }

      document.dispatchEvent(new CustomEvent('party:joinRequest:new', { detail: data }));
    });

    // ── User Events ══════════════════════════════════════════════

    socket.on('user:joined', (data) => {
      console.log('[PartyRoom] User joined:', data.partyName);
      const user = { userId: data.userId, partyName: data.partyName, role: data.role || 'guest' };
      if (
        !PartyState.users.find(u => u.userId === data.userId) &&
        !PartyState.djs.find(d => d.userId === data.userId)
      ) {
        PartyState.users.push(user);
      }
      // Remove from pendingJoins once they've fully entered
      PartyState.pendingJoins = PartyState.pendingJoins.filter(r => r.userId !== data.userId);
      document.dispatchEvent(new CustomEvent('party:userJoined', { detail: user }));
    });

    socket.on('user:left', (data) => {
      console.log('[PartyRoom] User left:', data.userId);
      PartyState.users = PartyState.users.filter(u => u.userId !== data.userId);
      PartyState.djs = PartyState.djs.filter(u => u.userId !== data.userId);
      document.dispatchEvent(new CustomEvent('party:userLeft', { detail: data }));
    });

    socket.on('user:removed', (data) => {
      console.log('[PartyRoom] User removed:', data.userId || 'you');
      if (data.userId === PartyState.userId) {
        PartyRoom.clearSession();
        document.dispatchEvent(new CustomEvent('party:userRemovedSelf', { detail: data }));
      } else {
        PartyState.users = PartyState.users.filter(u => u.userId !== data.userId);
        PartyState.djs = PartyState.djs.filter(d => d.userId !== data.userId);
      }
      document.dispatchEvent(new CustomEvent('party:userRemoved', { detail: data }));
    });

    socket.on('user:promoted', (data) => {
      console.log('[PartyRoom] User promoted to DJ:', data.partyName);
      const user = PartyState.users.find(u => u.userId === data.userId);
      if (user) {
        PartyState.users = PartyState.users.filter(u => u.userId !== data.userId);
        PartyState.djs.push({ userId: data.userId, partyName: data.partyName });
        document.dispatchEvent(new CustomEvent('party:userPromoted', { detail: data }));
      }
    });

    // ── Playback Events ══════════════════════════════════════════

    socket.on('playback:play', (data) => {
      console.log('[PartyRoom] playback:play received:', data);
      PartyState.isPlaying = true;
      PartyState.currentSong = data.currentSong;
      PartyState.currentTime = data.currentTime || 0;
      PartyState.playStartTime = data.playStartTime;

      if (data.currentSong) {
        PartyState.bucket = PartyState.bucket.filter(
          b => b.songId !== data.currentSong.id && b.id !== data.currentSong.id
        );
      }

      if (data.playStartTime && data.serverTime) {
        const elapsedTime = Date.now() - data.playStartTime;
        PartyState.currentTime = (data.currentTime || 0) + elapsedTime / 1000;
        console.log('[PartyRoom] Sync elapsed:', elapsedTime, 'ms → currentTime:', PartyState.currentTime);
      }

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
      PartyState.isPlaying = !!data.currentSong;
      if (data.currentSong) {
        PartyState.bucket = PartyState.bucket.filter(b => b.songId !== data.currentSong.id);
      }
      
      // Handle auto-play when bucket is empty
      if (data.bucketEmpty && !data.currentSong && typeof API !== 'undefined') {
        console.log('[PartyRoom] Bucket is empty, triggering auto-play...');
        _triggerAutoPlay();
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
        id: data.songId,
        title: data.title,
        artist: data.artist,
        image: data.image,
        addedBy: data.addedBy,
        addedAt: data.addedAt,
        source: data.source || 'jiosaavn',
        audio: data.audio,
        duration: data.duration || 0,
        genre: data.genre,
      };
      PartyState.bucket.push(item);
      document.dispatchEvent(new CustomEvent('party:bucketAdd', { detail: item }));
    });

    socket.on('bucket:remove', (data) => {
      console.log('[PartyRoom] Removed from bucket:', data.songId);
      PartyState.bucket = PartyState.bucket.filter(b => b.songId !== data.songId);
      document.dispatchEvent(new CustomEvent('party:bucketRemove', { detail: data.songId }));
    });
  }

  // ── Session Persistence ──────────────────────────────────────────

  function _savePartySession(state) {
    const sessionData = {
      roomId: state.roomId,
      roomName: state.roomName,
      roomType: state.roomType,
      roomPassword: state.roomPassword,
      roomCreatorId: state.roomCreatorId,
      userId: state.userId,
      role: state.role,
      partyName: currentPartyName,
      timestamp: Date.now(),
    };
    localStorage.setItem('party_session', JSON.stringify(sessionData));
    console.log('[PartyRoom] Session saved:', state.roomId);
  }

  function _loadPartySession() {
    const sessionData = localStorage.getItem('party_session');
    if (!sessionData) return null;
    try {
      const session = JSON.parse(sessionData);
      if (Date.now() - session.timestamp < 3600000) {
        console.log('[PartyRoom] Session recovered:', session.roomId);
        return session;
      } else {
        localStorage.removeItem('party_session');
        return null;
      }
    } catch (err) {
      console.error('[PartyRoom] Error loading session:', err);
      localStorage.removeItem('party_session');
      return null;
    }
  }

  // ── Auto-Play Function ───────────────────────────────────────────

  async function _triggerAutoPlay() {
    if (!PartyState.roomId || typeof API === 'undefined') {
      console.warn('[PartyRoom] Cannot auto-play: missing roomId or API');
      return;
    }

    // Only DJs can trigger auto-play
    const isDJ = PartyState.djs && PartyState.djs.some(dj => dj.userId === PartyState.userId);
    if (!isDJ) {
      console.log('[PartyRoom] Not a DJ, skipping auto-play');
      return;
    }

    try {
      console.log('[PartyRoom] Fetching random song for auto-play...');
      
      // Try trending songs first, then fall back to genre
      let randomSong = null;
      
      try {
        const trendingSongs = await API.trending(5);
        if (trendingSongs && trendingSongs.length > 0) {
          randomSong = trendingSongs[Math.floor(Math.random() * trendingSongs.length)];
          console.log('[PartyRoom] Selected trending song:', randomSong.title);
        }
      } catch (err) {
        console.warn('[PartyRoom] Trending API failed, trying genre search:', err);
        
        // Fall back to genre search
        const genres = ['bollywood', 'punjabi', 'pop', 'hiphop', 'lofi'];
        const randomGenre = genres[Math.floor(Math.random() * genres.length)];
        const genreSongs = await API.byGenre(randomGenre, 5);
        if (genreSongs && genreSongs.length > 0) {
          randomSong = genreSongs[Math.floor(Math.random() * genreSongs.length)];
          console.log('[PartyRoom] Selected song from genre', randomGenre, ':', randomSong.title);
        }
      }

      if (!randomSong) {
        console.warn('[PartyRoom] Could not find random song for auto-play');
        return;
      }

      // Emit playback:play event with the random song (DJ only)
      if (socket && isConnected && isDJ) {
        socket.emit('playback:play', {
          roomId: PartyState.roomId,
          currentSong: {
            id: randomSong.id,
            title: randomSong.title,
            artist: randomSong.artist,
            image: randomSong.image,
            audio: randomSong.audio,
            duration: randomSong.duration,
            source: randomSong.source,
            genre: randomSong.genre,
          },
          currentTime: 0,
        });
        console.log('[PartyRoom] ✓ Auto-play song emitted to server:', randomSong.title);
      }
    } catch (err) {
      console.error('[PartyRoom] Error in auto-play:', err);
    }
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    // Getters
    getState: () => PartyState,
    isConnected: () => isConnected,
    getPartyName: () => currentPartyName,

    // FIX: Expose pendingJoins so the DJ's UI can hydrate the lobby on mount
    getPendingJoins: () => PartyState.pendingJoins,

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
          detail: { type: 'NOT_CONNECTED', message: 'Not connected to server' },
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
          detail: { type: 'NOT_CONNECTED', message: 'Not connected to server' },
        }));
        return;
      }
      socket.emit('room:join', {
        roomId,
        password,
        partyName: currentPartyName,
      });
    },

    joinRoomRequest: (roomId, password = null) => {
      if (!socket || !isConnected) {
        console.error('[PartyRoom] Socket not connected');
        document.dispatchEvent(new CustomEvent('party:error', {
          detail: { type: 'NOT_CONNECTED', message: 'Not connected to server' },
        }));
        return;
      }
      socket.emit('room:joinRequest', {
        roomId,
        password,
        partyName: currentPartyName,
      });
    },

    approveJoinRequest: (roomId, requestUserId) => {
      if (!socket || !isConnected) return;
      PartyState.pendingJoins = PartyState.pendingJoins.filter(r => r.userId !== requestUserId);
      socket.emit('joinRequest:approve', { roomId, requestUserId });
    },

    rejectJoinRequest: (roomId, requestUserId) => {
      if (!socket || !isConnected) return;
      PartyState.pendingJoins = PartyState.pendingJoins.filter(r => r.userId !== requestUserId);
      socket.emit('joinRequest:reject', { roomId, requestUserId });
    },

    leaveRoom: () => {
      if (!socket || !isConnected) return;
      socket.emit('room:leave', { roomId: PartyState.roomId });
      localStorage.removeItem('mu_labz_party_roomId');
      localStorage.removeItem('mu_labz_party_state');
      PartyState.roomId = null;
      PartyState.users = [];
      PartyState.djs = [];
      PartyState.bucket = [];
      PartyState.pendingJoins = [];
      _pendingRequestQueue = [];
      _uiReady = false;
    },

    // Session persistence
    saveSession: () => {
      if (PartyState.roomId) {
        localStorage.setItem('mu_labz_party_roomId', PartyState.roomId);
        localStorage.setItem('mu_labz_party_state', JSON.stringify({
          roomId: PartyState.roomId,
          roomName: PartyState.roomName,
          roomType: PartyState.roomType,
          userId: PartyState.userId,
          role: PartyState.role,
          partyName: currentPartyName,
        }));
      }
    },

    getSessionRoom: () => localStorage.getItem('mu_labz_party_roomId'),

    getSessionState: () => {
      const state = localStorage.getItem('mu_labz_party_state');
      return state ? JSON.parse(state) : null;
    },

    clearSession: () => {
      localStorage.removeItem('mu_labz_party_roomId');
      localStorage.removeItem('mu_labz_party_state');
      localStorage.removeItem('party_session');
    },

    // ── User Management ──────────────────────────────────────────

    removeUser: (userIdToRemove) => {
      if (!socket || !isConnected) return;
      socket.emit('user:remove', {
        roomId: PartyState.roomId,
        userIdToRemove,
      });
    },

    promoteUser: (userIdToPromote) => {
      if (!socket || !isConnected) return;
      if (PartyState.role !== 'dj') {
        console.warn('[PartyRoom] Only DJ can promote users');
        return;
      }
      socket.emit('user:promote', {
        roomId: PartyState.roomId,
        userIdToPromote,
      });
    },

    // ── Playback Controls (DJ only) ──────────────────────────────

    playFromQueue: (songId) => {
      if (!socket || !isConnected) return;
      if (PartyState.role !== 'dj') {
        console.warn('[PartyRoom] Only DJ can play songs');
        return;
      }
      const track = PartyState.bucket.find(b => b.songId === songId);
      console.log('[PartyRoom] playFromQueue - Found track:', track);
      if (track) {
        const playbackData = {
          roomId: PartyState.roomId,
          currentSong: {
            id: track.songId || track.id,
            title: track.title,
            artist: track.artist,
            image: track.image,
            source: track.source || 'jiosaavn',
            audio: track.audio,
            duration: track.duration,
            genre: track.genre,
          },
          currentTime: 0,
        };
        console.log('[PartyRoom] Emitting playback:play with:', playbackData);
        socket.emit('playback:play', playbackData);
      } else {
        console.warn('[PartyRoom] Track not found in bucket:', songId);
      }
    },

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

    pause: () => {
      if (!socket || !isConnected) return;
      socket.emit('playback:pause', {
        roomId: PartyState.roomId,
        currentTime: PartyState.currentTime,
      });
    },

    resume: () => {
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
      socket.emit('playback:next', { roomId: PartyState.roomId });
    },

    next: () => {
      if (!socket || !isConnected) return;
      socket.emit('playback:next', { roomId: PartyState.roomId });
    },

    // ── Bucket Management (Everyone) ─────────────────────────────

    addToBucket: (track) => {
      if (!socket) {
        console.error('[PartyRoom] Socket not initialized');
        return;
      }
      if (!isConnected) {
        console.error('[PartyRoom] Not connected to socket. Current state:', { isConnected, socketReady: socket?.connected });
        return;
      }
      if (!PartyState.roomId) {
        console.error('[PartyRoom] Not in a room yet. Current state:', PartyState.roomId);
        return;
      }
      console.log('[PartyRoom] Adding to bucket:', {
        track: track.title,
        roomId: PartyState.roomId,
        socketConnected: socket.connected,
        socketId: socket.id,
      });
      socket.emit('bucket:add', {
        roomId: PartyState.roomId,
        songId: track.id,
        title: track.title,
        artist: track.artist,
        image: track.image || track.thumb,
        addedBy: currentPartyName,
        source: track.source || 'jiosaavn',
        audio: track.audio,
        duration: track.duration || 0,
        genre: track.genre,
      });
    },

    removeFromBucket: (songId) => {
      if (!socket || !isConnected) return;
      socket.emit('bucket:remove', {
        roomId: PartyState.roomId,
        songId,
      });
    },

    // ── Session Management ───────────────────────────────────────

    getSession: () => _loadPartySession(),

    recoveryJoin: (session) => {
      if (!socket || !isConnected) return;
      console.log('[PartyRoom] Attempting to recover session for room:', session.roomId);
      socket.emit('room:joinRequest', {
        roomId: session.roomId,
        password: session.roomPassword || null,
        partyName: currentPartyName,
      });
    },
  };
})();

// Auto-save session on important events
document.addEventListener('party:roomCreated', () => setTimeout(() => PartyRoom.saveSession(), 100));
document.addEventListener('party:roomJoined',  () => setTimeout(() => PartyRoom.saveSession(), 100));
document.addEventListener('party:play',        () => PartyRoom.saveSession());
document.addEventListener('party:next',        () => PartyRoom.saveSession());
document.addEventListener('party:bucketAdd',   () => PartyRoom.saveSession());
document.addEventListener('party:bucketRemove',() => PartyRoom.saveSession());
document.addEventListener('party:userJoined',  () => PartyRoom.saveSession());
document.addEventListener('party:userLeft',    () => PartyRoom.saveSession());

// Load saved party name
const savedPartyName = localStorage.getItem('mu_labz_party_name');
if (savedPartyName) {
  PartyRoom.setPartyName(savedPartyName);
}