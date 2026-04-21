/**
 * app.js — App bootstrap
 *
 * Runs after all modules are loaded.
 * Wires up global event listeners and
 * navigates to the initial page.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── Initialize app state ───────────────────────────────────────
  // Load history from localStorage on startup
  loadHistoryFromStorage();
  clearExpiredHistory();

  // ── Sidebar nav ────────────────────────────────────────────────
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const page = btn.dataset.page;
      const partyState = PartyRoom?.getState?.();
      
      // Check if in party room and trying to navigate away
      if (partyState && partyState.roomId && page !== 'party') {
        e.preventDefault();
        showToast('⛔ Leave party room first');
        return;
      }
      
      Router.navigate(page);
    });
  });

  // ── Hamburger menu ─────────────────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobile-nav');
  
  hamburger?.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
    document.body.classList.toggle('menu-open');
  });

  // Close menu when clicking a nav item
  document.querySelectorAll('.mobile-nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const page = btn.dataset.page;
      const partyState = PartyRoom?.getState?.();
      
      // Check if in party room and trying to navigate away
      if (partyState && partyState.roomId && page !== 'party') {
        e.preventDefault();
        showToast('⛔ Leave party room first');
        return;
      }
      
      Router.navigate(page);
      mobileNav.classList.remove('open');
      document.body.classList.remove('menu-open');
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (mobileNav?.classList.contains('open') && 
        !mobileNav.contains(e.target) && 
        !hamburger.contains(e.target)) {
      mobileNav.classList.remove('open');
      document.body.classList.remove('menu-open');
    }
  });

  document.querySelectorAll('.playlist-item[data-playlist]').forEach(item => {
    item.addEventListener('click', () => {
      Router.navigate('library', { tab: item.dataset.playlist === 'liked' ? 'liked' : 'playlists' });
    });
  });

  // ── Player controls ────────────────────────────────────────────
  document.getElementById('play-btn')
    .addEventListener('click', () => Player.toggle());

  document.getElementById('prev-btn')
    .addEventListener('click', () => Player.prev());

  document.getElementById('next-btn')
    .addEventListener('click', () => Player.next());

  document.getElementById('shuffle-btn')
    .addEventListener('click', () => Player.toggleShuffle());

  document.getElementById('repeat-btn')
    .addEventListener('click', () => Player.toggleRepeat());

  document.getElementById('prog-bar')
    .addEventListener('click', e => Player.scrub(e));

  document.getElementById('vol-bar')
    .addEventListener('click', e => Player.setVolume(e));

  document.getElementById('player-like-btn')
    .addEventListener('click', () => {
      const t = currentTrack();
      if (!t) return;
      const liked = toggleLikeById(t.id);
      Player.refreshLikeBtn();
      showToast(liked ? 'Added to liked songs ❤️' : 'Removed from liked songs');
      updateLikedCount();
    });

  // ── Auto-refresh home page every 5 hours ────────────────────────
  // This ensures trending and new releases stay fresh
  window.shouldRefreshHome = () => {
    const FIVE_HOURS = 5 * 60 * 60 * 1000;
    const now = Date.now();
    if (now - State.lastHomeRefresh >= FIVE_HOURS) {
      State.lastHomeRefresh = now;
      return true;
    }
    return false;
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Don't fire when typing in an input
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        Player.toggle();
        break;
      case 'ArrowRight':
        if (e.metaKey || e.ctrlKey) { e.preventDefault(); Player.next(); }
        break;
      case 'ArrowLeft':
        if (e.metaKey || e.ctrlKey) { e.preventDefault(); Player.prev(); }
        break;
    }
  });

  // ── Initial page ───────────────────────────────────────────────
  State.lastHomeRefresh = Date.now();
  Router.navigate('home');
});
