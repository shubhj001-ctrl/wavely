/**
 * Pages/party.js — Party Room page renderer (REDESIGNED - NO CHAT, 3 SECTIONS)
 * 
 * Layout:
 * - Header: Room name, URL, user count, leave button
 * - Search section: Live search with thumbnails (left sidebar)
 * - Bucket section: Song queue (left sidebar under search)
 * - Users section: User list with removal buttons for DJ (right sidebar)
 * - Mini player: Center (same as before)
 */

const PartyPage = (() => {
  let currentRoom = null;
  let listeners = {};

  function render(container, params = {}) {
    container.innerHTML = '';

    Object.values(listeners).forEach(listener => {
      document.removeEventListener(listener.event, listener.handler);
    });
    listeners = {};

    // Hide mini player when in party room
    const playerBar = document.getElementById('player-bar');
    if (playerBar) {
      playerBar.style.display = 'none';
    }

    if (params.roomId) {
      _showPartyInterface(container, params.roomId);
    } else if (PartyRoom && PartyRoom.getState && PartyRoom.getState().roomId) {
      _showPartyInterface(container, PartyRoom.getState().roomId);
    } else {
      // Check for saved session and attempt auto-rejoin
      _attemptSessionRecovery(container);
    }
  }

  function _attemptSessionRecovery(container) {
    if (!PartyRoom || !PartyRoom.getSessionRoom) {
      _showPartyEntry(container);
      return;
    }

    const savedRoomId = PartyRoom.getSessionRoom();
    if (!savedRoomId) {
      _showPartyEntry(container);
      return;
    }

    // Show loading state while attempting recovery
    container.innerHTML = `
      <div class="party-loading-container">
        <div class="spinner"></div>
        <p>Reconnecting to room...</p>
      </div>
    `;

    // Initialize and rejoin the saved room
    PartyRoom.init();
    let connectionAttempts = 0;

    const checkConnection = setInterval(() => {
      connectionAttempts++;
      
      if (PartyRoom.isConnected()) {
        clearInterval(checkConnection);
        console.log('[PartyPage] Connection established, rejoining saved room:', savedRoomId);
        PartyRoom.joinRoom(savedRoomId, null);
        
        // Wait for room join completion
        let joinAttempts = 0;
        const checkJoin = setInterval(() => {
          joinAttempts++;
          const state = PartyRoom.getState();
          
          if (state.roomId === savedRoomId && state.userId) {
            clearInterval(checkJoin);
            _showPartyInterface(container, savedRoomId);
          } else if (joinAttempts > 100) { // 10 second timeout
            clearInterval(checkJoin);
            console.error('[PartyPage] Failed to rejoin room');
            _showPartyEntry(container);
            PartyRoom.clearSession();
          }
        }, 100);
      } else if (connectionAttempts > 50) { // 5 second timeout
        clearInterval(checkConnection);
        console.error('[PartyPage] Failed to reconnect');
        _showPartyEntry(container);
        PartyRoom.clearSession();
      }
    }, 100);
  }

  function _showPartyEntry(container) {
    container.innerHTML = `
      <div class="party-entry-container">
        <div class="party-entry-header">
          <h1>🎉 Party Room</h1>
          <p>Listen together, create together</p>
        </div>

        <div class="party-entry-options">
          <button class="party-entry-btn create-room-btn">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="1"/>
              <path d="M12 8v8M8 12h8"/>
              <circle cx="12" cy="12" r="9"/>
            </svg>
            Create Room
          </button>

          <button class="party-entry-btn join-room-btn">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Join Room
          </button>
        </div>
      </div>
    `;

    container.querySelector('.create-room-btn')?.addEventListener('click', () => _showCreateRoomModal(container));
    container.querySelector('.join-room-btn')?.addEventListener('click', () => _showJoinRoomModal(container));
  }

  function _showCreateRoomModal(container) {
    const modal = document.createElement('div');
    modal.className = 'party-modal-overlay';
    modal.innerHTML = `
      <div class="party-modal">
        <h2>Create Party Room</h2>
        <div class="form-group">
          <label>Your Name</label>
          <input type="text" id="party-name-input" placeholder="What should we call you?" maxlength="50">
        </div>
        <div class="form-group">
          <label>Room Name</label>
          <input type="text" id="room-name-input" placeholder="e.g., Chill Vibes" maxlength="100">
        </div>
        <div class="form-group">
          <label>Max Users</label>
          <input type="number" id="max-users-input" min="2" max="100" value="10">
        </div>
        <div class="form-group">
          <label>Room Type</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="room-type" value="public" checked>
              <span>Public</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="room-type" value="private">
              <span>Private (4-digit passcode)</span>
            </label>
          </div>
        </div>
        <div class="form-group" id="password-group" style="display: none;">
          <label>Passcode (4 digits, leave empty for auto-generated)</label>
          <input type="text" id="password-input" placeholder="Leave empty - will auto-generate" maxlength="4" pattern="[0-9]*" inputmode="numeric">
        </div>
        <div class="modal-actions">
          <button class="btn-secondary cancel-btn">Cancel</button>
          <button class="btn-primary create-btn">Create</button>
        </div>
      </div>
    `;

    container.appendChild(modal);

    const roomTypeInputs = modal.querySelectorAll('input[name="room-type"]');
    const passwordGroup = modal.querySelector('#password-group');
    roomTypeInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        passwordGroup.style.display = e.target.value === 'private' ? 'block' : 'none';
      });
    });

    modal.querySelector('.cancel-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.create-btn')?.addEventListener('click', () => {
      const partyName = modal.querySelector('#party-name-input').value.trim();
      const roomName = modal.querySelector('#room-name-input').value.trim();
      const maxUsers = parseInt(modal.querySelector('#max-users-input').value) || 10;
      const roomType = modal.querySelector('input[name="room-type"]:checked').value;
      const password = roomType === 'private' ? modal.querySelector('#password-input').value : null;

      if (!partyName || !roomName) {
        showToast('Fill all fields');
        return;
      }

      PartyRoom.setPartyName(partyName);
      
      // Show loading toast
      showToast('Connecting to server...');
      
      // Initialize socket connection
      PartyRoom.init();

      // Wait for connection to be established
      let connectionAttempts = 0;
      const checkConnection = setInterval(() => {
        connectionAttempts++;
        
        if (PartyRoom.isConnected()) {
          clearInterval(checkConnection);
          showToast('Creating room...');
          PartyRoom.createRoom(roomName, maxUsers, roomType, password);
        } else if (connectionAttempts > 50) { // 5 seconds timeout
          clearInterval(checkConnection);
          showToast('❌ Failed to connect to server. Check your connection.');
          console.error('[PartyPage] Connection timeout after 5 seconds');
        }
      }, 100);

      const handler = () => {
        clearInterval(checkConnection);
        document.removeEventListener('party:roomCreated', handler);
        document.removeEventListener('party:error', errorHandler);
        showToast('✅ Room created! Entering...');
        Router.navigate('party', { roomId: PartyRoom.getState().roomId });
        modal.remove();
      };
      document.addEventListener('party:roomCreated', handler);

      const errorHandler = (e) => {
        clearInterval(checkConnection);
        const msg = e.detail?.message || 'Failed to create room';
        console.error('[PartyPage] Room creation error:', e.detail);
        showToast('❌ Error: ' + msg);
      };

      const backendOfflineHandler = (e) => {
        clearInterval(checkConnection);
        console.error('[PartyPage] Backend offline:', e.detail);
        showToast('❌ Backend server is offline. Please try again later or contact support.');
      };

      document.addEventListener('party:error', errorHandler);
      document.addEventListener('party:connectionError', errorHandler);
      document.addEventListener('party:backendOffline', backendOfflineHandler);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function _showJoinRoomModal(container) {
    const modal = document.createElement('div');
    modal.className = 'party-modal-overlay';
    modal.innerHTML = `
      <div class="party-modal">
        <h2>Join Party Room</h2>
        <div class="form-group">
          <label>Your Name</label>
          <input type="text" id="party-name-input" placeholder="What should we call you?" maxlength="50">
        </div>
        <div class="form-group">
          <label>Room Code or URL</label>
          <input type="text" id="room-id-input" placeholder="Enter room code or paste URL" maxlength="200">
        </div>
        <div class="form-group" id="password-group" style="display: none;">
          <label>4-Digit Passcode</label>
          <input type="text" id="password-input" placeholder="1234" maxlength="4" pattern="[0-9]*" inputmode="numeric">
        </div>
        <div class="modal-actions">
          <button class="btn-secondary cancel-btn">Cancel</button>
          <button class="btn-primary join-btn">Join</button>
        </div>
      </div>
    `;

    container.appendChild(modal);
    modal.querySelector('.cancel-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.join-btn')?.addEventListener('click', () => {
      const partyName = modal.querySelector('#party-name-input').value.trim();
      let roomId = modal.querySelector('#room-id-input').value.trim();

      if (!partyName || !roomId) {
        showToast('Fill all fields');
        return;
      }

      // Extract room ID if URL is provided
      if (roomId.includes('#party/')) {
        roomId = roomId.split('#party/')[1].split('?')[0];
      }

      const password = modal.querySelector('#password-input').value || null;
      PartyRoom.setPartyName(partyName);
      
      showToast('Connecting to server...');
      PartyRoom.init();
      
      // Wait for connection to be established
      let connectionAttempts = 0;
      const checkConnection = setInterval(() => {
        connectionAttempts++;
        
        if (PartyRoom.isConnected()) {
          clearInterval(checkConnection);
          showToast('Joining room...');
          PartyRoom.joinRoom(roomId, password);
        } else if (connectionAttempts > 50) { // 5 seconds timeout
          clearInterval(checkConnection);
          showToast('❌ Failed to connect to server. Check your connection.');
          console.error('[PartyPage] Connection timeout after 5 seconds');
        }
      }, 100);

      const handler = () => {
        clearInterval(checkConnection);
        document.removeEventListener('party:roomJoined', handler);
        document.removeEventListener('party:connectionError', errorHandler);
        document.removeEventListener('party:error', errorHandler);
        showToast('✅ Joined room! Entering...');
        Router.navigate('party', { roomId: roomId });
        modal.remove();
      };

      const errorHandler = (e) => {
        clearInterval(checkConnection);
        if (e.detail && (e.detail.type === 'ROOM_NOT_FOUND' || e.detail.type === 'INVALID_PASSWORD' || e.detail.type === 'ROOM_FULL')) {
          const msg = e.detail.type === 'INVALID_PASSWORD' ? '❌ Wrong passcode' : '❌ ' + (e.detail.message || 'Failed to join room');
          showToast(msg);
          console.error('[PartyPage] Join error:', e.detail);
          
          // Show password group if invalid password
          if (e.detail.type === 'INVALID_PASSWORD') {
            modal.querySelector('#password-group').style.display = 'block';
          }
        }
      };

      const backendOfflineHandler = (e) => {
        clearInterval(checkConnection);
        console.error('[PartyPage] Backend offline:', e.detail);
        showToast('❌ Backend server is offline. Please try again later or contact support.');
      };

      document.addEventListener('party:roomJoined', handler);
      document.addEventListener('party:connectionError', errorHandler);
      document.addEventListener('party:error', errorHandler);
      document.addEventListener('party:backendOffline', backendOfflineHandler);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function _showPartyInterface(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';
    const totalUsers = state.users.length + state.djs.length;

    // Generate shareable URL
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}#party/${roomId}`;

    container.innerHTML = `
      <div class="party-room-container">
        <!-- Header -->
        <div class="party-header">
          <div class="party-header-info">
            <h1>${escapeHtml(state.roomName)}</h1>
            <p style="margin: 0.25rem 0 0;">
              <span class="header-role">${isDJ ? '👑 DJ' : '🎧 Guest'}</span>
              <span class="header-users">👥 ${totalUsers}</span>
            </p>
          </div>
          
          <div class="party-header-url">
            <label>Room URL:</label>
            <div class="url-box">
              <input type="text" readonly value="${shareUrl}" class="url-input">
              <button class="btn-copy" onclick="navigator.clipboard.writeText('${shareUrl}'); showToast('URL copied!')">Copy</button>
            </div>
            ${state.roomType === 'private' ? `<small>Passcode: <strong>${state.roomPassword}</strong></small>` : '<small>Public room</small>'}
          </div>

          <button class="btn-secondary leave-btn">Leave Room</button>
        </div>

        <!-- Main Content -->
        <div class="party-content">
          <!-- Left Sidebar: Search & Bucket -->
          <div class="party-left-sidebar">
            <!-- Search Section -->
            <div class="party-section">
              <h3>🔍 Find Songs</h3>
              <div class="search-box">
                <input type="text" id="party-search-input" placeholder="Search songs..." maxlength="100">
              </div>
              <div id="party-search-results" class="search-results" style="display: none;"></div>
            </div>

            <!-- Bucket Section -->
            <div class="party-section">
              <h3>🎵 Queue (${state.bucket.length})</h3>
              <div id="party-bucket-list" class="bucket-list">
                ${state.bucket.length === 0 ? '<p class="empty-msg">No songs in queue</p>' : ''}
              </div>
            </div>
          </div>

          <!-- Center: Mini Player -->
          <div class="party-center">
            <div class="party-player">
              ${state.currentSong ? `
                <div class="now-playing">
                  <div class="np-cover">
                    <img src="${state.currentSong.image || 'assets/placeholder.png'}" alt="Cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23666%22 font-size=%2246%22%3E🎵%3C/text%3E%3C/svg%3E'">
                  </div>
                  <div class="np-info">
                    <h2>${escapeHtml(state.currentSong.title)}</h2>
                    <p>${escapeHtml(state.currentSong.artist)}</p>
                  </div>
                </div>
              ` : `
                <div class="np-empty">
                  <p>♪ No song playing</p>
                  <p style="font-size: 0.85rem; color: #999;">Add songs to queue to get started</p>
                </div>
              `}

              ${isDJ ? `
                <div class="dj-controls">
                  <button id="party-play-btn" class="btn-dj-control" title="Play/Pause">
                    ${state.isPlaying ? '⏸' : '▶'}
                  </button>
                  <button id="party-next-btn" class="btn-dj-control" title="Skip to next">⏭</button>
                </div>
              ` : `
                <div class="guest-info">
                  <p>🎧 Only the DJ can control playback</p>
                </div>
              `}

              <div class="progress-bar">
                <div class="progress-fill"></div>
                <div class="progress-time"><span>0:00</span> / <span>0:00</span></div>
              </div>
            </div>
          </div>

          <!-- Right Sidebar: Users -->
          <div class="party-right-sidebar">
            <div class="party-section">
              <h3>👥 Users in Room</h3>
              <div id="party-users-list" class="users-list">
                ${_generateUsersList(state, isDJ)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    _attachPartyEventListeners(container, roomId);
    _updateUIState(container);
  }

  function _generateUsersList(state, isDJ) {
    let html = '';

    // DJs
    if (state.djs && state.djs.length > 0) {
      state.djs.forEach(user => {
        html += `
          <div class="user-item user-item-dj">
            <div class="user-info">
              <span class="user-role">👑</span>
              <span class="user-name">${escapeHtml(user.partyName)}</span>
            </div>
          </div>
        `;
      });
    }

    // Guests
    if (state.users && state.users.length > 0) {
      state.users.forEach(user => {
        html += `
          <div class="user-item user-item-guest">
            <div class="user-info">
              <span class="user-name">${escapeHtml(user.partyName)}</span>
            </div>
            ${isDJ ? `
              <button class="btn-remove-user" data-user-id="${user.userId}" title="Remove user">✕</button>
            ` : ''}
          </div>
        `;
      });
    }

    return html || '<p class="empty-msg">No users yet</p>';
  }

  function _attachPartyEventListeners(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';

    // Leave button
    container.querySelector('.leave-btn')?.addEventListener('click', () => {
      if (confirm('Leave room?')) {
        PartyRoom.leaveRoom();
        Router.navigate('home');
      }
    });

    // DJ Controls
    if (isDJ) {
      container.querySelector('#party-play-btn')?.addEventListener('click', () => {
        if (state.isPlaying) PartyRoom.pausePlayback();
        else if (state.currentSong) PartyRoom.resumePlayback();
        else if (state.bucket.length > 0) {
          PartyRoom.skipToNext();
        } else {
          showToast('Add songs to queue first');
        }
      });

      container.querySelector('#party-next-btn')?.addEventListener('click', () => {
        PartyRoom.skipToNext();
      });

      // User removal buttons
      container.querySelectorAll('.btn-remove-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const userId = e.target.dataset.userId;
          const user = state.users.find(u => u.userId === userId);
          if (user && confirm(`Remove ${user.partyName} from room?`)) {
            PartyRoom.removeUser(userId);
            showToast(`Removed ${user.partyName}`);
          }
        });
      });
    }

    // Search functionality
    let searchTimer;
    const searchInput = container.querySelector('#party-search-input');
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const query = e.target.value.trim();
      
      if (!query) {
        container.querySelector('#party-search-results').style.display = 'none';
        return;
      }

      searchTimer = setTimeout(() => _performSearch(container, query), 300);
    });

    // Event listeners for real-time updates
    const updateHandler = () => _updateUIState(container);
    const usersUpdateHandler = () => _updateUsersUI(container);
    
    // Handler to actually play songs in Player module
    const playHandler = (event) => {
      _updateUIState(container);
      const song = event.detail?.currentSong;
      console.log('[PartyPage] playHandler called', { 
        title: song?.title,
        hasPlayer: !!window.Player, 
        hasPlayMethod: typeof window.Player?.play,
        source: song?.source,
        hasAudio: !!song?.audio,
      });
      
      if (!song) {
        console.warn('[PartyPage] No song in event detail');
        return;
      }
      
      if (!window.Player) {
        console.error('[PartyPage] ❌ Player module not loaded yet. Retrying...');
        // Retry after a short delay
        setTimeout(() => {
          if (window.Player && typeof window.Player.play === 'function') {
            console.log('[PartyPage] ✓ Player now available, playing:', song.title);
            Player.play(song, [song], 0);
          } else {
            console.error('[PartyPage] Player still not available after retry');
          }
        }, 500);
        return;
      }
      
      if (typeof window.Player.play !== 'function') {
        console.error('[PartyPage] Player.play is not a function:', typeof window.Player.play);
        return;
      }
      
      try {
        console.log('[PartyPage] ▶ Calling Player.play() for:', song.title, {
          source: song.source,
          duration: song.duration,
          hasAudio: !!song.audio,
        });
        window.Player.play(song, [song], 0);
        console.log('[PartyPage] ✓ Player.play() executed successfully');
      } catch (error) {
        console.error('[PartyPage] Error calling Player.play():', error);
      }
    };

    const nextHandler = (event) => {
      _updateUIState(container);
      const song = event.detail?.currentSong;
      console.log('[PartyPage] nextHandler called', { 
        title: song?.title,
        hasPlayer: !!window.Player 
      });
      
      if (!song) {
        console.warn('[PartyPage] No song in next event detail');
        return;
      }
      
      if (!window.Player || typeof window.Player.play !== 'function') {
        console.warn('[PartyPage] Player not available for next');
        return;
      }
      
      try {
        console.log('[PartyPage] ⏭ Calling Player.play() for next:', song.title);
        window.Player.play(song, [song], 0);
      } catch (error) {
        console.error('[PartyPage] Error calling Player.play() for next:', error);
      }
    };

    // Handler for when current user is removed from party
    const userRemovedSelfHandler = (event) => {
      console.log('[PartyPage] User was removed from party');
      showToast('❌ You have been removed from the party room');
      
      // Redirect to home after 2 seconds
      setTimeout(() => {
        if (window.Router) {
          Router.navigate('home', {});
        } else {
          window.location.hash = '#home';
        }
      }, 2000);
    };

    // Handler for bucket add errors
    const bucketAddErrorHandler = (event) => {
      console.error('[PartyPage] Bucket add error:', event.detail);
      showToast('❌ Failed to add song - room may have closed');
    };

    document.addEventListener('party:bucketAdd', updateHandler);
    document.addEventListener('party:bucketRemove', updateHandler);
    document.addEventListener('party:play', playHandler);
    document.addEventListener('party:pause', updateHandler);
    document.addEventListener('party:next', nextHandler);
    document.addEventListener('party:userJoined', usersUpdateHandler);
    document.addEventListener('party:userLeft', usersUpdateHandler);
    document.addEventListener('party:userRemoved', usersUpdateHandler);
    document.addEventListener('party:userRemovedSelf', userRemovedSelfHandler);
    document.addEventListener('party:bucketAddError', bucketAddErrorHandler);

    listeners.bucketAdd = { event: 'party:bucketAdd', handler: updateHandler };
    listeners.bucketRemove = { event: 'party:bucketRemove', handler: updateHandler };
    listeners.play = { event: 'party:play', handler: playHandler };
    listeners.pause = { event: 'party:pause', handler: updateHandler };
    listeners.next = { event: 'party:next', handler: nextHandler };
    listeners.userJoined = { event: 'party:userJoined', handler: usersUpdateHandler };
    listeners.userLeft = { event: 'party:userLeft', handler: usersUpdateHandler };
    listeners.userRemoved = { event: 'party:userRemoved', handler: usersUpdateHandler };
    listeners.userRemovedSelf = { event: 'party:userRemovedSelf', handler: userRemovedSelfHandler };
    listeners.bucketAddError = { event: 'party:bucketAddError', handler: bucketAddErrorHandler };
  }

  async function _performSearch(container, query) {
    const resultsDiv = container.querySelector('#party-search-results');
    resultsDiv.innerHTML = '<div class="skeleton-loading">Searching...</div>';
    resultsDiv.style.display = 'block';

    try {
      const tracks = await API.search(query, 15);
      
      if (!tracks || tracks.length === 0) {
        resultsDiv.innerHTML = '<div class="empty-msg">No results found</div>';
        return;
      }

      // Store tracks in a map to avoid JSON stringify issues
      const trackMap = new Map();
      tracks.forEach((track, idx) => {
        trackMap.set(idx, track);
      });

      resultsDiv.innerHTML = tracks.map((track, idx) => `
        <div class="search-result-item">
          <img src="${track.thumb || track.image || 'assets/placeholder.png'}" alt="${escapeHtml(track.title)}" class="result-thumb" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 50 50%22%3E%3Crect fill=%22%23333%22 width=%2250%22 height=%2250%22/%3E%3Ctext x=%2725%22 y=%2725%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23666%22 font-size=%2224%22%3E♪%3C/text%3E%3C/svg%3E'">
          <div class="result-info">
            <p class="result-title">${escapeHtml(track.title)}</p>
            <p class="result-artist">${escapeHtml(track.artist)}</p>
          </div>
          <button class="btn-add result-add-btn" data-track-idx="${idx}" title="Add to queue">+</button>
        </div>
      `).join('');

      // Attach event listeners using map reference
      resultsDiv.querySelectorAll('.result-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.trackIdx);
          const track = trackMap.get(idx);
          
          if (!track) {
            console.warn('[PartyPage] Track not found in map');
            return;
          }

          const state = PartyRoom.getState();
          if (!state.roomId) {
            showToast('❌ Not connected to room. Please wait...');
            console.error('[PartyPage] No room connected when trying to add song');
            return;
          }

          console.log('[PartyPage] Adding track to bucket:', track.title);
          PartyRoom.addToBucket(track);
          showToast(`✅ Added "${escapeHtml(track.title)}" to queue`);
          
          // Reset search input and hide results
          const searchInput = container.querySelector('#party-search-input');
          if (searchInput) {
            searchInput.value = '';
          }
          resultsDiv.style.display = 'none';
          resultsDiv.innerHTML = '';
        });
      });
    } catch (err) {
      console.error('[PartyPage] Search error:', err);
      resultsDiv.innerHTML = '<div class="empty-msg">Search error</div>';
    }
  }

  function _updateBucketUI(container) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';
    const bucketList = container.querySelector('#party-bucket-list');

    bucketList.innerHTML = state.bucket.length === 0 
      ? '<p class="empty-msg">No songs in queue</p>'
      : state.bucket.map((item, idx) => `
          <div class="bucket-item" data-song-id="${item.songId}" draggable="${isDJ ? 'true' : 'false'}" style="cursor: ${isDJ ? 'pointer' : 'default'};">
            <div class="bucket-info">
              <p class="bucket-title">${escapeHtml(item.title)}</p>
              <p class="bucket-artist">${escapeHtml(item.artist)}</p>
              <p class="bucket-by">by ${escapeHtml(item.addedBy)}</p>
            </div>
            ${isDJ ? '<div class="bucket-play-indicator">▶</div>' : ''}
          </div>
        `).join('');

    // Add click handlers for DJ to play songs
    if (isDJ) {
      bucketList.querySelectorAll('.bucket-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const songId = e.currentTarget.dataset.songId;
          PartyRoom.playFromQueue(songId);
          showToast('▶ Playing from queue...');
        });
      });

      // Optional: Add drag-drop reorder indicators (future feature)
      bucketList.querySelectorAll('.bucket-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          item.classList.add('dragging');
        });
        item.addEventListener('dragend', (e) => {
          item.classList.remove('dragging');
        });
      });
    }
  }

  function _updateUsersUI(container) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';
    const usersList = container.querySelector('#party-users-list');

    if (usersList) {
      usersList.innerHTML = _generateUsersList(state, isDJ);

      // Re-attach remove buttons
      if (isDJ) {
        usersList.querySelectorAll('.btn-remove-user').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const userId = e.target.dataset.userId;
            const user = state.users.find(u => u.userId === userId);
            if (user && confirm(`Remove ${user.partyName} from room?`)) {
              PartyRoom.removeUser(userId);
              showToast(`Removed ${user.partyName}`);
            }
          });
        });
      }
    }

    // Update header user count
    const totalUsers = state.users.length + state.djs.length;
    container.querySelector('.header-users').textContent = `👥 ${totalUsers}`;
  }

  function _updateUIState(container) {
    const state = PartyRoom.getState();

    // Update bucket
    _updateBucketUI(container);

    // Rebuild entire player section (switching between np-empty and now-playing)
    const playerSection = container.querySelector('.party-player');
    if (playerSection) {
      const isDJ = state.role === 'dj';
      
      // Rebuild the now-playing/empty section
      let playerHTML = '';
      if (state.currentSong) {
        playerHTML = `
          <div class="now-playing">
            <div class="np-cover">
              <img src="${state.currentSong.image || 'assets/placeholder.png'}" alt="Cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23666%22 font-size=%2246%22%3E🎵%3C/text%3E%3C/svg%3E'">
            </div>
            <div class="np-info">
              <h2>${escapeHtml(state.currentSong.title)}</h2>
              <p>${escapeHtml(state.currentSong.artist)}</p>
            </div>
          </div>
        `;
      } else {
        playerHTML = `
          <div class="np-empty">
            <p>♪ No song playing</p>
            <p style="font-size: 0.85rem; color: #999;">Add songs to queue to get started</p>
          </div>
        `;
      }

      // Add controls
      const controlsHTML = isDJ ? `
        <div class="dj-controls">
          <button id="party-play-btn" class="btn-dj-control" title="Play/Pause">
            ${state.isPlaying ? '⏸' : '▶'}
          </button>
          <button id="party-next-btn" class="btn-dj-control" title="Skip to next">⏭</button>
        </div>
      ` : `
        <div class="guest-info">
          <p>🎧 Only the DJ can control playback</p>
        </div>
      `;

      // Rebuild the entire player
      playerSection.innerHTML = playerHTML + controlsHTML + `
        <div class="progress-bar">
          <div class="progress-fill"></div>
          <div class="progress-time"><span>0:00</span> / <span>0:00</span></div>
        </div>
      `;

      // Re-attach DJ controls listeners
      if (isDJ) {
        const playBtn = playerSection.querySelector('#party-play-btn');
        const nextBtn = playerSection.querySelector('#party-next-btn');
        
        playBtn?.addEventListener('click', () => {
          if (state.isPlaying) {
            PartyRoom.pause();
          } else if (state.currentSong) {
            PartyRoom.resume();
          }
        });

        nextBtn?.addEventListener('click', () => {
          PartyRoom.skipToNext();
        });
      }
    }
  }

  return {
    render,
  };
})();

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
