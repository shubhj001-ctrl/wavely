/**
 * pages/artist.js — Artist detail page
 *
 * Loaded when user clicks an artist name anywhere in the app.
 * Fetches the artist's tracks from Jamendo.
 */

const ArtistPage = (() => {

  function _onPlay(track, index, tracks) {
    Player.play(track, tracks, index);
  }

  function _onLike(trackId, btn) {
    const liked = toggleLikeById(trackId);
    btn.classList.toggle('liked', liked);
    btn.querySelector('svg').setAttribute('fill', liked ? 'currentColor' : 'none');
    showToast(liked ? 'Added to liked songs ❤️' : 'Removed from liked songs');
    updateLikedCount();
  }

  async function render(container, params = {}) {
    // Restore mini player and sidebar visibility when leaving party room
    const playerBar = document.getElementById('player-bar');
    const sidebar = document.querySelector('.sidebar');
    if (playerBar) {
      playerBar.style.display = '';
    }
    if (sidebar) {
      sidebar.style.display = '';
    }

    const { artistId, artistName = 'Artist' } = params;

    container.innerHTML = `
      <div class="page" id="page-artist">
        <div class="topbar">
          <button class="back-btn" id="back-btn">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
        </div>

        <!-- Artist hero -->
        <div class="artist-hero">
          <div class="artist-hero-decoration" id="artist-decoration">🎵</div>
          <div class="artist-hero-overlay"></div>
          <div class="artist-info">
            <div class="artist-tag">Artist</div>
            <div class="artist-name" id="artist-name-display">${Components.esc(artistName)}</div>
            <div class="artist-meta" id="artist-meta">Loading tracks…</div>
          </div>
        </div>

        <!-- Tracks -->
        <div class="section-hd"><h2>Popular tracks</h2></div>
        <div class="track-list" id="artist-tracks-list"></div>
      </div>`;

    // Back button
    container.querySelector('#back-btn').addEventListener('click', () => {
      Router.back();
    });

    // Load tracks
    const tracksList = container.querySelector('#artist-tracks-list');
    Components.skeletonTracks(tracksList, 6);

    const tracks = artistId
      ? await API.byArtist(artistId, 12)
      : DEMO_TRACKS.slice(0, 8);

    State.queue = tracks;

    container.querySelector('#artist-meta').textContent =
      `${tracks.length} track${tracks.length !== 1 ? 's' : ''} on MU LABZ`;

    // Pick a fun emoji for the decoration
    const emojis = ['🎵','🎶','🎸','🎹','🎺','🎻','🥁','🎤'];
    container.querySelector('#artist-decoration').textContent =
      emojis[Math.abs(artistName.charCodeAt(0)) % emojis.length];

    Components.renderTrackList(tracksList, tracks, {
      showAlbum: false,
      onPlay:    _onPlay,
      onArtist:  () => {}, // no nested artist nav
      onLike:    _onLike,
      likedSet:  State.liked,
      activeId:  currentTrack()?.id,
    });
  }

  return { render };
})();
