/**
 * pages/recently-played.js — Recently Played page
 *
 * Shows all tracks that have been played.
 * Data is persisted to localStorage and reset after 1 day.
 */

const RecentlyPlayedPage = (() => {

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
    // Check if history is expired
    clearExpiredHistory();

    const historyTracks = State.history || [];

    container.innerHTML = `
      <div class="page" id="page-recently-played">
        <div class="topbar">
          <h1>Recently <em>Played</em></h1>
          ${historyTracks.length > 0 ? '<button id="clear-history" style="padding: 6px 12px; background: var(--bg2); border: none; border-radius: 6px; color: var(--text2); cursor: pointer; font-size: 12px; transition: all 0.15s;" title="Clear history">Clear History</button>' : ''}
        </div>

        ${historyTracks.length === 0 
          ? `<div style="text-align: center; padding: 60px 20px; color: var(--text3);">
               <div style="font-size: 48px; margin-bottom: 16px;">🎵</div>
               <p>No recently played tracks yet.</p>
               <p style="font-size: 12px; margin-top: 8px;">Your played history will appear here and will reset after 1 day.</p>
             </div>`
          : `<div class="track-list" id="history-list"></div>`
        }
      </div>`;

    if (historyTracks.length > 0) {
      const listEl = container.querySelector('#history-list');
      // Show in reverse order (most recent first)
      const reversedHistory = [...historyTracks].reverse();
      Components.renderTrackList(listEl, reversedHistory, _renderTrackOpts());
    }

    // Clear history button
    const clearBtn = container.querySelector('#clear-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Clear all recently played tracks? This action cannot be undone.')) {
          State.history = [];
          localStorage.removeItem('mu_labz_history');
          showToast('History cleared');
          render(container); // Re-render
        }
      });
    }
  }

  return { render };
})();
