/**
 * Pages/party.js — Party Room page renderer
 */

const PartyPage = (() => {
  let currentRoom = null;
  let listeners = {};

  function render(container, params = {}) {
    container.innerHTML = '';

    // Clean up old listeners
    Object.values(listeners).forEach(listener => {
      document.removeEventListener(listener.event, listener.handler);
    });
    listeners = {};

    // If we have a roomId in params, join that room
    if (params.roomId) {
      _showPartyInterface(container, params.roomId);
    } else if (PartyRoom && PartyRoom.getState && PartyRoom.getState().roomId) {
      // Already in a room
      _showPartyInterface(container, PartyRoom.getState().roomId);
    } else {
      // Not in a room, show entry interface
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

    const createBtn = container.querySelector('.create-room-btn');
    const joinBtn = container.querySelector('.join-room-btn');

    createBtn?.addEventListener('click', () => _showCreateRoomModal(container));
    joinBtn?.addEventListener('click', () => _showJoinRoomModal(container));
  }

  function _showCreateRoomModal(container) {
    const modal = document.createElement('div');
    modal.className = 'party-modal-overlay';
    modal.innerHTML = `
      <div class="party-modal">
        <h2>Create Party Room</h2>

        <div class="form-group">
          <label>Party Name</label>
          <input type="text" id="party-name-input" placeholder="How do you want to be called?" maxlength="50">
        </div>

        <div class="form-group">
          <label>Room Name</label>
          <input type="text" id="room-name-input" placeholder="e.g., Chill Vibes Session" maxlength="100">
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
              <span>Public (anyone can join)</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="room-type" value="private">
              <span>Private (password protected)</span>
            </label>
          </div>
        </div>

        <div class="form-group" id="password-group" style="display: none;">
          <label>Password</label>
          <input type="password" id="password-input" placeholder="Set a password" maxlength="50">
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
        showToast('Please fill in all fields');
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
          <input type="text" id="party-name-input" placeholder="How do you want to be called?" maxlength="50">
        </div>

        <div class="form-group">
          <label>Room Code</label>
          <input type="text" id="room-id-input" placeholder="Paste room code" maxlength="100">
        </div>

        <div class="form-group" id="password-group" style="display: none;">
          <label>Password</label>
          <input type="password" id="password-input" placeholder="Enter room password" maxlength="50">
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
        showToast('Please fill in all fields');
        return;
      }

      // Extract room ID from link if it's a full URL
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
          showToast('Failed to join room: ' + (e.detail.message || 'Unknown error'));
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

    container.innerHTML = `
      <div class="party-room-container">
        <div class="party-header">
          <div class="party-title">
            <h1>${escapeHtml(state.roomName)}</h1>
            <p class="room-code">Code: <code>${roomId.substring(0, 8)}</code></p>
          </div>
          <button class="party-leave-btn">Leave</button>
        </div>

        <div class="party-main">
          <div class="party-center">
            <div class="party-player">
              ${state.currentSong ? `
                <div class="party-now-playing">
                  <div class="now-playing-cover">
                    <img src="${state.currentSong.image || 'assets/placeholder.png'}" alt="Cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23666%22 font-size=%2246%22%3E🎵%3C/text%3E%3C/svg%3E'">
                  </div>
                  <div class="now-playing-info">
                    <h2>${escapeHtml(state.currentSong.title)}</h2>
                    <p>${escapeHtml(state.currentSong.artist)}</p>
                  </div>
                </div>
              ` : `
                <div class="party-no-song">
                  <p>♪ No song playing yet. Add songs to the bucket list!</p>
                </div>
              `}

              ${isDJ ? `
                <div class="party-controls-dj">
                  <button class="btn-control" id="party-prev-btn" title="Previous">⏮</button>
                  <button class="btn-control btn-control-large" id="party-play-btn" title="Play/Pause">▶</button>
                  <button class="btn-control" id="party-next-btn" title="Next">⏭</button>
                </div>
              ` : ''}

              <div class="party-progress">
                <div class="progress-bar">
                  <div class="progress-fill"></div>
                </div>
                <div class="progress-time">
                  <span id="party-time-cur">0:00</span>
                  <span id="party-time-total">0:00</span>
                </div>
              </div>
            </div>
          </div>

          <div class="party-sides">
            <div class="party-panel party-panel-left">
              <div class="party-users-section">
                <h3>Users (${state.users.length + state.djs.length})</h3>
                <div class="party-users-list">
                  ${state.djs.map(u => `
                    <div class="party-user dj">
                      <span class="user-role">👑</span>
                      <span>${escapeHtml(u.partyName)}</span>
                    </div>
                  `).join('')}
                  ${state.users.map(u => `
                    <div class="party-user">
                      <span class="user-role"></span>
                      <span>${escapeHtml(u.partyName)}</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="party-bucket-section">
                <h3>Bucket List</h3>
                <div class="bucket-search">
                  <input type="text" id="bucket-search-input" placeholder="Search & add...">
                  <button id="bucket-search-btn">+</button>
                </div>
                <div class="party-bucket-list" id="party-bucket-list">
                  ${state.bucket.length === 0 ? `<p class="empty-message">No songs yet</p>` : state.bucket.map((item) => `
                    <div class="bucket-item">
                      <div class="bucket-item-info">
                        <p class="bucket-item-title">${escapeHtml(item.title)}</p>
                        <p class="bucket-item-artist">${escapeHtml(item.artist)}</p>
                      </div>
                      ${isDJ ? `<button class="btn-small play-bucket-btn" data-id="${item.id}">▶️</button>` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>

            <div class="party-panel party-panel-right">
              <h3>Chat</h3>
              <div class="party-chat-messages" id="party-chat-messages">
                ${state.messages.length === 0 ? `<p class="empty-message">No messages</p>` : state.messages.map(msg => `
                  <div class="chat-message">
                    <p class="chat-author"><strong>${escapeHtml(msg.partyName)}</strong></p>
                    <p class="chat-text">${escapeHtml(msg.text)}</p>
                  </div>
                `).join('')}
              </div>
              <div class="party-chat-input">
                <input type="text" id="party-chat-input" placeholder="Say something..." maxlength="200">
                <button id="party-chat-send-btn">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    _attachEventListeners(container, roomId);
  }

  function _attachEventListeners(container, roomId) {
    const state = PartyRoom.getState();
    const isDJ = state.role === 'dj';

    // Leave button
    container.querySelector('.party-leave-btn')?.addEventListener('click', () => {
      if (confirm('Leave this party room?')) {
        PartyRoom.leaveRoom();
        Router.navigate('home');
      }
    });

    // DJ controls
    if (isDJ) {
      container.querySelector('#party-play-btn')?.addEventListener('click', () => {
        if (state.isPlaying) {
          PartyRoom.pausePlayback();
        } else if (state.currentSong) {
          PartyRoom.resumePlayback();
        }
      });

      container.querySelector('#party-next-btn')?.addEventListener('click', () => {
        PartyRoom.skipToNext();
      });

      container.querySelector('#party-prev-btn')?.addEventListener('click', () => {
        PartyRoom.skipToPrevious();
      });
    }

    // Bucket search
    const searchInput = container.querySelector('#bucket-search-input');
    const searchBtn = container.querySelector('#bucket-search-btn');

    searchBtn?.addEventListener('click', async () => {
      const query = searchInput.value.trim();
      if (!query) return;

      showToast('Searching...');
      try {
        const results = await API.search(query, 1);
        if (results && results.length > 0) {
          const track = results[0];
          PartyRoom.addToBucket(track);
          searchInput.value = '';
          showToast('Added to bucket 🎵');
        } else {
          showToast('No songs found');
        }
      } catch (err) {
        showToast('Search failed');
      }
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

    // Setup update listeners
    const handlers = {
      'party:messageNew': () => _updateChatList(container),
      'party:stateChange': () => _updatePlayerUI(container),
      'party:bucketUpdate': () => _updateBucketUI(container),
      'party:usersUpdate': () => _updateUserList(container)
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      listeners[event] = { event, handler };
      document.addEventListener(event, handler);
    });
  }

  function _updatePlayerUI(container) {
    const state = PartyRoom.getState();
    const nowPlaying = container.querySelector('.party-now-playing');
    const noSong = container.querySelector('.party-no-song');
    const playBtn = container.querySelector('#party-play-btn');
    const progressFill = container.querySelector('.progress-fill');
    
    if (state.currentSong && nowPlaying) {
      nowPlaying.innerHTML = `
        <div class="now-playing-cover">
          <img src="${state.currentSong.image || 'assets/placeholder.png'}" alt="Cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23666%22 font-size=%2246%22%3E🎵%3C/text%3E%3C/svg%3E'">
        </div>
        <div class="now-playing-info">
          <h2>${escapeHtml(state.currentSong.title)}</h2>
          <p>${escapeHtml(state.currentSong.artist)}</p>
        </div>
      `;
    }
    
    if (playBtn) {
      playBtn.textContent = state.isPlaying ? '⏸' : '▶';
    }
    
    if (progressFill && state.currentSong) {
      const duration = state.currentSong.duration || 180;
      const progress = state.isPlaying ? (state.currentTime / duration) * 100 : 0;
      progressFill.style.width = Math.min(progress, 100) + '%';
    }
  }

  function _updateBucketUI(container) {
    const state = PartyRoom.getState();
    const bucketList = container.querySelector('#party-bucket-list');
    const isDJ = state.role === 'dj';

    if (!bucketList) return;

    if (state.bucket.length === 0) {
      bucketList.innerHTML = '<p class="empty-message">No songs yet</p>';
      return;
    }

    bucketList.innerHTML = state.bucket.map((item) => `
      <div class="bucket-item">
        <div class="bucket-item-info">
          <p class="bucket-item-title">${escapeHtml(item.title)}</p>
          <p class="bucket-item-artist">${escapeHtml(item.artist)}</p>
        </div>
        ${isDJ ? `<button class="btn-small play-bucket-btn" data-id="${item.id}">▶️</button>` : ''}
      </div>
    `).join('');
  }

  function _updateChatList(container) {
    const state = PartyRoom.getState();
    const messages = container.querySelector('#party-chat-messages');

    if (!messages || state.messages.length === 0) return;

    messages.innerHTML = state.messages.map(msg => `
      <div class="chat-message">
        <p class="chat-author"><strong>${escapeHtml(msg.partyName)}</strong></p>
        <p class="chat-text">${escapeHtml(msg.text)}</p>
      </div>
    `).join('');

    messages.scrollTop = messages.scrollHeight;
  }

  function _updateUserList(container) {
    const state = PartyRoom.getState();
    const usersList = container.querySelector('.party-users-list');

    if (!usersList) return;

    usersList.innerHTML = `
      ${state.djs.map(u => `
        <div class="party-user dj">
          <span class="user-role">👑</span>
          <span>${escapeHtml(u.partyName)}</span>
        </div>
      `).join('')}
      ${state.users.map(u => `
        <div class="party-user">
          <span class="user-role"></span>
          <span>${escapeHtml(u.partyName)}</span>
        </div>
      `).join('')}
    `;

    const header = container.querySelector('.party-users-section h3');
    if (header) {
      header.textContent = `Users (${state.users.length + state.djs.length})`;
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
