/**
 * queue.js — Smart Queue & Auto-Next Engine
 *
 * When next is pressed, picks the best song based on:
 *  1. Same artist as current track
 *  2. Same language (punjabi/hindi/english etc.)
 *  3. Recent listening history artists
 *  4. Genre/mood matching
 *
 * Pre-warms a pool of 15 tracks in background while current song plays.
 * By the time user hits next, recommendations are ready instantly.
 */

const Queue = (() => {
  const POOL_SIZE = 15;

  let _pool     = [];
  let _poolKey  = '';
  let _building = false;

  function _firstArtist(track) {
    return track.artist.split(/[,&]/)[0].trim();
  }

  function _topHistoryArtists() {
    const counts = {};
    State.history.slice(-30).forEach(t => {
      const a = _firstArtist(t);
      counts[a] = (counts[a] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([a]) => a);
  }

  function _dominantLanguage() {
    const counts = {};
    State.history.slice(-20).forEach(t => {
      // Use dedicated language field first, fall back to genre
      const lang = (t.language || t.genre || '').toLowerCase();
      if (lang) counts[lang] = (counts[lang] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || '';
  }

  async function _buildPool(track) {
    const key = track.id + '::' + _firstArtist(track);
    if (_poolKey === key && _pool.length > 3) return;
    if (_building) return;

    _building = true;
    _poolKey  = key;

    const artist     = _firstArtist(track);
    const language   = _dominantLanguage() || (track.language || track.genre || '').toLowerCase();
    const topArtists = _topHistoryArtists();

    console.log('[Queue] Building smart pool | artist:', artist, '| lang:', language, '| history:', topArtists.join(', '));

    const recentIds = new Set([
      ...State.history.slice(-10).map(t => t.id),
      track.id,
    ]);

    const pool = [];
    const seen = new Set(recentIds);

    const add = (tracks) => {
      tracks.forEach(t => {
        if (!seen.has(t.id) && pool.length < POOL_SIZE) {
          seen.add(t.id);
          pool.push(t);
        }
      });
    };

    try {
      const [
        artistTracks,
        langTracks,
        hist1Tracks,
        hist2Tracks,
      ] = await Promise.all([
        API.search(artist, 10),
        // Guard: only call byGenre if it exists on the API object
        (language && typeof API.byGenre === 'function')
          ? API.byGenre(language, 8)
          : Promise.resolve([]),
        (topArtists[0] && topArtists[0] !== artist)
          ? API.search(topArtists[0], 6)
          : Promise.resolve([]),
        topArtists[1]
          ? API.search(topArtists[1], 5)
          : Promise.resolve([]),
      ]);

      // Priority: same artist first, then history artists, then language
      add(artistTracks.filter(t => t.id !== track.id));
      add(hist1Tracks);
      add(langTracks);
      add(hist2Tracks);

      // Keep artist tracks at front, lightly shuffle the rest
      const front = pool.slice(0, Math.min(3, artistTracks.length));
      const rest  = pool.slice(front.length).sort(() => Math.random() - 0.4);
      _pool = [...front, ...rest];

      console.log('[Queue] Pool ready (' + _pool.length + ' tracks):',
        _pool.slice(0, 4).map(t => t.artist + ' - ' + t.title).join(' | '));
    } catch (e) {
      console.warn('[Queue] Pool build error:', e);
      _pool = [];
    } finally {
      // Always reset the flag — even if an error is thrown mid-build
      _building = false;
    }
  }

  return {

    async getNext() {
      const track = currentTrack();
      if (track) _buildPool(track); // pre-warm for NEXT next

      // Shuffle mode — random from current queue
      if (State.shuffle && State.queue.length > 1) {
        let idx;
        do { idx = Math.floor(Math.random() * State.queue.length); }
        while (idx === State.queueIndex && State.queue.length > 1);
        State.queueIndex = idx;
        return State.queue[idx];
      }

      // Smart pool has tracks ready
      if (_pool.length > 0) {
        const next = _pool.shift();
        console.log('[Queue] Smart next: [' + (next.language || next.genre || 'unknown') + '] ' + next.artist + ' - ' + next.title);
        // Inject into queue so prev/next flow makes sense
        State.queue.splice(State.queueIndex + 1, 0, next);
        State.queueIndex++;
        return next;
      }

      // Fallback: next in current queue list
      const idx = State.queueIndex < State.queue.length - 1
        ? State.queueIndex + 1
        : 0;
      State.queueIndex = idx;
      return State.queue[idx];
    },

    prewarm(track) {
      if (track) setTimeout(() => _buildPool(track), 800);
    },

    clear() {
      _pool     = [];
      _poolKey  = '';
      _building = false;
    },

    peek() {
      return _pool.slice(0, 3);
    },
  };
})();