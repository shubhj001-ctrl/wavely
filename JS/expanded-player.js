/**
 * expanded-player.js — Full-screen expanded player
 * 
 * Handles the full-screen player view that slides up from the mini player.
 * Syncs with the main Player module for playback control.
 */

const ExpandedPlayer = (() => {
  let isOpen = false;

  // ── Element Getters (lazy load to avoid DOM timing issues) ──

  function getElements() {
    return {
      expandedPlayer: document.getElementById('expanded-player'),
      closeBtn: document.getElementById('ep-close'),
      playerBar: document.getElementById('player-bar'),
      playBtn: document.getElementById('ep-play'),
      prevBtn: document.getElementById('ep-prev'),
      nextBtn: document.getElementById('ep-next'),
      shuffleBtn: document.getElementById('ep-shuffle'),
      repeatBtn: document.getElementById('ep-repeat'),
      title: document.getElementById('ep-title'),
      artist: document.getElementById('ep-artist'),
      artImg: document.getElementById('ep-art'),
      ambientImg: document.getElementById('ep-ambient-img'),
      likeBtn: document.getElementById('ep-like'),
      progBar: document.getElementById('ep-prog-bar'),
      progFill: document.getElementById('ep-prog-fill'),
      progThumb: document.getElementById('ep-prog-thumb'),
      timeCur: document.getElementById('ep-time-cur'),
      timeTotal: document.getElementById('ep-time-total'),
    };
  }

  // ── Open/Close Handler ──────────────────────────────────────

  function open() {
    if (isOpen) return;
    const el = getElements();
    if (!el.expandedPlayer) return;
    
    isOpen = true;
    el.expandedPlayer.classList.add('open');
    document.body.classList.add('expanded-player-open');
    refresh();
    console.log('[ExpandedPlayer] Opened');
  }

  function close() {
    if (!isOpen) return;
    const el = getElements();
    if (!el.expandedPlayer) return;
    
    isOpen = false;
    el.expandedPlayer.classList.remove('open');
    document.body.classList.remove('expanded-player-open');
    console.log('[ExpandedPlayer] Closed');
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  // ── UI Refresh ──────────────────────────────────────────────

  function refresh() {
    const el = getElements();
    const track = currentTrack();
    const isPlaying = State.isPlaying;

    if (!track) {
      if (el.title) el.title.textContent = '—';
      if (el.artist) el.artist.textContent = 'Select a track';
      if (el.artImg) el.artImg.innerHTML = '🎵';
      if (el.ambientImg) el.ambientImg.style.backgroundImage = '';
      if (el.playBtn?.querySelector('svg')) {
        el.playBtn.querySelector('svg').innerHTML = '<path d="M8 5v14l11-7z"/>';
      }
      return;
    }

    // Update track info
    if (el.title) el.title.textContent = track.title || '—';
    if (el.artist) el.artist.textContent = track.artist || 'Unknown';

    // Update artwork
    const artUrl = track.image || track.thumb;
    if (artUrl && el.artImg) {
      el.artImg.innerHTML = `<img src="${artUrl}" alt="Cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23666%22 font-size=%2246%22%3E🎵%3C/text%3E%3C/svg%3E'" />`;
      if (el.ambientImg) el.ambientImg.style.backgroundImage = `url('${artUrl}')`;
      el.artImg.classList.toggle('playing', isPlaying);
    } else if (el.artImg) {
      el.artImg.innerHTML = '🎵';
      if (el.ambientImg) el.ambientImg.style.backgroundImage = '';
    }

    // Update play button
    if (el.playBtn?.querySelector('svg')) {
      const playIcon = el.playBtn.querySelector('svg');
      if (isPlaying) {
        playIcon.innerHTML = '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>';
      } else {
        playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      }
    }

    // Update control states
    updateControlStates();

    // Update like button
    updateLikeBtn();

    // Update progress
    updateProgress();
  }

  function updateControlStates() {
    const el = getElements();
    if (el.shuffleBtn) el.shuffleBtn.classList.toggle('active', State.shuffle);
    if (el.repeatBtn) el.repeatBtn.classList.toggle('active', State.repeat !== 'off');
  }

  function updateLikeBtn() {
    const el = getElements();
    const track = currentTrack();
    if (!track || !el.likeBtn) {
      if (el.likeBtn) el.likeBtn.classList.remove('liked');
      return;
    }
    const isLiked = isLikedById(track.id);
    el.likeBtn.classList.toggle('liked', isLiked);
  }

  function updateProgress() {
    const el = getElements();
    const track = currentTrack();
    if (!track) {
      if (el.progFill) el.progFill.style.width = '0%';
      if (el.timeCur) el.timeCur.textContent = '0:00';
      if (el.timeTotal) el.timeTotal.textContent = '0:00';
      return;
    }

    const duration = track.duration || 0;
    const current = State.currentTime || 0;
    const percent = duration > 0 ? (current / duration) * 100 : 0;

    if (el.progFill) el.progFill.style.width = percent + '%';
    if (el.timeCur) el.timeCur.textContent = formatTime(current);
    if (el.timeTotal) el.timeTotal.textContent = formatTime(duration);
  }

  function formatTime(seconds) {
    if (!seconds || seconds === Infinity) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ── Event Listeners ─────────────────────────────────────────

  function attachListeners() {
    const el = getElements();
    if (!el.expandedPlayer) {
      console.warn('[ExpandedPlayer] DOM not ready');
      return;
    }

    // Open expanded player when clicking mini player (not controls)
    if (el.playerBar) {
      el.playerBar.addEventListener('click', (e) => {
        // Don't open if clicking on controls
        if (!e.target.closest('.player-controls') &&
            !e.target.closest('.player-right') &&
            !e.target.closest('.player-like')) {
          open();
        }
      });
    }

    // Close button
    if (el.closeBtn) {
      el.closeBtn.addEventListener('click', close);
    }

    // Backdrop click (click on the overlay itself)
    if (el.expandedPlayer) {
      el.expandedPlayer.addEventListener('click', (e) => {
        if (e.target === el.expandedPlayer) {
          close();
        }
      });
    }

    // Playback controls
    if (el.playBtn) el.playBtn.addEventListener('click', () => Player.toggle());
    if (el.prevBtn) el.prevBtn.addEventListener('click', () => Player.prev());
    if (el.nextBtn) el.nextBtn.addEventListener('click', () => Player.next());
    if (el.shuffleBtn) el.shuffleBtn.addEventListener('click', () => Player.toggleShuffle());
    if (el.repeatBtn) el.repeatBtn.addEventListener('click', () => Player.toggleRepeat());

    // Progress bar
    if (el.progBar) {
      el.progBar.addEventListener('click', (e) => {
        const rect = el.progBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const track = currentTrack();
        if (track && track.duration) {
          const newTime = percent * track.duration;
          Player.scrubTo(newTime);
        }
      });
    }

    // Like button
    if (el.likeBtn) {
      el.likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const track = currentTrack();
        if (!track) return;
        const liked = toggleLikeById(track.id);
        updateLikeBtn();
        showToast(liked ? 'Added to liked songs ❤️' : 'Removed from liked songs');
        updateLikedCount();
      });
    }

    // Listen for player state changes to refresh UI
    document.addEventListener('player:play', refresh);
    document.addEventListener('player:pause', refresh);
    document.addEventListener('player:next', refresh);
    document.addEventListener('player:prev', refresh);
    document.addEventListener('player:seek', refresh);
    document.addEventListener('player:timeupdate', updateProgress);
    document.addEventListener('player:trackchange', refresh);
    document.addEventListener('player:shuffle', updateControlStates);
    document.addEventListener('player:repeat', updateControlStates);

    console.log('[ExpandedPlayer] Event listeners attached');
  }

  // ── Initialize ──────────────────────────────────────────────

  function init() {
    attachListeners();
    console.log('[ExpandedPlayer] Initialized');
  }

  // Public API
  return {
    init,
    open,
    close,
    toggle,
    refresh,
    isOpen: () => isOpen,
  };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  ExpandedPlayer.init();
});
