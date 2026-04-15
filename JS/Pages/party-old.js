/**
 * Pages/party.js — Party Room page renderer (IMPROVED UI)
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

    if (params.roomId) {
      _showPartyInterface(container, params.roomId);
    } else if (PartyRoom && PartyRoom.getState && PartyRoom.getState().roomId) {
      _showPartyInterface(container, PartyRoom.getState().roomId);
    } else {
      _showPartyEntry(container);
    }
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
          <label>Party Name</label>
          <input type="text" id="party-name-input" placeholder="Your name?" maxlength="50">
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
              <span>Private (password)</span>
            </label>
          </div>
        </div>
        <div class="form-group" id="password-group" style="display: none;">
          <label>Password</label>
          <input type="password" id="password-input" maxlength="50">
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
      PartyRoom.init();
      PartyRoom.createRoom(roomName, maxUsers, roomType, password);

      const handler = () => {
        document.removeEventListener('party:roomCreated', handler);
        Router.navigate('party', { roomId: PartyRoom.getState().roomId });
        modal.remove();
      };
      document.addEventListener('party:roomCreated', handler);
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
          <label>Party Name</label>
          <input type="text" id="party-name-input" placeholder="Your name?" maxlength="50">
        </div>
        <div class="form-group">
          <label>Room Code</label>
          <input type="text" id="room-id-input" placeholder="Enter room code" maxlength="100">
        </div>
        <div class="form-group" id="password-group" style="display: none;">
          <label>Password</label>
          <input type="password" id="password-input" maxlength="50">
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

      if (roomId.includes('#party/')) {
        roomId = roomId.split('#party/')[1].split('?')[0];
      }

      const password = modal.querySelector('#password-input').value || null;
      PartyRoom.setPartyName(partyName);
      PartyRoom.init();
      PartyRoom.joinRoom(roomId, password);

      const handler = () => {
        document.removeEventListener('party:roomJoined', handler);
        Router.navigate('party', { roomId: roomId });
        modal.remove();
      };
      document.addEventListener('party:roomJoined', handler);

      const errorHandler = (e) => {
        if (e.detail && e.detail.type === 'JOIN_FAILED') {
          showToast('Failed to join: ' + (e.detail.message || 'Unknown error'));
          document.removeEventListener('party:error', errorHandler);
          modal.remove();
        }
      };
      document.addEventListener('party:error', errorHandler);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function _showPartyInterface(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';
    const totalUsers = state.users.length + state.djs.length;

    container.innerHTML = `
      <div class="party-room-container">
        <!-- Header -->
        <div class="party-header">
          <div>
            <h1>${escapeHtml(state.roomName)}</h1>
            <p>Code: <code>${roomId.substring(0, 8)}</code> | ${isDJ ? '👑 DJ' : '🎧 Guest'} | Users: ${totalUsers}</p>
          </div>
          <button class="btn-secondary leave-btn">Leave</button>
        </div>

        <!-- Main Content -->
        <div class="party-content">
          <!-- Center: Now Playing -->
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
                  <p>♪ No song playing yet</p>
                </div>
              `}

              ${isDJ ? `
                <div class="dj-controls">
                  <button id="party-prev-btn">⏮</button>
                  <button id="party-play-btn">▶</button>
                  <button id="party-next-btn">⏭</button>
                </div>
              ` : ''}

              <div class="progress-bar">
                <div class="progress-fill"></div>
                <div class="progress-time"><span>0:00</span> / <span>0:00</span></div>
              </div>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="party-sidebar">
            <!-- Search & Bucket -->
            <div class="party-section">
              <h3>🎵 Find & Add Songs</h3>
              <div class="search-box">
                <input type="text" id="party-search-input" placeholder="Search songs..." maxlength="100">
              </div>
              <div id="party-search-results" class="search-results" style="display: none;"></div>

              <h3 style="margin-top: 1.5rem;">Bucket (${state.bucket.length})</h3>
              <div id="party-bucket-list" class="bucket-list">
                ${state.bucket.length === 0 ? '<p class="empty-msg">No songs yet</p>' : ''}
              </div>
            </div>

            <!-- Users & Chat -->
            <div class="party-section" style="margin-top: 2rem;">
              ${isDJ ? `
                <div class="users-info">
                  <h3>👥 Users (${totalUsers})</h3>
                  <div class="users-list">
                    ${state.djs.map(u => `<div class="user-item dj"><span>👑</span> ${escapeHtml(u.partyName)}</div>`).join('')}
                    ${state.users.map(u => `<div class="user-item guest">${escapeHtml(u.partyName)}</div>`).join('')}
                  </div>
                </div>
              ` : `
                <p style="text-align: center; color: #999; font-size: 0.9rem;">👥 ${totalUsers} ${totalUsers === 1 ? 'person' : 'people'} in room</p>
              `}

              <h3 style="margin-top: 1.5rem;">💬 Chat</h3>
              <div id="party-chat-messages" class="chat-messages"></div>
              <div class="chat-input">
                <input type="text" id="party-chat-input" placeholder="Say something..." maxlength="200">
                <button id="party-chat-send-btn">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    _attachPartyEventListeners(container, roomId);
    _updateUIState(container);
  }

  function _attachPartyEventListeners(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';

    // Leave
    container.querySelector('.leave-btn')?.addEventListener('click', () => {
      if (confirm('Leave room?')) {
        PartyRoom.leaveRoom();
        Router.navigate('home');
      }
    });

    // DJ Controls
    if (isDJ) {
      container.querySelector('#party-prev-btn')?.addEventListener('click', () => PartyRoom.skipToPrevious?.());
      container.querySelector('#party-play-btn')?.addEventListener('click', () => {
        if (state.isPlaying) PartyRoom.pausePlayback?.();
        else PartyRoom.resumePlayback?.();
      });
      container.querySelector('#party-next-btn')?.addEventListener('click', () => PartyRoom.skipToNext?.());
    }

    // Search
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

    // Chat
    const chatInput = container.querySelector('#party-chat-input');
    const chatSendBtn = container.querySelector('#party-chat-send-btn');
    
    const sendMessage = () => {
      const text = chatInput.value.trim();
      if (text) {
        PartyRoom.sendMessage(text);
        chatInput.value = '';
      }
    };

    chatSendBtn?.addEventListener('click', sendMessage);
    chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    // Event listeners for updates
    document.addEventListener('party:messageNew', () => _updateChatUI(container));
    document.addEventListener('party:bucketUpdate', () => _updateBucketUI(container));
    document.addEventListener('party:stateChange', () => _updateUIState(container));
  }

  async function _performSearch(container, query) {
    const resultsDiv = container.querySelector('#party-search-results');
    resultsDiv.innerHTML = '<div class="skeleton-loading">Searching...</div>';
    resultsDiv.style.display = 'block';

    try {
      const tracks = await API.search(query, 10);
      
      if (!tracks || tracks.length === 0) {
        resultsDiv.innerHTML = '<div class="empty-msg">No results found</div>';
        return;
      }

      resultsDiv.innerHTML = tracks.map(track => `
        <div class="search-result-item">
          <div class="result-info">
            <p class="result-title">${escapeHtml(track.title)}</p>
            <p class="result-artist">${escapeHtml(track.artist)}</p>
          </div>
          <button class="btn-add result-add-btn" data-track-id="${track.id}" data-track='${JSON.stringify(track)}'>+</button>
        </div>
      `).join('');

      resultsDiv.querySelectorAll('.result-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const track = JSON.parse(e.target.dataset.track);
          PartyRoom.addToBucket(track);
          showToast(`Added "${escapeHtml(track.title)}" to bucket`);
          container.querySelector('#party-search-input').value = '';
          resultsDiv.style.display = 'none';
        });
      });
    } catch (err) {
      resultsDiv.innerHTML = '<div class="empty-msg">Search failed</div>';
    }
  }

  function _updateBucketUI(container) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';
    const bucketList = container.querySelector('#party-bucket-list');

    if (!bucketList) return;

    if (state.bucket.length === 0) {
      bucketList.innerHTML = '<p class="empty-msg">No songs yet</p>';
      return;
    }

    bucketList.innerHTML = state.bucket.map((item, idx) => `
      <div class="bucket-item">
        <div class="bucket-info">
          <p class="bucket-title">${escapeHtml(item.title)}</p>
          <p class="bucket-artist">${escapeHtml(item.artist)}</p>
          <p class="bucket-by">by ${escapeHtml(item.addedBy)}</p>
        </div>
        <div class="bucket-actions">
          ${isDJ ? `<button class="btn-small play-btn" data-id="${item.id}">▶</button>` : ''}
          <button class="btn-small remove-btn" data-id="${item.id}">✕</button>
        </div>
      </div>
    `).join('');

    if (isDJ) {
      bucketList.querySelectorAll('.play-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = state.bucket.find(s => s.id === btn.dataset.id);
          if (item) PartyRoom.playSong?.(item);
        });
      });
    }

    bucketList.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        PartyRoom.removeFromBucket?.(btn.dataset.id);
      });
    });
  }

  function _updateChatUI(container) {
    const state = PartyRoom.getState();
    const messages = container.querySelector('#party-chat-messages');

    if (!messages) return;

    messages.innerHTML = state.messages.map(msg => `
      <div class="chat-msg">
        <p class="chat-author"><strong>${escapeHtml(msg.partyName)}</strong></p>
        <p class="chat-text">${escapeHtml(msg.text)}</p>
      </div>
    `).join('');

    messages.scrollTop = messages.scrollHeight;
  }

  function _updateUIState(container) {
    const state = PartyRoom.getState();
    _updateBucketUI(container);
    _updateChatUI(container);
    
    if (state.currentSong) {
      const playBtn = container.querySelector('#party-play-btn');
      if (playBtn) playBtn.textContent = state.isPlaying ? '⏸' : '▶';
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { render };
})();
