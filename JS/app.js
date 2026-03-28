/**
 * app.js — App bootstrap
 *
 * Runs after all modules are loaded.
 * Wires up global event listeners and
 * navigates to the initial page.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── Sidebar nav ────────────────────────────────────────────────
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => Router.navigate(btn.dataset.page));
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
  Router.navigate('home');
});
