/**
 * state.js — Single source of truth for app state
 *
 * All modules read from and write to this object.
 * Never mutate state directly from UI code —
 * use the helper functions below instead.
 */

const State = {
  // Playback
  queue:      [],       // Array of track objects currently in play context
  queueIndex: -1,       // Index of currently playing track in queue
  playing:    false,    // Is audio currently playing?
  shuffle:    false,
  repeat:     false,
  volume:     0.7,

  // Library
  liked:     new Set(), // Set of liked track IDs
  history:   [],        // Recently played tracks (most recent last)
  playlists: [
    { id: 'chill', name: 'Chill Vibes',  emoji: '🌿', tracks: [] },
    { id: 'focus', name: 'Focus Flow',   emoji: '🎯', tracks: [] },
  ],

  // Navigation
  prevPage: 'home',

  // Refresh tracking (for auto-refresh features)
  lastHomeRefresh: 0,  // Timestamp of last home page refresh
};

// ── State helpers ───────────────────────────────────────────────────

/** Returns the currently playing track object, or null */
function currentTrack() {
  return State.queue[State.queueIndex] || null;
}

/** Toggle like status for a track ID. Returns new liked state (bool). */
function toggleLikeById(id) {
  if (State.liked.has(id)) {
    State.liked.delete(id);
    return false;
  } else {
    State.liked.add(id);
    return true;
  }
}

/** Add a track to history (deduped, max 50 entries) AND persist to localStorage */
function addToHistory(track) {
  if (!track || !track.id) return;
  
  State.history = State.history.filter(t => t.id !== track.id);
  State.history.push(track);
  if (State.history.length > 50) State.history.shift();
  
  // Persist to localStorage with timestamp
  const historyData = {
    timestamp: Date.now(),
    tracks: State.history.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      image: t.image,
      duration: t.duration,
      audio: t.audio,
      genre: t.genre,
      source: t.source,
    }))
  };
  localStorage.setItem('mu_labz_history', JSON.stringify(historyData));
}

/** Load history from localStorage and check if it's expired (1 day = 86400000ms) */
function loadHistoryFromStorage() {
  const stored = localStorage.getItem('mu_labz_history');
  if (!stored) return;
  
  try {
    const data = JSON.parse(stored);
    const age = Date.now() - data.timestamp;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    
    if (age < ONE_DAY) {
      State.history = data.tracks || [];
    } else {
      // History expired, clear it
      localStorage.removeItem('mu_labz_history');
      State.history = [];
    }
  } catch (e) {
    console.warn('[MU LABZ] Failed to load history from storage:', e);
  }
}

/** Clear old history if it's more than 1 day old */
function clearExpiredHistory() {
  const stored = localStorage.getItem('mu_labz_history');
  if (!stored) return;
  
  try {
    const data = JSON.parse(stored);
    const age = Date.now() - data.timestamp;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    
    if (age >= ONE_DAY) {
      localStorage.removeItem('mu_labz_history');
      State.history = [];
    }
  } catch (e) {
    console.warn('[MU LABZ] Failed to check history expiry:', e);
  }
}

/** Update the liked count badge in the sidebar */
function updateLikedCount() {
  const el = document.getElementById('liked-count');
  if (el) el.textContent = State.liked.size + ' songs';
}
