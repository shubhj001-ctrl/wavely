/**
 * pages/search.js — Search & browse page
 *
 * Shows genre grid by default.
 * On query input, fetches live Jamendo results.
 */

const SearchPage = (() => {
  let _debounceTimer = null;

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

  async function _doSearch(query, container) {
    const resultsSection = container.querySelector('#search-results-section');
    const resultsList    = container.querySelector('#search-results-list');
    const resultsHd      = container.querySelector('#search-results-hd');

    if (!query.trim()) {
      container.querySelector('#search-genre-section').style.display = '';
      resultsSection.style.display = 'none';
      return;
    }

    container.querySelector('#search-genre-section').style.display = 'none';
    resultsSection.style.display = '';
    resultsHd.textContent = `Results for "${query}"`;
    Components.skeletonTracks(resultsList, 6);

    const tracks = await API.search(query, 20);
    State.queue  = tracks;

    if (!tracks.length) {
      resultsList.innerHTML = `
        <div class="empty-state">
          <div class="icon">🔍</div>
          <p>No results found for "${Components.esc(query)}"</p>
        </div>`;
      return;
    }

    Components.renderTrackList(resultsList, tracks, {
      showAlbum: true,
      onPlay:    _onPlay,
      onArtist:  _onArtist,
      onLike:    _onLike,
      likedSet:  State.liked,
      activeId:  currentTrack()?.id,
    });
  }

  async function render(container, params = {}) {
    container.innerHTML = `
      <div class="page" id="page-search">
        <div class="topbar">
          <h1>Search</h1>
          <div class="search-wrap">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              class="search-box"
              id="search-input"
              type="text"
              placeholder="Artists, songs, genres…"
              autocomplete="off"
            />
          </div>
        </div>

        <!-- Genre browse (default view) -->
        <div id="search-genre-section">
          <div class="section-hd"><h2>Browse all genres</h2></div>
          <div class="genre-grid" id="search-genres"></div>
        </div>

        <!-- Results (shown when query is active) -->
        <div id="search-results-section" style="display:none">
          <div class="section-hd">
            <h2 id="search-results-hd">Results</h2>
          </div>
          <div class="track-list" id="search-results-list"></div>
        </div>
      </div>`;

    // Genre grid
    Components.renderGenres(
      container.querySelector('#search-genres'),
      HomePage.GENRES,
      (genreId) => {
        const input = container.querySelector('#search-input');
        input.value = genreId;
        _doSearch(genreId, container);
      }
    );

    // Search input
    const input = container.querySelector('#search-input');
    input.addEventListener('input', e => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => _doSearch(e.target.value, container), 450);
    });

    // Pre-fill query from router params
    if (params.query) {
      input.value = params.query;
      _doSearch(params.query, container);
    } else {
      input.focus();
    }
  }

  return { render };
})();
