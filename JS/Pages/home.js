/**
 * pages/home.js — Home page
 *
 * Shows: hero banner, genre grid, trending tracks, new releases.
 */

const GENRES = [
  { id: 'bollywood',  name: 'Bollywood',  emoji: '🎬', color: '#fde8d8', textColor: '#8b3a1a' },
  { id: 'punjabi',    name: 'Punjabi',    emoji: '🥁', color: '#fdf0d0', textColor: '#7a5a00' },
  { id: 'pop',        name: 'Pop',        emoji: '🌟', color: '#f5f0e4', textColor: '#8b7330' },
  { id: 'hiphop',     name: 'Hip-Hop',    emoji: '🎤', color: '#ede4f5', textColor: '#6b3d8b' },
  { id: 'rock',       name: 'Rock',       emoji: '🎸', color: '#f5e4e4', textColor: '#8b2d2d' },
  { id: 'electronic', name: 'Electronic', emoji: '⚡', color: '#e8e4f5', textColor: '#5a3d8b' },
  { id: 'tamil',      name: 'Tamil',      emoji: '🎵', color: '#e4f0e8', textColor: '#1a6b3a' },
  { id: 'kpop',       name: 'K-Pop',      emoji: '💫', color: '#fde8f0', textColor: '#8b1a4a' },
  { id: 'lofi',       name: 'Lo-Fi',      emoji: '☕', color: '#e8e4d8', textColor: '#5a4a2a' },
  { id: 'rnb',        name: 'R&B',        emoji: '🎷', color: '#f5e6d8', textColor: '#8b4513' },
  { id: 'classical',  name: 'Classical',  emoji: '🎻', color: '#f0ede4', textColor: '#6b5a2d' },
  { id: 'telugu',     name: 'Telugu',     emoji: '🎶', color: '#e4eef5', textColor: '#1a4a6b' },
];

const HomePage = (() => {

  function _greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  }

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
  }

  function _renderTrackOpts() {
    return {
      showAlbum: true,
      onPlay:    _onPlay,
      onArtist:  _onArtist,
      onLike:    _onLike,
      likedSet:  State.liked,
      activeId:  currentTrack()?.id,
    };
  }

  async function render(container) {
    container.innerHTML = `
      <div class="page" id="page-home">
        <div class="topbar">
          <h1>Good <em id="greeting-time">${_greeting()}</em></h1>
        </div>

        <!-- Hero -->
        <div class="hero" id="hero-banner">
          <div class="hero-bg"></div>
          <div class="hero-emoji">🎬</div>
          <div class="hero-content">
            <div class="hero-tag">Featured · Full songs via YouTube</div>
            <div class="hero-title">Bollywood,<br>English & more</div>
            <div class="hero-sub">Search any song — plays full audio free</div>
          </div>
        </div>

        <!-- Genres -->
        <div class="section-hd">
          <h2>Browse genres</h2>
          <a id="see-all-genres">See all</a>
        </div>
        <div class="genre-grid" id="home-genres"></div>

        <!-- Trending -->
        <div class="section-hd"><h2>Trending now</h2></div>
        <div class="track-list" id="trending-list"></div>

        <!-- New releases -->
        <div class="section-hd" style="margin-top:24px"><h2>New releases</h2></div>
        <div class="cards-grid" id="home-new-releases"></div>
      </div>`;

    // Genre grid (show first 8)
    Components.renderGenres(
      container.querySelector('#home-genres'),
      GENRES,
      (genreId) => Router.navigate('search', { query: genreId })
    );

    // See all genres → search page
    container.querySelector('#see-all-genres').addEventListener('click', () => {
      Router.navigate('search');
    });

    // Hero → play ambient
    container.querySelector('#hero-banner').addEventListener('click', () => {
      Router.navigate('search', { query: 'ambient' });
    });

    // Trending tracks
    const trendingEl = container.querySelector('#trending-list');
    Components.skeletonTracks(trendingEl);
    const trending = await API.trending(10);
    State.queue = trending;
    Components.renderTrackList(trendingEl, trending, _renderTrackOpts());

    // New releases cards
    const newEl = container.querySelector('#home-new-releases');
    newEl.innerHTML = Array(8).fill('<div class="card"><div class="card-art skeleton"></div><div class="skeleton" style="height:11px;margin-bottom:6px"></div><div class="skeleton" style="height:9px;width:70%"></div></div>').join('');
    const newTracks = await API.newReleases(8);
    Components.renderCards(newEl, newTracks, _onPlay);
  }

  return { render, GENRES };
})();
