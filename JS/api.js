/**
 * api.js — JioSaavn (primary) + iTunes (metadata fallback)
 *
 * JioSaavn API via jiosaavn-api-privatecvc2.vercel.app
 *  - Returns direct MP3 stream URLs at 12/48/96/160/320kbps
 *  - Full Indian music library (Bollywood, Punjabi, Tamil, Telugu, etc.)
 *  - No embedding, no error 150, pure <audio> playback
 *
 * iTunes API used as fallback for international songs not on JioSaavn.
 */

const API = (() => {
  const SAAVN  = 'https://jiosaavn-api-privatecvc2.vercel.app';
  const ITUNES = 'https://itunes.apple.com';

  // Quality preference — try 320kbps first, fall back down
  const QUALITY_PREF = ['320kbps', '160kbps', '96kbps', '48kbps', '12kbps'];

  // ── JioSaavn normalizer ───────────────────────────────────────────

  function _bestUrl(downloadUrls) {
    if (!Array.isArray(downloadUrls) || !downloadUrls.length) return '';
    for (const q of QUALITY_PREF) {
      const found = downloadUrls.find(u => u.quality === q);
      if (found?.link) return found.link;
    }
    return downloadUrls[0]?.link || '';
  }

  function _bestImage(images) {
    if (!Array.isArray(images) || !images.length) return '';
    // Prefer 500x500, then 150x150, then first available
    const s500 = images.find(i => i.quality === '500x500');
    const s150 = images.find(i => i.quality === '150x150');
    return (s500 || s150 || images[images.length - 1])?.link || '';
  }

  function _normalizeSaavn(s) {
    const artists = (s.primaryArtists || s.featuredArtists || '').split(',')[0].trim();
    return {
      id:          String(s.id || Math.random()),
      title:       s.name        || 'Unknown Title',
      artist:      artists       || 'Unknown Artist',
      artistId:    String((s.primaryArtistsId || '').split(',')[0].trim() || ''),
      album:       s.album?.name || s.album   || '',
      albumId:     String(s.album?.id || ''),
      duration:    parseInt(s.duration || 0),
      audio:       _bestUrl(s.downloadUrl),
      image:       _bestImage(s.image),
      genre:       s.language    || '',
      trackNumber: 0,
      score:       100,
      source:      'jiosaavn',
    };
  }

  // ── iTunes normalizer (fallback) ──────────────────────────────────

  function _scoreTrack(raw, query) {
    if (!query) return 100;
    const q      = query.toLowerCase().trim();
    const title  = (raw.trackName     || '').toLowerCase();
    const artist = (raw.artistName    || '').toLowerCase();
    const album  = (raw.collectionName|| '').toLowerCase();
    let score    = 0;
    if (title === q)              score += 40;
    else if (title.startsWith(q)) score += 25;
    else if (title.includes(q))   score += 15;
    const words = q.split(/\s+/).filter(w => w.length > 1);
    words.forEach(w => {
      if (title.includes(w))  score += 8;
      if (artist.includes(w)) score += 8;
      if (album.includes(w))  score += 4;
    });
    if (artist === q)            score += 30;
    else if (artist.includes(q)) score += 15;
    if (raw.artworkUrl100)       score += 5;
    if (raw.previewUrl)          score += 5;
    if ((raw.trackTimeMillis||0) > 60000) score += 5;
    if ((raw.trackTimeMillis||0) < 15000 && raw.trackTimeMillis > 0) score -= 30;
    if (score === 0) score = -10;
    return score;
  }

  function _normalizeItunes(t, score = 100) {
    return {
      id:          'itunes_' + String(t.trackId || Math.random()),
      title:       t.trackName       || 'Unknown Title',
      artist:      t.artistName      || 'Unknown Artist',
      artistId:    'itunes_' + String(t.artistId || ''),
      album:       t.collectionName  || '',
      albumId:     'itunes_' + String(t.collectionId || ''),
      duration:    Math.round((t.trackTimeMillis || 0) / 1000),
      audio:       t.previewUrl      || '', // 30s preview only
      image:       (t.artworkUrl100  || '').replace('100x100bb', '300x300bb'),
      genre:       t.primaryGenreName|| '',
      trackNumber: t.trackNumber     || 0,
      score,
      source:      'itunes',
    };
  }

  function _normalizeAlbum(a) {
    return {
      id:         String(a.collectionId || a.id),
      name:       a.collectionName  || a.name  || 'Unknown Album',
      artist:     a.artistName      || a.artist || '',
      artistId:   String(a.artistId || ''),
      image:      a.image
        ? _bestImage(a.image)
        : (a.artworkUrl100 || '').replace('100x100bb', '300x300bb'),
      year:       a.releaseDate ? a.releaseDate.slice(0, 4) : (a.year || ''),
      genre:      a.primaryGenreName || a.language || '',
      trackCount: a.trackCount || a.songCount || 0,
      type:       'album',
      source:     a.id && !a.collectionId ? 'jiosaavn' : 'itunes',
    };
  }

  function _normalizeArtist(a) {
    return {
      id:    String(a.artistId || a.id),
      name:  a.artistName || a.name || 'Unknown Artist',
      genre: a.primaryGenreName || '',
      type:  'artist',
    };
  }

  // ── JioSaavn fetchers ─────────────────────────────────────────────

  async function _saavnSearch(query, limit = 20) {
    try {
      const res  = await fetch(`${SAAVN}/search/songs?query=${encodeURIComponent(query)}&page=1&limit=${limit}`);
      const data = await res.json();
      return data?.data?.results || [];
    } catch { return []; }
  }

  async function _saavnAlbumSearch(query, limit = 5) {
    try {
      const res  = await fetch(`${SAAVN}/search/albums?query=${encodeURIComponent(query)}&page=1&limit=${limit}`);
      const data = await res.json();
      return data?.data?.results || [];
    } catch { return []; }
  }

  async function _saavnAlbumTracks(albumId) {
    try {
      const res  = await fetch(`${SAAVN}/albums?id=${albumId}`);
      const data = await res.json();
      return data?.data?.songs || [];
    } catch { return []; }
  }

  async function _saavnArtistSongs(artistId, limit = 20) {
    try {
      const res  = await fetch(`${SAAVN}/artists/${artistId}/songs?page=1&songCount=${limit}`);
      const data = await res.json();
      return data?.data?.songs || [];
    } catch { return []; }
  }

  async function _saavnArtistAlbums(artistId, limit = 10) {
    try {
      const res  = await fetch(`${SAAVN}/artists/${artistId}/albums?page=1&albumCount=${limit}`);
      const data = await res.json();
      return data?.data?.albums || [];
    } catch { return []; }
  }

  // ── iTunes fetchers ───────────────────────────────────────────────

  async function _itunesSearch(params) {
    const p = new URLSearchParams({ country: 'IN', ...params });
    try {
      const res  = await fetch(`${ITUNES}/search?${p}`);
      const data = await res.json();
      return data.results || [];
    } catch { return []; }
  }

  async function _itunesLookup(id, entity = 'song', limit = 50) {
    const p = new URLSearchParams({ id, entity, limit });
    try {
      const res  = await fetch(`${ITUNES}/lookup?${p}`);
      const data = await res.json();
      return data.results || [];
    } catch { return []; }
  }

  function _itunesFilterScore(rawList, query, minScore = 30) {
    return rawList
      .filter(r => r.trackName)
      .map(r => ({ raw: r, score: _scoreTrack(r, query) }))
      .filter(({ score }) => score >= minScore)
      .sort((a, b) => b.score - a.score)
      .map(({ raw, score }) => _normalizeItunes(raw, score));
  }

  // ── Merge helper — deduplicate by title+artist ────────────────────
  // JioSaavn results take priority over iTunes results

  function _merge(saavnTracks, itunesTracks) {
    const seen = new Set();
    const key  = t => `${t.title.toLowerCase()}::${t.artist.toLowerCase().split(',')[0].trim()}`;
    const result = [];
    for (const t of saavnTracks) {
      const k = key(t);
      if (!seen.has(k)) { seen.add(k); result.push(t); }
    }
    for (const t of itunesTracks) {
      const k = key(t);
      if (!seen.has(k)) { seen.add(k); result.push(t); }
    }
    return result;
  }

  // ── Public API ────────────────────────────────────────────────────

  return {

    // Main search — JioSaavn first, iTunes fills gaps
    async search(query, limit = 25) {
      if (!query.trim()) return [];
      const [saavnRaw, itunesRaw] = await Promise.all([
        _saavnSearch(query, limit),
        _itunesSearch({ term: query, media: 'music', entity: 'song', limit: 10 }),
      ]);
      const saavn  = saavnRaw.map(_normalizeSaavn);
      const itunes = _itunesFilterScore(itunesRaw, query, 20);
      return _merge(saavn, itunes).slice(0, limit);
    },

    // Album tracks — JioSaavn first
    async albumTracks(albumId, source = 'jiosaavn') {
      if (source === 'jiosaavn') {
        const raw = await _saavnAlbumTracks(albumId);
        if (raw.length) return raw.map(_normalizeSaavn);
      }
      // iTunes fallback
      const raw = await _itunesLookup(albumId, 'song', 50);
      return raw
        .filter(r => r.trackName && r.wrapperType === 'track')
        .map(r => _normalizeItunes(r, 100))
        .sort((a, b) => a.trackNumber - b.trackNumber);
    },

    // Artist top songs
    async byArtist(artistId, limit = 20) {
      if (!artistId) return [];
      // JioSaavn artist ID (numeric string)
      if (!artistId.startsWith('itunes_')) {
        const raw = await _saavnArtistSongs(artistId, limit);
        if (raw.length) return raw.map(_normalizeSaavn);
      }
      // iTunes fallback
      const id  = artistId.replace('itunes_', '');
      const raw = await _itunesLookup(id, 'song', limit);
      return raw.filter(r => r.trackName).map(r => _normalizeItunes(r, 100));
    },

    // Artist albums
    async artistAlbums(artistId, limit = 10) {
      if (!artistId) return [];
      if (!artistId.startsWith('itunes_')) {
        const raw = await _saavnArtistAlbums(artistId, limit);
        if (raw.length) return raw.map(_normalizeAlbum);
      }
      const id  = artistId.replace('itunes_', '');
      const raw = await _itunesLookup(id, 'album', limit);
      return raw.filter(r => r.collectionName && r.wrapperType === 'collection').map(_normalizeAlbum);
    },

    // Suggestions dropdown — songs + albums + artists
    async suggestions(query) {
      if (!query.trim()) return { songs: [], albums: [], artists: [] };
      const [saavnSongs, saavnAlbums, itunesSongs, itunesArtists] = await Promise.all([
        _saavnSearch(query, 5),
        _saavnAlbumSearch(query, 4),
        _itunesSearch({ term: query, media: 'music', entity: 'song', limit: 5 }),
        _itunesSearch({ term: query, media: 'music', entity: 'musicArtist', attribute: 'artistTerm', limit: 3 }),
      ]);
      const saavnSongNorm  = saavnSongs.map(_normalizeSaavn);
      const itunesSongNorm = _itunesFilterScore(itunesSongs, query, 20);
      return {
        songs:   _merge(saavnSongNorm, itunesSongNorm).slice(0, 6),
        albums:  saavnAlbums.map(_normalizeAlbum),
        artists: itunesArtists.filter(r => r.artistName).map(_normalizeArtist),
      };
    },

    // Full search — album detection + merged results
    async fullSearch(query, limit = 30) {
      if (!query.trim()) return { tracks: [], context: null };

      const [saavnSongs, saavnAlbums, itunesRaw] = await Promise.all([
        _saavnSearch(query, limit),
        _saavnAlbumSearch(query, 3),
        _itunesSearch({ term: query, media: 'music', entity: 'song', limit: 10 }),
      ]);

      const songs  = _merge(saavnSongs.map(_normalizeSaavn), _itunesFilterScore(itunesRaw, query));
      const albums = saavnAlbums.map(_normalizeAlbum);

      // Album/soundtrack detection
      if (albums.length) {
        const topAlbum   = albums[0];
        const albumLower = topAlbum.name.toLowerCase();
        const queryLower = query.toLowerCase();
        const isMatch    = albumLower.includes(queryLower) || queryLower.includes(albumLower.split(' ')[0]);

        if (isMatch) {
          const albumTracks = await this.albumTracks(topAlbum.id, 'jiosaavn');
          if (albumTracks.length >= 3) {
            const albumIds = new Set(albumTracks.map(t => t.id));
            const extras   = songs.filter(s => !albumIds.has(s.id));
            return { tracks: [...albumTracks, ...extras.slice(0, 5)], context: { type: 'album', ...topAlbum }, albums };
          }
        }
      }

      return { tracks: songs, context: null, albums };
    },

    // Trending — use JioSaavn trending
    async trending(limit = 12) {
      // JioSaavn doesn't have a direct trending endpoint,
      // so we search popular terms
      const queries = ['arijit singh', 'trending hindi 2024', 'punjabi hits'];
      for (const q of queries) {
        const raw = await _saavnSearch(q, limit);
        if (raw.length) return raw.map(_normalizeSaavn);
      }
      return [];
    },

    // New releases
    async newReleases(limit = 8) {
      const raw = await _saavnSearch('new releases 2024', limit * 2);
      return raw.sort(() => Math.random() - 0.5).slice(0, limit).map(_normalizeSaavn);
    },

    // Genre search
    async byGenre(genre, limit = 15) {
      const QUERIES = {
        bollywood:  'bollywood hits hindi',
        punjabi:    'punjabi songs 2024',
        pop:        'english pop hits',
        hiphop:     'hip hop rap',
        rock:       'rock songs',
        electronic: 'electronic EDM',
        tamil:      'tamil songs',
        kpop:       'kpop',
        lofi:       'lofi chill',
        rnb:        'r&b soul',
        classical:  'classical instrumental',
        telugu:     'telugu songs',
      };
      const raw = await _saavnSearch(QUERIES[genre] || genre, limit);
      return raw.map(_normalizeSaavn);
    },

    // Search albums
    async searchAlbums(query, limit = 8) {
      const raw = await _saavnAlbumSearch(query, limit);
      return raw.map(_normalizeAlbum);
    },

    // Search artists (iTunes — JioSaavn has no artist search endpoint)
    async searchArtists(query, limit = 5) {
      const raw = await _itunesSearch({
        term: query, media: 'music', entity: 'musicArtist',
        attribute: 'artistTerm', limit,
      });
      return raw.filter(r => r.artistName).map(_normalizeArtist);
    },
  };
})();

const DEMO_TRACKS = [
  { id: 'd1', title: 'Kesariya',       artist: 'Arijit Singh', artistId: '', album: 'Brahmastra',  duration: 264, audio: '', image: '', genre: 'hindi', trackNumber: 1, score: 100, source: 'jiosaavn' },
  { id: 'd2', title: 'Tum Hi Ho',       artist: 'Arijit Singh', artistId: '', album: 'Aashiqui 2',  duration: 261, audio: '', image: '', genre: 'hindi', trackNumber: 1, score: 100, source: 'jiosaavn' },
  { id: 'd3', title: 'Blinding Lights', artist: 'The Weeknd',   artistId: '', album: 'After Hours', duration: 200, audio: '', image: '', genre: 'english', trackNumber: 1, score: 100, source: 'itunes' },
  { id: 'd4', title: 'Shape of You',    artist: 'Ed Sheeran',   artistId: '', album: '÷',           duration: 234, audio: '', image: '', genre: 'english', trackNumber: 1, score: 100, source: 'itunes' },
];