/**
 * pages/home.js — Home page
 *
 * Shows: Trending tracks, New releases, Browse genres
 */

const GENRES = [
  { id: 'bollywood',  name: 'Bollywood',  emoji: '🎬' },
  { id: 'punjabi',    name: 'Punjabi',    emoji: '🥁' },
  { id: 'pop',        name: 'Pop',        emoji: '🌟' },
  { id: 'hiphop',     name: 'Hip-Hop',    emoji: '🎤' },
  { id: 'rock',       name: 'Rock',       emoji: '🎸' },
  { id: 'electronic', name: 'Electronic', emoji: '⚡' },
  { id: 'tamil',      name: 'Tamil',      emoji: '🎵' },
  { id: 'kpop',       name: 'K-Pop',      emoji: '💫' },
  { id: 'lofi',       name: 'Lo-Fi',      emoji: '☕' },
  { id: 'rnb',        name: 'R&B',        emoji: '🎷' },
  { id: 'classical',  name: 'Classical',  emoji: '🎻' },
  { id: 'telugu',     name: 'Telugu',     emoji: '🎶' },
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
          <h1>Now Playing</h1>
        </div>

        <!-- Trending -->
        <div class="section-hd"><h2>Trending now</h2></div>
        <div class="track-list" id="trending-list"></div>

        <!-- New releases -->
        <div class="section-hd"><h2>New releases</h2></div>
        <div class="cards-grid" id="home-new-releases"></div>

        <!-- Genres -->
        <div class="section-hd">
          <h2>Browse</h2>
        </div>
        <div class="genre-grid" id="home-genres"></div>
      </div>`;

    // Genre grid (show first 8)
    Components.renderGenres(
      container.querySelector('#home-genres'),
      GENRES,
      (genreId) => Router.navigate('search', { query: genreId })
    );

    // Trending tracks (refresh every 5 hours by cache-busting)
    const trendingEl = container.querySelector('#trending-list');
    Components.skeletonTracks(trendingEl);
    const shouldRefresh = window.shouldRefreshHome?.();
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
