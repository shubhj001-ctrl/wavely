/**
 * router.js — Client-side router
 *
 * Maps page names to their render functions.
 * Uses browser History API for proper back button support.
 * Keeps navigation history so back gestures follow the user's path.
 */

const Router = (() => {
  const PAGES = {
    home:            HomePage,
    search:          SearchPage,
    artist:          ArtistPage,
    library:         LibraryPage,
    'recently-played': RecentlyPlayedPage,
    party:           PartyPage,
  };

  function _setNavActive(page) {
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });
    document.querySelectorAll('.mobile-nav-item[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });
  }

  async function navigate(page, params = {}) {
    // Check if user is in party room
    const partyState = PartyRoom?.getState?.();
    if (partyState && partyState.roomId && page !== 'party') {
      // User is in party room, prevent navigation
      showToast('⛔ You must leave the party room first');
      return;
    }

    const renderer = PAGES[page];
    if (!renderer) { console.warn('Unknown page:', page); return; }

    _setNavActive(page);

    const container = document.getElementById('main-content');
    await renderer.render(container, params);

    // Push to browser history so back button works
    const state = { page, params };
    window.history.pushState(state, `${page}`, `#${page}${Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''}`);
  }

  function back() {
    window.history.back();
  }

  // Handle browser back button
  window.addEventListener('popstate', async (e) => {
    if (e.state && e.state.page) {
      const { page, params } = e.state;
      const renderer = PAGES[page];
      if (renderer) {
        _setNavActive(page);
        const container = document.getElementById('main-content');
        await renderer.render(container, params || {});
      }
    } else {
      // If no state, default to home
      const renderer = PAGES['home'];
      if (renderer) {
        _setNavActive('home');
        const container = document.getElementById('main-content');
        await renderer.render(container, {});
      }
    }
  });

  // Initialize on first load
  window.addEventListener('DOMContentLoaded', () => {
    const initialState = { page: 'home', params: {} };
    window.history.replaceState(initialState, 'home', '#home');
  });

  return { navigate, back };
})();
