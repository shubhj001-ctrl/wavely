/**
 * components.js — Shared rendering helpers
 *
 * Pure functions that return HTML strings or DOM nodes.
 * Nothing here touches State directly.
 */

const Components = (() => {

  /** Format seconds → "m:ss" */
  function fmt(s) {
    s = Math.round(s) || 0;
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /** HTML-escape a string */
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Render a track list into an element.
   * @param {HTMLElement} container
   * @param {Array} tracks
   * @param {Object} opts
   *   opts.showAlbum  {bool}     — show album column
   *   opts.onPlay     {Function} — called with (track, index, tracks)
   *   opts.onArtist   {Function} — called with (artistId, artistName)
   *   opts.onLike     {Function} — called with (trackId, btnEl)
   *   opts.likedSet   {Set}      — set of liked track IDs
   *   opts.activeId   {string}   — currently playing track ID
   */
  function renderTrackList(container, tracks, opts = {}) {
    if (!tracks.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">🎵</div>
          <p>No tracks found</p>
        </div>`;
      return;
    }

    const header = `
      <div class="track-list-hd">
        <span>#</span>
        <span>Title</span>
        <span>${opts.showAlbum ? 'Album' : ''}</span>
        <span style="text-align:right">Time</span>
      </div>`;

    const rows = tracks.map((t, i) => {
      const isPlaying = opts.activeId && opts.activeId === t.id;
      const isLiked   = opts.likedSet && opts.likedSet.has(t.id);

      return `
        <div class="track-row ${isPlaying ? 'playing' : ''}" data-track-index="${i}" id="tr-${esc(t.id)}">
          <div class="track-num">${i + 1}</div>
          <div class="track-info">
            <div class="track-thumb">
              ${t.image
                ? `<img src="${esc(t.image)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='🎵'"/>`
                : '🎵'}
            </div>
            <div>
              <div class="track-name">${esc(t.title)}</div>
              <button class="track-artist-link" data-artist-id="${esc(t.artistId)}" data-artist-name="${esc(t.artist)}">
                ${esc(t.artist)}
              </button>
            </div>
          </div>
          <div class="track-album-col">${opts.showAlbum ? esc(t.album || '—') : ''}</div>
          <div class="track-actions">
            <button class="icon-btn ${isLiked ? 'liked' : ''}" data-like-id="${esc(t.id)}" aria-label="Like">
              <svg width="13" height="13" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
            </button>
            <span class="track-dur">${fmt(t.duration)}</span>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = header + rows;

    // Bind events
    container.querySelectorAll('.track-row').forEach(row => {
      const idx = parseInt(row.dataset.trackIndex);
      const displayNum = row.querySelector('.track-num')?.textContent || '?';
      
      row.addEventListener('click', e => {
        if (e.target.closest('.icon-btn') || e.target.closest('.track-artist-link')) return;
        const clickedTrack = tracks[idx];
        console.log(`[Track Click] Clicked display #${displayNum}, data-index=${idx}, track="${clickedTrack?.title || 'UNDEFINED'}", set size=${tracks.length}`, {
          track: clickedTrack,
          index: idx,
          tracks: tracks
        });
        opts.onPlay && opts.onPlay(tracks[idx], idx, tracks);
      });
    });

    container.querySelectorAll('.track-artist-link').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        opts.onArtist && opts.onArtist(btn.dataset.artistId, btn.dataset.artistName);
      });
    });

    container.querySelectorAll('.icon-btn[data-like-id]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        opts.onLike && opts.onLike(btn.dataset.likeId, btn);
      });
    });
  }

  /** Render skeleton track rows for loading state */
  function skeletonTracks(container, n = 5) {
    container.innerHTML = Array(n).fill(0).map((_, i) => `
      <div class="track-row" style="pointer-events:none">
        <div class="skeleton" style="width:16px;height:16px;margin:auto;border-radius:50%"></div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="skeleton" style="width:36px;height:36px;border-radius:6px;flex-shrink:0"></div>
          <div>
            <div class="skeleton" style="width:${100 + i * 22}px;height:11px;margin-bottom:6px"></div>
            <div class="skeleton" style="width:${55 + i * 8}px;height:9px"></div>
          </div>
        </div>
        <div class="skeleton" style="width:60px;height:9px"></div>
        <div class="skeleton" style="width:28px;height:9px;margin-left:auto"></div>
      </div>`).join('');
  }

  /** Render a genre pill grid */
  function renderGenres(container, genres, onGenreClick) {
    container.innerHTML = genres.map(g => `
      <button
        class="genre-pill"
        style="background:${g.color};color:${g.textColor}"
        data-genre-id="${esc(g.id)}"
      >
        <div class="genre-pill-emoji">${g.emoji}</div>
        <span class="genre-pill-name">${esc(g.name)}</span>
      </button>`).join('');

    container.querySelectorAll('.genre-pill').forEach(btn => {
      btn.addEventListener('click', () => onGenreClick(btn.dataset.genreId, btn.textContent.trim()));
    });
  }

  /** Render a card grid of tracks */
  function renderCards(container, tracks, onPlay) {
    container.innerHTML = '';
    tracks.forEach((t, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-art">
          ${t.image
            ? `<img src="${esc(t.image)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='🎵'"/>`
            : '🎵'}
        </div>
        <div class="card-title">${esc(t.title)}</div>
        <div class="card-sub">${esc(t.artist)}</div>
        <button class="card-play" aria-label="Play">
          <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>`;

      card.addEventListener('click', e => {
        if (e.target.closest('.card-play')) return;
        onPlay(t, i, [t]);
      });
      card.querySelector('.card-play').addEventListener('click', e => {
        e.stopPropagation();
        onPlay(t, i, [t]);
      });

      container.appendChild(card);
    });
  }

  return { renderTrackList, skeletonTracks, renderGenres, renderCards, fmt, esc };
})();
