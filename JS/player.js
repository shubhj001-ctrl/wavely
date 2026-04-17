/**
 * player.js — Dual engine player
 * JioSaavn → HTML5 audio (direct MP3, 320kbps)
 * iTunes/international → YouTube IFrame fallback
 * Smart next via Queue engine
 */

// Returns the currently active track from the queue
function currentTrack() {
  return State.queue[State.queueIndex] || null;
}

const Player = (() => {
  const audio = new Audio();
  audio.preload = 'metadata';

  let ytPlayer = null, ytReady = false, ytPendingId = null;
  let _useYT = false, progressTimer = null;
  let _candidates = [], _candidateIdx = 0;

  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = () => {
    ytReady = true;
    ytPlayer = new YT.Player('yt-player', {
      height: '0', width: '0',
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, rel: 0 },
      events: { onReady: _onYTReady, onStateChange: _onYTStateChange, onError: _onYTError },
    });
  };

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration || _useYT) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    _setProgress(pct);
    document.getElementById('time-cur').textContent   = Components.fmt(Math.floor(audio.currentTime));
    document.getElementById('time-total').textContent = Components.fmt(Math.floor(audio.duration));
  });

  audio.addEventListener('play',  () => { if (!_useYT) { State.playing = true;  _updatePlayIcon(true); } });
  audio.addEventListener('pause', () => { if (!_useYT) { State.playing = false; _updatePlayIcon(false); } });

  audio.addEventListener('ended', () => {
    if (_useYT) return;
    clearInterval(progressTimer);
    if (State.repeat) { audio.currentTime = 0; audio.play(); return; }
    Player.next();
  });

  // Only fall back to YouTube on network/src errors, not decode errors
  audio.addEventListener('error', () => {
    if (_useYT) return;
    const err = audio.error;
    if (err && (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || err.code === MediaError.MEDIA_ERR_NETWORK)) {
      console.warn('[MU LABZ] Audio src/network error, trying YouTube fallback. Code:', err.code);
      _playViaYouTube(currentTrack());
    } else {
      console.warn('[MU LABZ] Audio decode/unknown error, skipping to next. Code:', err?.code);
      setTimeout(() => Player.next(), 1000);
    }
  });

  function _onYTReady() { if (ytPendingId) { ytPlayer.loadVideoById(ytPendingId); ytPendingId = null; } }

  function _onYTStateChange(e) {
    if (!_useYT) return;
    if      (e.data === YT.PlayerState.PLAYING)  { State.playing = true;  _updatePlayIcon(true);  _startYTTimer(); }
    else if (e.data === YT.PlayerState.PAUSED)   { State.playing = false; _updatePlayIcon(false); clearInterval(progressTimer); }
    else if (e.data === YT.PlayerState.BUFFERING){ _updatePlayIcon(true); }
    else if (e.data === YT.PlayerState.ENDED) {
      clearInterval(progressTimer);
      if (State.repeat) { ytPlayer.seekTo(0); ytPlayer.playVideo(); return; }
      Player.next();
    }
  }

  function _onYTError(e) {
    if (!_useYT) return;
    if (e.data === 101 || e.data === 150) {
      _candidateIdx++;
      if (_candidateIdx < _candidates.length) { ytPlayer.loadVideoById(_candidates[_candidateIdx]); return; }
      showToast('Could not play this song');
      return;
    }
    showToast('Playback error');
    setTimeout(() => Player.next(), 1500);
  }

  const YT_KEY = 'AIzaSyBhUf3pJV-20MC9gAcVjTRkf2j2ed5YfMM';

  function _isoToSec(iso) {
    if (!iso) return 0;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    return m ? (parseInt(m[1]||0)*3600)+(parseInt(m[2]||0)*60)+parseInt(m[3]||0) : 0;
  }

  async function _findYTCandidates(track) {
    const title  = track.title.replace(/\(feat\..*?\)/gi,'').replace(/\[.*?\]/g,'').trim();
    const artist = track.artist.split(/[,&]/)[0].trim();
    const queries = [title+' '+artist+' - Topic', title+' '+artist+' official audio', title+' '+artist];
    const seen = new Set(), ids = [];
    for (const q of queries) {
      try {
        const sd = await (await fetch('https://www.googleapis.com/youtube/v3/search?'+new URLSearchParams({ part:'snippet',q,type:'video',maxResults:8,key:YT_KEY,videoCategoryId:'10' }))).json();
        if (!sd.items?.length) continue;
        const vids = sd.items.map(i=>i.id?.videoId).filter(Boolean);
        const dd   = await (await fetch('https://www.googleapis.com/youtube/v3/videos?'+new URLSearchParams({ part:'contentDetails',id:vids.join(','),key:YT_KEY }))).json();
        const dm   = {};
        (dd.items||[]).forEach(v=>{ dm[v.id]=_isoToSec(v.contentDetails?.duration); });
        sd.items.forEach(item => {
          const id = item.id?.videoId;
          if (!id||seen.has(id)) return;
          const vt = (item.snippet?.title||'').toLowerCase();
          const vc = (item.snippet?.channelTitle||'').toLowerCase();
          let sc = 0;
          if (vc.endsWith('- topic')) sc+=80;
          if (vt.includes(title.toLowerCase())) sc+=40;
          if (vt.includes(artist.toLowerCase())||vc.includes(artist.toLowerCase())) sc+=25;
          if (vt.includes('official audio')||vt.includes('official video')) sc+=20;
          if (vc.includes('vevo')) sc+=15;
          if (vt.includes('cover')&&!title.toLowerCase().includes('cover')) sc-=30;
          if (vt.includes('karaoke')||vt.includes('reaction')) sc-=50;
          const dur = dm[id]||0;
          if (track.duration>0&&dur>0) {
            const diff=Math.abs(dur-track.duration);
            if(diff<=10) sc+=30; else if(diff<=30) sc+=15; else if(diff>120) sc-=40;
          }
          seen.add(id);
          ids.push({id,sc});
        });
      } catch(e) {
        console.warn('[MU LABZ] YT search error:', e);
      }
      if (ids.length>=5) break;
    }
    return ids.sort((a,b)=>b.sc-a.sc).map(r=>r.id);
  }

  async function _playViaYouTube(track) {
    if (!track) return;
    _useYT = true;
    audio.pause();
    document.getElementById('player-artist').textContent = track.artist + ' · finding on YouTube…';
    _candidates   = await _findYTCandidates(track);
    _candidateIdx = 0;
    document.getElementById('player-artist').textContent = track.artist;
    if (!_candidates.length) { showToast('Song not found'); return; }
    if (!ytReady||!ytPlayer) { ytPendingId = _candidates[0]; return; }
    ytPlayer.loadVideoById(_candidates[0]);
  }

  function _startYTTimer() {
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (!ytPlayer?.getDuration) return;
      const dur=ytPlayer.getDuration()||0, cur=ytPlayer.getCurrentTime()||0;
      if (dur>0) {
        _setProgress((cur/dur)*100);
        document.getElementById('time-cur').textContent   = Components.fmt(Math.floor(cur));
        document.getElementById('time-total').textContent = Components.fmt(Math.floor(dur));
      }
    }, 500);
  }

  function _setProgress(pct) {
    document.getElementById('prog-fill').style.width = pct+'%';
    document.getElementById('prog-thumb').style.left = pct+'%';
  }

  function _updatePlayIcon(p) {
    document.getElementById('play-icon').innerHTML = p
      ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
  }

  function _updateLikeBtn() {
    const t=currentTrack(), btn=document.getElementById('player-like-btn');
    if (!t||!btn) return;
    const liked=State.liked.has(t.id);
    btn.classList.toggle('liked',liked);
    btn.querySelector('svg').setAttribute('fill',liked?'currentColor':'none');
  }

  function _updateTrackInfo(track) {
    document.getElementById('player-title').textContent  = track.title;
    document.getElementById('player-artist').textContent = track.artist;
    const art = document.getElementById('player-art');
    if (track.image) {
      art.innerHTML = '<img src="'+track.image+'" alt="" onerror="this.parentNode.innerHTML=\'🎵\'" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>';
    } else { art.textContent='🎵'; }
  }

  function _highlightRow(id) {
    document.querySelectorAll('.track-row').forEach(r=>r.classList.remove('playing'));
    document.getElementById('tr-'+id)?.classList.add('playing');
  }

  return {
    async play(track, queue, index) {
      if (!track) return;
      if (queue !== undefined) { 
        State.queue=queue; 
        State.queueIndex=index??0; 
        Queue.clear();
        console.log(`[Player.play] Queue set to ${queue.length} tracks, index set to ${State.queueIndex}, playing: ${track?.title}`);
      }
      _updateTrackInfo(track);
      _updateLikeBtn();
      _highlightRow(track.id);
      addToHistory(track);
      _setProgress(0);
      document.getElementById('time-cur').textContent   = '0:00';
      document.getElementById('time-total').textContent = Components.fmt(track.duration||0);
      Queue.prewarm(track);

      if (track.source==='jiosaavn' && track.audio) {
        _useYT=false;
        if (ytPlayer?.pauseVideo) ytPlayer.pauseVideo();
        clearInterval(progressTimer);
        audio.src=track.audio; audio.volume=State.volume; audio.currentTime=0;
        try { await audio.play(); console.log('[MU LABZ] ▶ JioSaavn:',track.title,'|',track.genre||'unknown'); }
        catch(e) { console.warn('[MU LABZ] Autoplay blocked:', e); showToast('Tap play to start'); }
      } else {
        audio.pause();
        await _playViaYouTube(track);
      }
    },

    toggle() {
      if (!currentTrack()) { if (State.queue.length) this.play(State.queue[0],State.queue,0); return; }
      if (_useYT) { if (!ytPlayer) return; State.playing?ytPlayer.pauseVideo():ytPlayer.playVideo(); }
      else { State.playing?audio.pause():audio.play().catch(()=>{}); }
    },

    prev() {
      if (State.queueIndex>0) { State.queueIndex--; this.play(State.queue[State.queueIndex]); }
      else if (currentTrack()) {
        if (_useYT) ytPlayer?.seekTo(0);
        else { audio.currentTime=0; audio.play().catch(()=>{}); }
      }
    },

    async next() {
      const next = await Queue.getNext();
      if (next) this.play(next);
    },

    scrub(e) {
      const bar=document.getElementById('prog-bar');
      const pct=Math.max(0,Math.min(1,(e.clientX-bar.getBoundingClientRect().left)/bar.offsetWidth));
      if (_useYT) { if (ytPlayer?.getDuration) ytPlayer.seekTo(pct*ytPlayer.getDuration(),true); }
      else { if (audio.duration) audio.currentTime=pct*audio.duration; }
      _setProgress(pct*100);
    },

    setVolume(e) {
      const bar=document.getElementById('vol-bar');
      const vol=Math.max(0,Math.min(1,(e.clientX-bar.getBoundingClientRect().left)/bar.offsetWidth));
      State.volume=vol; audio.volume=vol;
      if (ytPlayer?.setVolume) ytPlayer.setVolume(vol*100);
      document.getElementById('vol-fill').style.width=(vol*100)+'%';
    },

    toggleShuffle() { State.shuffle=!State.shuffle; document.getElementById('shuffle-btn').classList.toggle('active',State.shuffle); showToast(State.shuffle?'Shuffle on':'Shuffle off'); },
    toggleRepeat()  { State.repeat=!State.repeat;   document.getElementById('repeat-btn').classList.toggle('active',State.repeat);   showToast(State.repeat?'Repeat on':'Repeat off'); },
    refreshLikeBtn: _updateLikeBtn,
  };
})();

// Expose Player to global scope for party room
window.Player = Player;
console.log('[Player] ✓ Player module loaded and exposed to window');

let _toastTimer;
function showToast(msg) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}