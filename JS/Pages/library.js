/**
 * pages/library.js — My Library page
 *
 * Three tabs: Liked Songs, Playlists, History.
 */

const LibraryPage = (() => {

  function _onPlay(track, index, tracks) {
    Player.play(track, tracks, index);
  }

  function _onArtist(artistId, artistName) {
    Router.navigate('artist', { artistId, artistName });
  }

  function _onLike(trackId, btn) {
    const liked = toggleLikeById(trackId);
    btn.classList.toggle('liked', liked);
    btn.querySelector('svg').setAttribute('fill', liked ? 'currentColor' : 'none');
    showToast(liked ? 'Added to liked songs ❤️' : 'Removed from liked songs');
    updateLikedCount();
    // Re-render liked tab if it's active
    const likedSection = document.getElementById('lib-liked');
    if (likedSection && likedSection.style.display !== 'none') {
      _renderLiked(document.getElementById('liked-tracks-list'));
    }
  }

  function _renderLiked(el) {
    const liked = State.queue.filter(t => State.liked.has(t.id));
    if (!liked.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="icon">❤️</div>
          <p>Songs you like will appear here.<br>Hit the heart on any track!</p>
        </div>`;
      return;
    }
    Components.renderTrackList(el, liked, {
      showAlbum: true,
      onPlay:    _onPlay,
      onArtist:  _onArtist,
      onLike:    _onLike,
      likedSet:  State.liked,
      activeId:  currentTrack()?.id,
    });
  }

  function _renderHistory(el) {
    const hist = State.history.slice().reverse().slice(0, 30);
    if (!hist.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="icon">🕐</div>
          <p>Your listening history will appear here</p>
        </div>`;
      return;
    }
    Components.renderTrackList(el, hist, {
      showAlbum: true,
      onPlay:    _onPlay,
      onArtist:  _onArtist,
      onLike:    _onLike,
      likedSet:  State.liked,
      activeId:  currentTrack()?.id,
    });
  }

  function _renderPlaylists(el) {
    if (!State.playlists.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="icon">🎵</div>
          <p>No playlists yet. Create one!</p>
        </div>`;
      return;
    }
    el.innerHTML = '';
    State.playlists.forEach(p => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-art" style="font-size:2.8rem">${p.emoji}</div>
        <div class="card-title">${Components.esc(p.name)}</div>
        <div class="card-sub">${p.tracks.length} song${p.tracks.length !== 1 ? 's' : ''}</div>`;
      el.appendChild(card);
    });
  }

  function _switchTab(tab, container) {
    container.querySelectorAll('.lib-tab').forEach(b => b.classList.remove('active'));
    container.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    ['liked', 'playlists', 'history'].forEach(t => {
      const s = document.getElementById('lib-' + t);
      if (s) s.style.display = t === tab ? '' : 'none';
    });

    // Lazy-render active tab
    if (tab === 'liked')     _renderLiked(document.getElementById('liked-tracks-list'));
    if (tab === 'history')   _renderHistory(document.getElementById('history-tracks-list'));
    if (tab === 'playlists') _renderPlaylists(document.getElementById('playlists-grid'));
  }

  function render(container, params = {}) {
    // Restore mini player and sidebar visibility when leaving party room
    const playerBar = document.getElementById('player-bar');
    const sidebar = document.querySelector('.sidebar');
    if (playerBar) {
      playerBar.style.display = '';
    }
    if (sidebar) {
      sidebar.style.display = '';
    }

    container.innerHTML = `
      <div class="page" id="page-library">
        <div class="topbar">
          <h1>My Library</h1>
        </div>

        <div class="lib-tabs">
          <button class="lib-tab active" data-tab="liked">Liked Songs</button>
          <button class="lib-tab" data-tab="playlists">Playlists</button>
          <button class="lib-tab" data-tab="history">History</button>
        </div>

        <!-- Liked -->
        <div id="lib-liked">
          <div class="track-list" id="liked-tracks-list"></div>
        </div>

        <!-- Playlists -->
        <div id="lib-playlists" style="display:none">
          <button class="create-playlist-btn" id="create-playlist-btn">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create new playlist
          </button>
          <div class="cards-grid" id="playlists-grid"></div>
        </div>

        <!-- History -->
        <div id="lib-history" style="display:none">
          <div class="track-list" id="history-tracks-list"></div>
        </div>
      </div>`;

    // Tab buttons
    container.querySelectorAll('.lib-tab').forEach(btn => {
      btn.addEventListener('click', () => _switchTab(btn.dataset.tab, container));
    });

    // Create playlist
    container.querySelector('#create-playlist-btn').addEventListener('click', () => {
      const name = prompt('Playlist name:');
      if (!name?.trim()) return;
      State.playlists.push({
        id:     Date.now().toString(),
        name:   name.trim(),
        emoji:  '🎵',
        tracks: [],
      });
      _renderPlaylists(document.getElementById('playlists-grid'));
      showToast(`"${name.trim()}" created`);
    });

    // Initial render (liked tab is default)
    _renderLiked(container.querySelector('#liked-tracks-list'));

    // Open to a specific tab if params say so
    if (params.tab) _switchTab(params.tab, container);
  }

  return { render };
})();
