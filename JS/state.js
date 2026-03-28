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

/** Add a track to history (deduped, max 50 entries) */
function addToHistory(track) {
  State.history = State.history.filter(t => t.id !== track.id);
  State.history.push(track);
  if (State.history.length > 50) State.history.shift();
}

/** Update the liked count badge in the sidebar */
function updateLikedCount() {
  const el = document.getElementById('liked-count');
  if (el) el.textContent = State.liked.size + ' songs';
}
