/**
 * router.js — Client-side router
 *
 * Maps page names to their render functions.
 * Keeps a history stack so Router.back() works.
 * Updates the sidebar nav active state.
 */

const Router = (() => {
  const PAGES = {
    home:    HomePage,
    search:  SearchPage,
    artist:  ArtistPage,
    library: LibraryPage,
  };

  // Simple history stack (page name + params)
  const _stack = [];

  function _setNavActive(page) {
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });
  }

  async function navigate(page, params = {}) {
    const renderer = PAGES[page];
    if (!renderer) { console.warn('Unknown page:', page); return; }

    // Push to history stack
    _stack.push({ page, params });

    _setNavActive(page);

    const container = document.getElementById('main-content');
    await renderer.render(container, params);
  }

  function back() {
    if (_stack.length <= 1) { navigate('home'); return; }
    _stack.pop(); // remove current
    const prev = _stack[_stack.length - 1];
    _stack.pop(); // navigate will push it again
    navigate(prev.page, prev.params);
  }

  return { navigate, back };
})();
