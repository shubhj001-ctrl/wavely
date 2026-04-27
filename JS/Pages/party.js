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

    // Hide mini player and sidebar when in party room
    const playerBar = document.getElementById('player-bar');
    const sidebar = document.querySelector('.sidebar');
    if (playerBar) {
      playerBar.style.display = 'none';
    }
    if (sidebar) {
      sidebar.style.display = 'none';
    }

    if (params.roomId) {
      // When joining via URL params, need to wait for socket connection and room join
      _joinRoomFromURL(container, params.roomId);
    } else if (PartyRoom && PartyRoom.getState && PartyRoom.getState().roomId) {
      _showPartyInterface(container, PartyRoom.getState().roomId);
    } else {
      // Check for saved session and attempt auto-rejoin
      _attemptSessionRecovery(container);
    }
  }

  function _joinRoomFromURL(container, roomId) {
    // Check if already in the correct room
    const currentState = PartyRoom?.getState?.() || {};
    if (currentState.roomId === roomId && currentState.userId) {
      // Already in the room, skip loading and show interface immediately
      _showPartyInterface(container, roomId);
      return;
    }

    // Show loading state while joining
    container.innerHTML = `
      <div class="party-loading-container">
        <div class="spinner"></div>
        <p>Joining room...</p>
      </div>
    `;

    // Check if we need to initialize PartyRoom
    const needsInit = !PartyRoom || !PartyRoom.isConnected || !PartyRoom.isConnected();
    
    // Check if switching rooms
    if (currentState.roomId && currentState.roomId !== roomId) {
      console.log('[PartyPage] Switching from room', currentState.roomId, 'to', roomId);
      PartyRoom.leaveRoom();
    }

    // Initialize PartyRoom if needed
    if (needsInit) {
      PartyRoom.init();
    }

    let connectionAttempts = 0;
    const checkConnection = setInterval(() => {
      connectionAttempts++;
      
      if (PartyRoom.isConnected()) {
        clearInterval(checkConnection);
        console.log('[PartyPage] Connection established, joining room:', roomId);
        
        // Check again if already in room (could have joined via modal while initializing)
        const state = PartyRoom.getState();
        if (state.roomId === roomId && state.userId) {
          _showPartyInterface(container, roomId);
          return;
        }
        
        // Set party name from localStorage or generate a random guest name
        const partyName = localStorage.getItem('mu_labz_party_name') || `Guest${Math.floor(Math.random() * 1000)}`;
        PartyRoom.setPartyName(partyName);
        
        // Call joinRoom only if not already in room (double-join protection)
        if (!state.userId) {
          PartyRoom.joinRoom(roomId, null); // null = no password for auto-join from URL
        }
        
        // Wait for room join completion
        let joinAttempts = 0;
        const checkJoin = setInterval(() => {
          joinAttempts++;
          const state = PartyRoom.getState();
          
          if (state.roomId === roomId && state.userId) {
            clearInterval(checkJoin);
            _showPartyInterface(container, roomId);
          } else if (joinAttempts > 100) { // 10 second timeout
            clearInterval(checkJoin);
            console.error('[PartyPage] Failed to join room');
            container.innerHTML = '<div class="party-error"><p>❌ Failed to join room. Please try again.</p><a href="#home">Back to Home</a></div>';
          }
        }, 100);
      } else if (connectionAttempts > 50) { // 5 second timeout
        clearInterval(checkConnection);
        console.error('[PartyPage] Failed to connect to server');
        container.innerHTML = '<div class="party-error"><p>❌ Failed to connect to server. Please try again later.</p><a href="#home">Back to Home</a></div>';
      }
    }, 100);
  }

  function _attemptSessionRecovery(container) {
    if (!PartyRoom || !PartyRoom.getSession) {
      _showPartyEntry(container);
      return;
    }

    const savedSession = PartyRoom.getSession();
    if (!savedSession || !savedSession.roomId) {
      _showPartyEntry(container);
      return;
    }

    console.log('[PartyPage] Found saved session for room:', savedSession.roomId);

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
        console.log('[PartyPage] Connection established, rejoining saved room:', savedSession.roomId);
        
        // Restore party name
        if (savedSession.partyName) {
          PartyRoom.setPartyName(savedSession.partyName);
        }
        
        // Attempt to rejoin the room
        if (savedSession.roomType === 'private') {
          // Private room - need password
          PartyRoom.joinRoom(savedSession.roomId, savedSession.roomPassword);
        } else {
          // Public room
          PartyRoom.joinRoom(savedSession.roomId, null);
        }
        
        // Wait for room join completion
        let joinAttempts = 0;
        const checkJoin = setInterval(() => {
          joinAttempts++;
          const state = PartyRoom.getState();
          
          if (state.roomId === savedSession.roomId && state.userId) {
            clearInterval(checkJoin);
            _showPartyInterface(container, savedSession.roomId);
          } else if (joinAttempts > 100) { // 10 second timeout
            clearInterval(checkJoin);
            console.error('[PartyPage] Failed to rejoin room');
            showToast('❌ Room no longer exists');
            _showPartyEntry(container);
            PartyRoom.clearSession();
          }
        }, 100);
      } else if (connectionAttempts > 50) { // 5 second timeout
        clearInterval(checkConnection);
        console.error('[PartyPage] Failed to reconnect');
        _showPartyEntry(container);
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
          showToast('Sending join request...');
          // Use joinRoomRequest instead of joinRoom for request-based system
          PartyRoom.joinRoomRequest(roomId, password);
        } else if (connectionAttempts > 50) { // 5 seconds timeout
          clearInterval(checkConnection);
          showToast('❌ Failed to connect to server. Check your connection.');
          console.error('[PartyPage] Connection timeout after 5 seconds');
        }
      }, 100);

      // Handle join request pending (waiting in lobby)
      const pendingHandler = () => {
        clearInterval(checkConnection);
        document.removeEventListener('party:joinRequest:pending', pendingHandler);
        document.removeEventListener('party:joinRequest:rejected', errorHandler);
        document.removeEventListener('party:error', errorHandler);
        showToast('📋 Waiting in lobby for DJ approval...');
        _showLobbyWaitingModal(container, roomId);
        modal.remove();
      };

      // Handle join request approved
      const approvedHandler = () => {
        clearInterval(checkConnection);
        document.removeEventListener('party:joinRequest:pending', pendingHandler);
        document.removeEventListener('party:joinRequest:approved', approvedHandler);
        document.removeEventListener('party:joinRequest:rejected', errorHandler);
        document.removeEventListener('party:error', errorHandler);
        showToast('✅ Request approved! Entering room...');
        Router.navigate('party', { roomId: roomId });
        modal.remove();
      };

      const errorHandler = (e) => {
        clearInterval(checkConnection);
        if (e.detail && (e.detail.type === 'ROOM_NOT_FOUND' || e.detail.type === 'INVALID_PASSWORD' || e.detail.type === 'ROOM_FULL' || e.detail.type === 'ALREADY_REQUESTED')) {
          const msg = e.detail.type === 'INVALID_PASSWORD' ? '❌ Wrong passcode' : '❌ ' + (e.detail.message || 'Failed to join room');
          showToast(msg);
          console.error('[PartyPage] Join error:', e.detail);
          
          // Show password group if invalid password
          if (e.detail.type === 'INVALID_PASSWORD') {
            modal.querySelector('#password-group').style.display = 'block';
          }
        }
      };

      const rejectedHandler = (e) => {
        clearInterval(checkConnection);
        document.removeEventListener('party:joinRequest:pending', pendingHandler);
        document.removeEventListener('party:joinRequest:approved', approvedHandler);
        document.removeEventListener('party:joinRequest:rejected', rejectedHandler);
        document.removeEventListener('party:error', errorHandler);
        const reason = e.detail?.reason || 'Your request was rejected';
        showToast('❌ ' + reason);
        console.error('[PartyPage] Join rejected:', e.detail);
      };

      const backendOfflineHandler = (e) => {
        clearInterval(checkConnection);
        console.error('[PartyPage] Backend offline:', e.detail);
        showToast('❌ Backend server is offline. Please try again later or contact support.');
      };

      document.addEventListener('party:joinRequest:pending', pendingHandler);
      document.addEventListener('party:joinRequest:approved', approvedHandler);
      document.addEventListener('party:joinRequest:rejected', rejectedHandler);
      document.addEventListener('party:connectionError', errorHandler);
      document.addEventListener('party:error', errorHandler);
      document.addEventListener('party:backendOffline', backendOfflineHandler);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function _showLobbyWaitingModal(container, roomId) {
    const modal = document.createElement('div');
    modal.className = 'party-modal-overlay';
    modal.innerHTML = `
      <div class="party-modal">
        <div style="text-align: center;">
          <div class="spinner" style="margin: 0 auto 1rem;"></div>
          <h2>Waiting in Lobby</h2>
          <p>📋 Your request to join has been sent to the DJ.</p>
          <p style="color: #999; font-size: 0.9rem;">The DJ will review your request and approve or reject it.</p>
        </div>
        <div class="modal-actions" style="margin-top: 2rem;">
          <button class="btn-secondary cancel-join-btn">Cancel Request</button>
        </div>
      </div>
    `;

    container.appendChild(modal);

    // Handle DJ approval
    const approvedHandler = () => {
      document.removeEventListener('party:joinRequest:approved', approvedHandler);
      document.removeEventListener('party:joinRequest:rejected', rejectedHandler);
      showToast('✅ Your request was approved!');
      Router.navigate('party', { roomId: roomId });
      modal.remove();
    };

    // Handle DJ rejection
    const rejectedHandler = (e) => {
      document.removeEventListener('party:joinRequest:approved', approvedHandler);
      document.removeEventListener('party:joinRequest:rejected', rejectedHandler);
      const reason = e.detail?.reason || 'Your request was rejected';
      showToast('❌ ' + reason);
      modal.remove();
    };

    // Handle cancel request
    modal.querySelector('.cancel-join-btn')?.addEventListener('click', () => {
      // User will disconnect when they close modal
      document.removeEventListener('party:joinRequest:approved', approvedHandler);
      document.removeEventListener('party:joinRequest:rejected', rejectedHandler);
      showToast('Request cancelled');
      modal.remove();
    });

    document.addEventListener('party:joinRequest:approved', approvedHandler);
    document.addEventListener('party:joinRequest:rejected', rejectedHandler);
  }

  function _showPartyInterface(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';
    const totalUsers = state.users.length + state.djs.length;

    // Generate shareable URL
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}#party/${roomId}`;

    // Build queue HTML for flip card back
    const queueHTML = state.bucket.length === 0 
      ? '<p class="empty-msg">No songs in queue</p>'
      : state.bucket.map((item, idx) => `
          <div class="queue-item-flip" data-song-id="${item.songId}">
            <div style="flex: 1; min-width: 0;">
              <p style="margin: 0; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.title)}</p>
              <p style="margin: 0.25rem 0 0; font-size: 0.85rem; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.artist)} - ${escapeHtml(item.addedBy)}</p>
            </div>
            ${isDJ ? `<button class="btn-play-from-queue" data-song-id="${item.songId}" style="margin-left: 0.5rem; padding: 0.4rem 0.8rem; background: #1db954; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">▶</button>` : ''}
          </div>
        `).join('');

    container.innerHTML = `
      <div class="party-room-container-mobile">
        <!-- Header: Room name + User count -->
        <div class="party-header-mobile">
          <div class="header-left">
            <h1 class="header-room-name">${escapeHtml(state.roomName)}</h1>
            <p class="header-role-badge">${isDJ ? '👑 DJ' : '🎧 Guest'}</p>
          </div>
          <div class="header-actions">
            <button class="header-share-btn" data-toggle="share-modal" title="Share room">
              🔗
            </button>
            <button class="header-user-count ${isDJ ? 'clickable' : ''}" data-toggle="users-modal">
              👥 ${totalUsers}${state.pendingJoins?.length ? ' · ' + state.pendingJoins.length + ' waiting' : ''}
            </button>
            <button class="header-leave-btn">Leave</button>
          </div>
        </div>

        <!-- Center: Flip Card Player -->
        <div class="flip-card-wrapper">
          <div class="flip-card-container">
            <div class="flip-card">
              <!-- Front: Now Playing -->
              <div class="flip-card-front">
                <div class="now-playing-flip">
                  ${state.currentSong ? `
                    <div class="np-cover-flip">
                      <img src="${state.currentSong.image || 'assets/placeholder.png'}" alt="Cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23666%22 font-size=%2246%22%3E🎵%3C/text%3E%3C/svg%3E'">
                    </div>
                    <div class="np-info-flip">
                      <h2>${escapeHtml(state.currentSong.title)}</h2>
                      <p>${escapeHtml(state.currentSong.artist)}</p>
                    </div>
                  ` : `
                    <div class="np-empty-flip">
                      <p>🎵</p>
                      <p>No song playing</p>
                      <small>Add songs to queue</small>
                    </div>
                  `}
                </div>
                
                ${isDJ ? `
                  <div class="dj-controls-flip">
                    <button id="party-play-btn" class="btn-control-flip" title="Play/Pause">
                      ${state.isPlaying ? '⏸' : '▶'}
                    </button>
                    <button id="party-next-btn" class="btn-control-flip" title="Skip">⏭</button>
                  </div>
                ` : `
                  <div class="guest-info-flip">
                    <p>🎧 DJ controls playback</p>
                  </div>
                `}

                <div class="progress-bar-flip">
                  <div class="progress-fill-flip"></div>
                  <div class="progress-time-flip"><span>0:00</span> / <span>0:00</span></div>
                </div>

                <p class="flip-hint">Tap card to see queue</p>
              </div>

              <!-- Back: Queue List -->
              <div class="flip-card-back">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color, #333);">
                  <h3 style="margin: 0; font-size: 1rem;">Queue (${state.bucket.length})</h3>
                </div>
                <div class="queue-list-flip">
                  ${queueHTML}
                </div>
                <p class="flip-hint" style="text-align: center; margin-top: 1rem;">Tap card to go back</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Search Section -->
        <div class="party-search-section">
          <div class="search-input-group">
            <input type="text" id="party-search-input" placeholder="🔍 Search songs..." maxlength="100">
          </div>
          <div id="party-search-results" class="search-results-mobile" style="display: none;"></div>
        </div>
      </div>

      <!-- Users Modal (All Listeners) -->
      <div id="users-modal-overlay" class="party-modal-overlay" style="display: none;">
        <div class="party-modal-content">
          <div class="party-modal-header">
            <h2>👥 All Listeners</h2>
            <button class="modal-close-btn">✕</button>
          </div>
          
          ${isDJ ? `
            <div class="party-modal-tabs">
              <button class="modal-tab active" data-tab="in-room">In Room</button>
              <button class="modal-tab" data-tab="waiting">Waiting (${state.pendingJoins?.length || 0})</button>
            </div>
          ` : ''}

          <div class="party-modal-body">
            <!-- In Room Tab -->
            <div class="modal-tab-content active" data-tab-content="in-room" id="modal-in-room">
              ${_generateModalUsersList(state, isDJ)}
            </div>

            ${isDJ ? `
              <!-- Waiting Tab -->
              <div class="modal-tab-content" data-tab-content="waiting" id="modal-waiting">
                ${_generateModalWaitingList(state, isDJ)}
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Share Modal -->
      <div id="share-modal-overlay" class="party-modal-overlay" style="display: none;">
        <div class="party-modal-content">
          <div class="party-modal-header">
            <h2>🔗 Share Room</h2>
            <button class="modal-close-btn">✕</button>
          </div>
          
          <div class="party-modal-body">
            <div class="share-option">
              <div class="share-option-title">Share Code</div>
              <div class="share-option-content">
                <code class="share-code">${roomId}</code>
                <button class="btn-share-copy" data-share-type="code">📋 Copy</button>
              </div>
            </div>

            <div class="share-option">
              <div class="share-option-title">Share URL</div>
              <div class="share-option-content">
                <code class="share-url">${shareUrl}</code>
                <button class="btn-share-copy" data-share-type="url">📋 Copy</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    _attachPartyEventListeners(container, roomId);
    _updateUIState(container);
    _refreshWaitingStatus(container);
  }

  function _generateModalUsersList(state, isDJ) {
    let html = '';

    // DJs
    if (state.djs && state.djs.length > 0) {
      state.djs.forEach(user => {
        const isCurrentUser = user.userId === state.userId;
        
        html += `
          <div class="modal-user-item">
            <div class="modal-user-info">
              <span style="font-size: 1.2rem;">👑</span>
              <span class="modal-user-name">${escapeHtml(user.partyName)}</span>
              ${isCurrentUser ? '<span style="font-size: 0.75rem; color: #1db954; margin-left: 0.5rem;">(You)</span>' : ''}
            </div>
            ${isDJ && !isCurrentUser ? `
              <div class="modal-user-actions">
                <button class="btn-modal-action btn-remove-user-modal" data-user-id="${user.userId}" title="Remove DJ">Remove</button>
              </div>
            ` : ''}
          </div>
        `;
      });
    }

    // Guests
    if (state.users && state.users.length > 0) {
      state.users.forEach(user => {
        const isCurrentUser = user.userId === state.userId;
        
        html += `
          <div class="modal-user-item">
            <div class="modal-user-info">
              <span style="font-size: 1rem;">🎧</span>
              <span class="modal-user-name">${escapeHtml(user.partyName)}</span>
              ${isCurrentUser ? '<span style="font-size: 0.75rem; color: #1db954; margin-left: 0.5rem;">(You)</span>' : ''}
            </div>
            ${isDJ && !isCurrentUser ? `
              <div class="modal-user-actions">
                <button class="btn-modal-action btn-promote-user-modal" data-user-id="${user.userId}" title="Make DJ">Make DJ</button>
                <button class="btn-modal-action btn-modal-danger btn-remove-user-modal" data-user-id="${user.userId}" title="Remove">Remove</button>
              </div>
            ` : ''}
          </div>
        `;
      });
    }

    return html || '<p class="empty-msg">No users in room</p>';
  }

  function _generateModalWaitingList(state, isDJ) {
    if (!state.pendingJoins || state.pendingJoins.length === 0) {
      return '<p class="empty-msg">No pending requests</p>';
    }

    const isCreator = state.roomCreatorId === state.userId;

    return state.pendingJoins.map(request => `
      <div class="modal-user-item">
        <div class="modal-user-info">
          <span style="font-size: 1rem;">⏳</span>
          <span class="modal-user-name">${escapeHtml(request.partyName)}</span>
        </div>
        ${isCreator ? `
          <div class="modal-user-actions">
            <button class="btn-modal-action btn-approve-user-modal" data-user-id="${request.userId}" title="Approve">Approve</button>
            <button class="btn-modal-action btn-modal-danger btn-reject-user-modal" data-user-id="${request.userId}" title="Reject">Reject</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function _refreshWaitingStatus(container) {
    const state = PartyRoom.getState();
    const userCountBtn = container.querySelector('[data-toggle="users-modal"]');
    if (!userCountBtn) return;

    const totalUsers = (state.users?.length || 0) + (state.djs?.length || 0);
    const pendingCount = state.pendingJoins?.length || 0;

    userCountBtn.textContent = `👥 ${totalUsers}${pendingCount > 0 ? ' · ' + pendingCount + ' waiting' : ''}`;
    userCountBtn.classList.toggle('has-pending-requests', pendingCount > 0);

    const waitingTabBtn = container.querySelector('.modal-tab[data-tab="waiting"]');
    if (waitingTabBtn) {
      waitingTabBtn.textContent = `Waiting (${pendingCount})`;
    }
  }

  // ─── FIX: Dedicated helper to attach listeners to waiting tab after any re-render ───
  function _attachWaitingTabListeners(waitingTab, roomId) {
    const state = PartyRoom.getState();
    const isCreator = state.roomCreatorId === state.userId;
    if (!isCreator) return;

    waitingTab.querySelectorAll('.btn-approve-user-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = e.currentTarget.dataset.userId;
        console.log('[PartyPage] Approving join request for userId:', userId);
        PartyRoom.approveJoinRequest(roomId, userId);
        showToast('✅ Request approved');
      });
    });

    waitingTab.querySelectorAll('.btn-reject-user-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = e.currentTarget.dataset.userId;
        console.log('[PartyPage] Rejecting join request for userId:', userId);
        PartyRoom.rejectJoinRequest(roomId, userId);
        showToast('❌ Request rejected');
      });
    });
  }

  // ─── FIX: Dedicated helper to attach listeners to in-room tab after any re-render ───
  function _attachInRoomTabListeners(inRoomTab) {
    const state = PartyRoom.getState();

    inRoomTab.querySelectorAll('.btn-remove-user-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = e.currentTarget.dataset.userId;
        const user = state.users.find(u => u.userId === userId) || state.djs.find(u => u.userId === userId);
        if (user && confirm(`Remove ${user.partyName} from room?`)) {
          PartyRoom.removeUser(userId);
          showToast(`Removed ${user.partyName}`);
        }
      });
    });

    inRoomTab.querySelectorAll('.btn-promote-user-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = e.currentTarget.dataset.userId;
        const user = state.users.find(u => u.userId === userId);
        if (user && confirm(`Make ${user.partyName} a DJ?`)) {
          PartyRoom.promoteUser(userId);
          showToast(`${user.partyName} is now a DJ`);
        }
      });
    });
  }

  function _attachPartyEventListeners(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';
    const isCreator = state.roomCreatorId === state.userId;

    // ─── Flip Card Toggle ───
    const flipCard = container.querySelector('.flip-card');
    if (flipCard) {
      flipCard.addEventListener('click', (e) => {
        // Don't flip if clicking on buttons
        if (e.target.closest('.btn-control-flip') || e.target.closest('.btn-play-from-queue')) {
          return;
        }
        flipCard.classList.toggle('flipped');
      });
    }

    // ─── Play from Queue (on flip card back) ───
    container.querySelectorAll('.btn-play-from-queue').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const songId = e.target.dataset.songId;
        PartyRoom.playFromQueue(songId);
        showToast('▶ Playing from queue...');
        flipCard.classList.remove('flipped');
      });
    });

    // ─── Modal references ───
    const userCountBtn = container.querySelector('[data-toggle="users-modal"]');
    const usersModal = container.querySelector('#users-modal-overlay');
    const shareBtn = container.querySelector('[data-toggle="share-modal"]');
    const shareModal = container.querySelector('#share-modal-overlay');
    const closeBtns = container.querySelectorAll('.modal-close-btn');

    // ─── Share Modal Toggle ───
    shareBtn?.addEventListener('click', () => {
      shareModal.style.display = 'flex';
    });

    // ─── Close Modal Buttons ───
    closeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.party-modal-overlay');
        if (modal) {
          modal.style.display = 'none';
        }
      });
    });

    // Close modal when clicking backdrop
    [usersModal, shareModal].forEach(modal => {
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    });

    // ─── Users Modal Toggle (DJ only) ───
    // Single handler — opens modal, re-renders waiting tab, attaches listeners
    if (userCountBtn && isDJ) {
      userCountBtn.addEventListener('click', () => {
        userCountBtn.classList.remove('has-pending-requests');
        usersModal.style.display = 'flex';

        // Re-render & re-attach both tabs when modal opens
        const inRoomTab = usersModal.querySelector('#modal-in-room');
        const waitingTab = usersModal.querySelector('#modal-waiting');

        if (inRoomTab) {
          inRoomTab.innerHTML = _generateModalUsersList(PartyRoom.getState(), isDJ);
          _attachInRoomTabListeners(inRoomTab);
        }
        if (waitingTab) {
          waitingTab.innerHTML = _generateModalWaitingList(PartyRoom.getState(), isDJ);
          _attachWaitingTabListeners(waitingTab, roomId);
        }
      });
    }

    // ─── Modal Tabs ───
    container.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        
        // Update active tab button
        container.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        
        // Update active tab content
        container.querySelectorAll('.modal-tab-content').forEach(content => {
          content.classList.remove('active');
          if (content.dataset.tabContent === tabName) {
            content.classList.add('active');
          }
        });

        // Re-attach listeners when switching to waiting tab
        if (tabName === 'waiting' && isDJ) {
          const waitingTab = container.querySelector('#modal-waiting');
          if (waitingTab) {
            waitingTab.innerHTML = _generateModalWaitingList(PartyRoom.getState(), isDJ);
            _attachWaitingTabListeners(waitingTab, roomId);
          }
        }
        // Re-attach listeners when switching to in-room tab
        if (tabName === 'in-room') {
          const inRoomTab = container.querySelector('#modal-in-room');
          if (inRoomTab) {
            inRoomTab.innerHTML = _generateModalUsersList(PartyRoom.getState(), isDJ);
            _attachInRoomTabListeners(inRoomTab);
          }
        }
      });
    });

    // ─── Share Options ───
    container.querySelectorAll('.btn-share-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const shareType = e.target.dataset.shareType;
        let textToCopy = '';
        let copyLabel = '';

        if (shareType === 'code') {
          textToCopy = roomId;
          copyLabel = 'Room Code';
        } else if (shareType === 'url') {
          const baseUrl = window.location.origin + window.location.pathname;
          textToCopy = `${baseUrl}#party/${roomId}`;
          copyLabel = 'Room URL';
        }

        if (textToCopy) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            showToast(`✅ ${copyLabel} copied!`);
            e.target.textContent = '✅ Copied!';
            setTimeout(() => {
              e.target.textContent = '📋 Copy';
            }, 2000);
          }).catch(() => {
            showToast('❌ Failed to copy');
          });
        }
      });
    });

    // ─── Leave Room ───
    container.querySelector('.header-leave-btn')?.addEventListener('click', () => {
      if (confirm('Leave room?')) {
        PartyRoom.leaveRoom();
        // Clear session and refresh
        localStorage.removeItem('party_session');
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    });

    // ─── DJ Controls ───
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
    }

    // ─── Search Functionality ───
    let searchTimer;
    const searchInput = container.querySelector('#party-search-input');
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const query = e.target.value.trim();
      
      if (!query) {
        container.querySelector('#party-search-results').style.display = 'none';
        return;
      }

      searchTimer = setTimeout(() => _performSearchMobile(container, query, isDJ), 300);
    });

    // ─── Real-time event handlers ───
    const updateHandler = () => _updateUIState(container);
    
    const playHandler = (event) => {
      _updateUIState(container);
      const song = event.detail?.currentSong;
      
      console.log('[PartyPage] playHandler called', { 
        title: song?.title,
        hasPlayer: !!window.Player, 
        hasPlayMethod: typeof window.Player?.play,
      });
      
      if (!song) {
        console.warn('[PartyPage] No song in event detail');
        return;
      }
      
      if (!window.Player) {
        console.error('[PartyPage] ❌ Player module not loaded yet. Retrying...');
        setTimeout(() => {
          if (window.Player && typeof window.Player.play === 'function') {
            console.log('[PartyPage] ✓ Player now available, playing:', song.title);
            window.Player.play(song, [song], 0);
          }
        }, 500);
        return;
      }
      
      if (typeof window.Player.play !== 'function') {
        console.error('[PartyPage] Player.play is not a function');
        return;
      }
      
      try {
        console.log('[PartyPage] ▶ Calling Player.play() for:', song.title);
        window.Player.play(song, [song], 0);
        console.log('[PartyPage] ✓ Player.play() executed successfully');
      } catch (error) {
        console.error('[PartyPage] Error calling Player.play():', error);
      }
    };

    const nextHandler = (event) => {
      _updateUIState(container);
      const song = event.detail?.currentSong;
      console.log('[PartyPage] nextHandler called', { title: song?.title });
      
      if (!song || !window.Player || typeof window.Player.play !== 'function') {
        return;
      }
      
      try {
        console.log('[PartyPage] ⏭ Calling Player.play() for next:', song.title);
        window.Player.play(song, [song], 0);
      } catch (error) {
        console.error('[PartyPage] Error calling Player.play() for next:', error);
      }
    };

    const pauseHandler = (event) => {
      console.log('[PartyPage] pauseHandler called - pausing playback');
      _updateUIState(container);
      
      if (!window.Player || typeof window.Player.pause !== 'function') {
        console.warn('[PartyPage] Player not available for pause');
        return;
      }
      
      try {
        console.log('[PartyPage] ⏸ Calling Player.pause()');
        window.Player.pause();
      } catch (error) {
        console.error('[PartyPage] Error calling Player.pause():', error);
      }
    };

    const resumeHandler = (event) => {
      console.log('[PartyPage] resumeHandler called - resuming playback');
      _updateUIState(container);
      
      if (!window.Player || typeof window.Player.resume !== 'function') {
        console.warn('[PartyPage] Player not available for resume');
        return;
      }
      
      try {
        console.log('[PartyPage] ▶ Calling Player.resume()');
        window.Player.resume();
      } catch (error) {
        console.error('[PartyPage] Error calling Player.resume():', error);
      }
    };

    const userRemovedSelfHandler = (event) => {
      console.log('[PartyPage] User was removed from party');
      
      if (window.Player && typeof window.Player.pause === 'function') {
        try {
          window.Player.pause();
        } catch (error) {
          console.error('[PartyPage] Error stopping player:', error);
        }
      }
      
      showToast('❌ You have been removed from the party room');
      
      localStorage.removeItem('party_session');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    };

    const bucketAddErrorHandler = (event) => {
      console.error('[PartyPage] Bucket add error:', event.detail);
      showToast('❌ Failed to add song');
    };

    // Handle new join requests (DJ notifications)
    const joinRequestNewHandler = (event) => {
      if (!isDJ) return;
      _refreshWaitingStatus(container);
    };

    // Handle join request list updates
    const joinRequestListHandler = (event) => {
      if (!isDJ) return;
      const userCountBtn = container.querySelector('[data-toggle="users-modal"]');
      const state = PartyRoom.getState();
      
      // Update the waiting tab if modal is open
      const usersModal = container.querySelector('#users-modal-overlay');
      if (usersModal && usersModal.style.display === 'flex') {
        const waitingTab = usersModal.querySelector('#modal-waiting');
        if (waitingTab) {
          // Re-render and re-attach listeners after HTML replacement
          waitingTab.innerHTML = _generateModalWaitingList(state, isDJ);
          _attachWaitingTabListeners(waitingTab, roomId);
        }
      }
      
      _refreshWaitingStatus(container);
    };

    document.addEventListener('party:bucketAdd', updateHandler);
    document.addEventListener('party:bucketRemove', updateHandler);
    document.addEventListener('party:play', playHandler);
    document.addEventListener('party:pause', pauseHandler);
    document.addEventListener('party:resume', resumeHandler);
    document.addEventListener('party:next', nextHandler);
    document.addEventListener('party:userJoined', updateHandler);
    document.addEventListener('party:userLeft', updateHandler);
    document.addEventListener('party:userRemoved', updateHandler);
    document.addEventListener('party:userPromoted', updateHandler);
    document.addEventListener('party:userRemovedSelf', userRemovedSelfHandler);
    document.addEventListener('party:bucketAddError', bucketAddErrorHandler);
    document.addEventListener('party:joinRequest:new', joinRequestNewHandler);
    document.addEventListener('party:joinRequest:list', joinRequestListHandler);

    listeners.bucketAdd = { event: 'party:bucketAdd', handler: updateHandler };
    listeners.bucketRemove = { event: 'party:bucketRemove', handler: updateHandler };
    listeners.play = { event: 'party:play', handler: playHandler };
    listeners.pause = { event: 'party:pause', handler: pauseHandler };
    listeners.resume = { event: 'party:resume', handler: resumeHandler };
    listeners.next = { event: 'party:next', handler: nextHandler };
    listeners.userPromoted = { event: 'party:userPromoted', handler: updateHandler };
    listeners.userJoined = { event: 'party:userJoined', handler: updateHandler };
    listeners.userLeft = { event: 'party:userLeft', handler: updateHandler };
    listeners.userRemoved = { event: 'party:userRemoved', handler: updateHandler };
    listeners.userRemovedSelf = { event: 'party:userRemovedSelf', handler: userRemovedSelfHandler };
    listeners.bucketAddError = { event: 'party:bucketAddError', handler: bucketAddErrorHandler };
    listeners.joinRequestNew = { event: 'party:joinRequest:new', handler: joinRequestNewHandler };
    listeners.joinRequestList = { event: 'party:joinRequest:list', handler: joinRequestListHandler };
  }

  async function _performSearchMobile(container, query, isDJ) {
    const resultsDiv = container.querySelector('#party-search-results');
    resultsDiv.innerHTML = '<div class="skeleton-loading">🔍 Searching...</div>';
    resultsDiv.style.display = 'block';

    try {
      const tracks = await API.search(query, 15);
      
      if (!tracks || tracks.length === 0) {
        resultsDiv.innerHTML = '<div class="no-results-msg">No results found</div>';
        return;
      }

      // Store tracks in a map
      const trackMap = new Map();
      tracks.forEach((track, idx) => {
        trackMap.set(idx, track);
      });

      resultsDiv.innerHTML = tracks.map((track, idx) => `
        <div class="search-result-item-mobile">
          <img src="${track.thumb || track.image || 'assets/placeholder.png'}" alt="${escapeHtml(track.title)}" class="search-result-thumb-mobile" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 50 50%22%3E%3Crect fill=%22%23333%22 width=%2250%22 height=%2250%22/%3E%3Ctext x=%2725%22 y=%2725%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23666%22 font-size=%2224%22%3E♪%3C/text%3E%3C/svg%3E'">
          <div class="search-result-info-mobile">
            <p class="search-result-title-mobile">${escapeHtml(track.title)}</p>
            <p class="search-result-artist-mobile">${escapeHtml(track.artist)}</p>
          </div>
          <div class="search-actions">
            ${isDJ ? `
              <button class="btn-search-action btn-play-now" data-track-idx="${idx}" title="Play now">▶</button>
              <button class="btn-search-action secondary btn-add-to-queue" data-track-idx="${idx}" title="Add to queue">+</button>
            ` : `
              <button class="btn-search-action btn-add-to-queue" data-track-idx="${idx}" title="Add to queue">+</button>
            `}
          </div>
        </div>
      `).join('');

      // Play now button (DJ only) - ✅ FIX: Play directly without adding to queue
      resultsDiv.querySelectorAll('.btn-play-now').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.trackIdx);
          const track = trackMap.get(idx);
          if (!track) return;

          const state = PartyRoom.getState();
          if (!state.roomId) {
            showToast('❌ Not connected to room');
            return;
          }

          console.log('[PartyPage] Playing directly (not adding to queue):', track.title);
          // ✅ Send playback:play directly to server, bypassing queue
          PartyRoom.playTrack({
            id: track.id || track.songId,
            title: track.title,
            artist: track.artist,
            image: track.image || track.thumb,
            source: track.source || 'jiosaavn',
            audio: track.audio,
            duration: track.duration,
            genre: track.genre,
          });
          showToast(`▶ Now playing: ${escapeHtml(track.title)}`);
          
          container.querySelector('#party-search-input').value = '';
          resultsDiv.style.display = 'none';
          resultsDiv.innerHTML = '';
        });
      });

      // Add to queue button
      resultsDiv.querySelectorAll('.btn-add-to-queue').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.trackIdx);
          const track = trackMap.get(idx);
          if (!track) return;

          const state = PartyRoom.getState();
          if (!state.roomId) {
            showToast('❌ Not connected to room');
            return;
          }

          console.log('[PartyPage] Adding to queue:', track.title);
          PartyRoom.addToBucket(track);
          showToast(`✅ Added "${escapeHtml(track.title)}" to queue`);
          
          container.querySelector('#party-search-input').value = '';
          resultsDiv.style.display = 'none';
          resultsDiv.innerHTML = '';
        });
      });
    } catch (err) {
      console.error('[PartyPage] Search error:', err);
      resultsDiv.innerHTML = '<div class="no-results-msg">Search error - try again</div>';
    }
  }

  function _updateUIState(container) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';

    // Update flip card front (current song)
    const flipCardFront = container.querySelector('.flip-card-front');
    if (flipCardFront) {
      let playerHTML = '';
      if (state.currentSong) {
        playerHTML = `
          <div class="now-playing-flip">
            <div class="np-cover-flip">
              <img src="${state.currentSong.image || 'assets/placeholder.png'}" alt="Cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23666%22 font-size=%2246%22%3E🎵%3C/text%3E%3C/svg%3E'">
            </div>
            <div class="np-info-flip">
              <h2>${escapeHtml(state.currentSong.title)}</h2>
              <p>${escapeHtml(state.currentSong.artist)}</p>
            </div>
          </div>
        `;
      } else {
        playerHTML = `
          <div class="np-empty-flip">
            <p>🎵</p>
            <p>No song playing</p>
            <small>Add songs to queue</small>
          </div>
        `;
      }

      const controlsHTML = isDJ ? `
        <div class="dj-controls-flip">
          <button id="party-play-btn" class="btn-control-flip" title="Play/Pause">
            ${state.isPlaying ? '⏸' : '▶'}
          </button>
          <button id="party-next-btn" class="btn-control-flip" title="Skip">⏭</button>
        </div>
      ` : `
        <div class="guest-info-flip">
          <p>🎧 DJ controls playback</p>
        </div>
      `;

      flipCardFront.innerHTML = playerHTML + controlsHTML + `
        <div class="progress-bar-flip">
          <div class="progress-fill-flip"></div>
          <div class="progress-time-flip"><span>0:00</span> / <span>0:00</span></div>
        </div>
        <p class="flip-hint">Tap card to see queue</p>
      `;

      // Re-attach DJ controls
      if (isDJ) {
        flipCardFront.querySelector('#party-play-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.isPlaying) PartyRoom.pausePlayback();
          else if (state.currentSong) PartyRoom.resumePlayback();
          else if (state.bucket.length > 0) {
            PartyRoom.skipToNext();
          } else {
            showToast('Add songs to queue first');
          }
        });

        flipCardFront.querySelector('#party-next-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          PartyRoom.skipToNext();
        });
      }
    }

    // Update flip card back (queue)
    const flipCardBack = container.querySelector('.flip-card-back');
    if (flipCardBack) {
      const queueHTML = state.bucket.length === 0 
        ? '<p class="empty-msg">No songs in queue</p>'
        : state.bucket.map((item, idx) => `
            <div class="queue-item-flip" data-song-id="${item.songId}">
              <div style="flex: 1; min-width: 0;">
                <p style="margin: 0; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.title)}</p>
                <p style="margin: 0.25rem 0 0; font-size: 0.85rem; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.artist)} - ${escapeHtml(item.addedBy)}</p>
              </div>
              ${isDJ ? `<button class="btn-play-from-queue" data-song-id="${item.songId}" style="margin-left: 0.5rem; padding: 0.4rem 0.8rem; background: #1db954; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">▶</button>` : ''}
            </div>
          `).join('');

      flipCardBack.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color, #333);">
          <h3 style="margin: 0; font-size: 1rem;">Queue (${state.bucket.length})</h3>
        </div>
        <div class="queue-list-flip">
          ${queueHTML}
        </div>
        <p class="flip-hint" style="text-align: center; margin-top: 1rem;">Tap card to go back</p>
      `;

      // Re-attach play from queue buttons
      flipCardBack.querySelectorAll('.btn-play-from-queue').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const songId = e.target.dataset.songId;
          PartyRoom.playFromQueue(songId);
          showToast('▶ Playing from queue...');
          container.querySelector('.flip-card').classList.remove('flipped');
        });
      });
    }

    // Update header user count
    const totalUsers = state.users.length + state.djs.length;
    const headerUserCount = container.querySelector('.header-user-count');
    if (headerUserCount) {
      headerUserCount.textContent = `👥 ${totalUsers}`;
    }

    // Update modal content if visible (for "All Listeners")
    const modal = container.querySelector('#users-modal-overlay');
    if (modal && modal.style.display === 'flex') {
      const inRoomTab = container.querySelector('#modal-in-room');
      const waitingTab = container.querySelector('#modal-waiting');
      
      if (inRoomTab) {
        inRoomTab.innerHTML = _generateModalUsersList(state, isDJ);
        _attachInRoomTabListeners(inRoomTab);
      }

      if (waitingTab && isDJ) {
        // Determine roomId from PartyRoom state since we may not have it in closure here
        const currentRoomId = state.roomId;
        waitingTab.innerHTML = _generateModalWaitingList(state, isDJ);
        _attachWaitingTabListeners(waitingTab, currentRoomId);
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