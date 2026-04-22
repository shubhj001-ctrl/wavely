# Party Room Track Playback & Queue Management Analysis

## Overview
This document outlines how the Wavely party room handles track playback, queue (bucket) management, and the next track logic.

---

## 1. BACKEND: Next Track Logic (server.js)

### Location: `backend/server.js` - Lines 541-564

```javascript
// DJ Controls - Skip to Next
socket.on('playback:next', (data) => {
  const { roomId } = data;
  const room = getRoom(roomId);
  if (!room) return;

  // Get next from bucket
  if (room.bucket.length > 0) {
    const nextItem = room.bucket.shift();  // Remove first item from queue
    room.currentSong = {
      id: nextItem.songId,
      title: nextItem.title,
      artist: nextItem.artist,
      image: nextItem.image,
    };
  } else {
    room.currentSong = null;  // Queue is empty - no next track selected
  }

  room.currentTime = 0;
  room.isPlaying = room.currentSong ? true : false;

  io.to(roomId).emit('playback:next', {
    currentSong: room.currentSong,
  });

  console.log(`[Playback] Skipped to next in ${roomId}`);
});
```

### Key Points:
- **When next is clicked**: Server gets the first item from `room.bucket` array using `.shift()`
- **If bucket has items**: Removes and plays the next track
- **If bucket is EMPTY**: Sets `currentSong = null` and `isPlaying = false`
- **"Next track has not been selected"**: This occurs when `room.bucket.length === 0`

---

## 2. BACKEND: Bucket Management

### Adding to Bucket: `backend/server.js` - Lines 590-617

```javascript
// Bucket - Add Song
socket.on('bucket:add', (data) => {
  const { roomId, songId, title, artist, image, addedBy, source, audio, duration, genre } = data;
  const room = getRoom(roomId);
  
  if (!room) {
    console.error(`[Bucket] ROOM NOT FOUND: ${roomId} when trying to add song "${title}"`);
    socket.emit('error', { 
      type: 'ROOM_NOT_FOUND', 
      message: 'Room does not exist',
      action: 'bucket:add',
      roomId,
    });
    return;
  }

  const item = {
    songId,
    id: songId,
    title,
    artist,
    image,
    addedBy,
    addedAt: Date.now(),
    source: source || 'jiosaavn',
    audio,
    duration: duration || 0,
    genre,
  };

  room.bucket.push(item);

  io.to(roomId).emit('bucket:add', item);
  console.log(`[Bucket] ✓ Added to ${roomId}: ${title} (source: ${source}, hasAudio: ${!!audio})`);
});
```

### Removing from Bucket: `backend/server.js` - Lines 619-627

```javascript
// Bucket - Remove Song
socket.on('bucket:remove', (data) => {
  const { roomId, songId } = data;
  const room = getRoom(roomId);
  if (!room) return;

  room.bucket = room.bucket.filter(b => b.songId !== songId);

  io.to(roomId).emit('bucket:remove', {
    songId,
  });
});
```

### Bucket Structure in Room State:
```javascript
bucket: [
  {
    songId: "xyz123",
    id: "xyz123",
    title: "Song Title",
    artist: "Artist Name",
    image: "image_url",
    addedBy: "User Name",
    addedAt: timestamp,
    source: "jiosaavn",
    audio: "audio_url",
    duration: 240,
    genre: "pop"
  },
  // ... more items
]
```

---

## 3. FRONTEND: Next Button Handler (JS/Pages/party.js)

### Location: Lines 1004-1006

```javascript
container.querySelector('#party-next-btn')?.addEventListener('click', () => {
  PartyRoom.skipToNext();
});
```

### DJ Play Button Handler: Lines 988-998

```javascript
if (isDJ) {
  container.querySelector('#party-play-btn')?.addEventListener('click', () => {
    if (state.isPlaying) PartyRoom.pausePlayback();
    else if (state.currentSong) PartyRoom.resumePlayback();
    else if (state.bucket.length > 0) {
      PartyRoom.skipToNext();  // Auto-play first track if no song playing
    } else {
      showToast('Add songs to queue first');
    }
  });

  container.querySelector('#party-next-btn')?.addEventListener('click', () => {
    PartyRoom.skipToNext();
  });
}
```

---

## 4. FRONTEND: Socket Communication (JS/party.js)

### The skipToNext() Method: Lines 686-691

```javascript
skipToNext: () => {
  if (!socket || !isConnected) return;
  socket.emit('playback:next', { roomId: PartyState.roomId });
},

next: () => {
  if (!socket || !isConnected) return;
  socket.emit('playback:next', { roomId: PartyState.roomId });
},
```

### Handling Next Track Response: Lines 297-308

```javascript
socket.on('playback:next', (data) => {
  console.log('[PartyRoom] Next track:', data.currentSong?.title);
  PartyState.currentSong = data.currentSong;
  PartyState.currentTime = 0;
  PartyState.isPlaying = !!data.currentSong;
  if (data.currentSong) {
    PartyState.bucket = PartyState.bucket.filter(b => b.songId !== data.currentSong.id);
  }
  document.dispatchEvent(new CustomEvent('party:next', { detail: data }));
});
```

---

## 5. FRONTEND: UI Update Flow (JS/Pages/party.js)

### Event Handler Chain: Lines 1082-1099

```javascript
const nextHandler = (event) => {
  _updateUIState(container);
  const song = event.detail?.currentSong;
  console.log('[PartyPage] nextHandler called', { title: song?.title });
  
  if (!song || !window.Player || typeof window.Player.play !== 'function') {
    return;
  }
  
  try {
    console.log('[PartyPage] ⏭ Calling Player.play() for next:', song.title);
    window.Player.play(song, [song], 0);
  } catch (error) {
    console.error('[PartyPage] Error calling Player.play() for next:', error);
  }
};

// ... listener registration ...
document.addEventListener('party:next', nextHandler);
```

---

## 6. FRONTEND: Queue Display (JS/Pages/party.js)

### Queue HTML Generation: Lines 675-690 & 1320-1345

```javascript
// Queue shown on flip card back
const queueHTML = state.bucket.length === 0 
  ? '<p class="empty-msg">No songs in queue</p>'
  : state.bucket.map((item, idx) => `
      <div class="queue-item-flip" data-song-id="${item.songId}">
        <div style="flex: 1; min-width: 0;">
          <p style="margin: 0; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.title)}</p>
          <p style="margin: 0.25rem 0 0; font-size: 0.85rem; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.artist)} - ${escapeHtml(item.addedBy)}</p>
        </div>
        ${isDJ ? `<button class="btn-play-from-queue" data-song-id="${item.songId}" style="margin-left: 0.5rem; padding: 0.4rem 0.8rem; background: #1db954; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">▶</button>` : ''}
      </div>
    `).join('');
```

### Play from Queue: Lines 1290-1300

```javascript
// ─── Play from Queue (on flip card back) ───
container.querySelectorAll('.btn-play-from-queue').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const songId = e.target.dataset.songId;
    PartyRoom.playFromQueue(songId);
    showToast('▶ Playing from queue...');
    flipCard.classList.remove('flipped');
  });
});
```

---

## 7. FRONTEND: Play From Queue (JS/party.js)

### playFromQueue() Method: Lines 650-671

```javascript
playFromQueue: (songId) => {
  if (!socket || !isConnected) return;
  if (PartyState.role !== 'dj') {
    console.warn('[PartyRoom] Only DJ can play songs');
    return;
  }
  const track = PartyState.bucket.find(b => b.songId === songId);
  console.log('[PartyRoom] playFromQueue - Found track:', track);
  if (track) {
    const playbackData = {
      roomId: PartyState.roomId,
      currentSong: {
        id: track.songId || track.id,
        title: track.title,
        artist: track.artist,
        image: track.image,
        source: track.source || 'jiosaavn',
        audio: track.audio,
        duration: track.duration,
        genre: track.genre,
      },
      currentTime: 0,
    };
    console.log('[PartyRoom] Emitting playback:play with:', playbackData);
    socket.emit('playback:play', playbackData);
  } else {
    console.warn('[PartyRoom] Track not found in bucket:', songId);
  }
},
```

---

## 8. Current Logic Flow

```
┌─────────────────────────────────────────┐
│   DJ Clicks "Next" Button (⏭)           │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│   Frontend: PartyRoom.skipToNext()      │
│   Emits: socket.emit('playback:next')   │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│   Backend: playback:next handler        │
│   Checks: if (room.bucket.length > 0)   │
└──────────────────┬──────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
   ┌─────────────┐    ┌──────────────────┐
   │ Has Items   │    │ Queue Empty      │
   ├─────────────┤    ├──────────────────┤
   │ .shift()    │    │ currentSong=null │
   │ currentSong │    │ isPlaying=false  │
   │ = next item │    │                  │
   └──────┬──────┘    └────────┬─────────┘
          │                    │
          └────────┬───────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ Emit: playback:next to all clients      │
│ with { currentSong: ... }               │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ Frontend: Listen to party:next event    │
│ Call: Player.play(song, [song], 0)      │
│ OR show "No song playing" if null       │
└─────────────────────────────────────────┘
```

---

## 9. Key Findings: "Next Track Has Not Been Selected"

### When This Occurs:
1. **Queue is empty** (`room.bucket.length === 0`)
2. **DJ clicks "Next" button** but no tracks in queue
3. **Backend returns**: `currentSong: null`

### What Happens:
- `isPlaying` is set to `false`
- UI shows: "🎵 No song playing" message
- A toast could show: "Add songs to queue first"

### Current Code Reference:
```javascript
// Backend: when bucket is empty
if (room.bucket.length > 0) {
  const nextItem = room.bucket.shift();
  room.currentSong = { ... };
} else {
  room.currentSong = null;  // ← THIS IS "NEXT NOT SELECTED"
}
```

---

## 10. Queue Management Summary

| Operation | Handler | Queue Change | State Update |
|-----------|---------|--------------|--------------|
| Add to Queue | `bucket:add` | Push item to end | All users see update |
| Remove from Queue | `bucket:remove` | Filter out item | All users see update |
| Play Next | `playback:next` | Remove first item with `.shift()` | Current song updated |
| Play from Queue | `playback:play` | Item stays in queue | Current song updated |

### Important Notes:
- **Only DJs** can trigger `playback:next` or `playback:play`
- **Everyone** can add/remove from bucket via search
- **Queue is FIFO**: First added = First played (when using next button)
- **Manual play**: DJ can play any song from queue without removing others
- **Auto-remove**: Only when using "Next" button or clicking ⏭ explicitly

---

## 11. Search & Add Flow

```javascript
// User (guest or DJ) searches for a song:
// 1. Type in search box
// 2. Click "+" button to add to queue
// 3. Song is added to bucket via PartyRoom.addToBucket(track)
// 4. Backend broadcasts bucket:add event
// 5. All clients update their queue display

// DJ-only: Click "▶" in search results
// 1. Song is added to bucket
// 2. Song immediately plays via PartyRoom.playFromQueue(track.id)
// 3. Note: Song remains in queue after playing (not auto-removed)
```

---

## 12. Timing Synchronization

### Backend playback:play handler:
```javascript
socket.on('playback:play', (data) => {
  const { roomId, currentSong, currentTime } = data;
  const room = getRoom(roomId);
  if (!room) return;

  const playStartTime = Date.now();  // Capture server time
  
  room.currentSong = currentSong;
  room.currentTime = currentTime || 0;
  room.isPlaying = true;
  room.playStartTime = playStartTime;

  io.to(roomId).emit('playback:play', {
    currentSong,
    currentTime,
    playStartTime,      // Send to clients for sync
    serverTime: Date.now(),
  });
});
```

---

## 13. Edge Cases & Behaviors

1. **Rapid Next Clicks**: Each click removes one item from queue; users can skip through entire queue
2. **Empty Queue + Click Next**: `currentSong` becomes `null`, playback stops
3. **Guest Adds Song While DJ Playing**: Song added to queue, not auto-played
4. **Room Empty**: No songs in queue by default
5. **DJ Removes Current Song**: If current song is removed from bucket, it keeps playing until naturally ends
6. **Play from Bucket Click**: Manual play - song stays in queue (not removed)

---

## Potential Improvements

1. **Auto-play next**: When current track ends, automatically play next from queue
2. **Loop modes**: Repeat one, repeat all, shuffle
3. **Queue reordering**: Drag-and-drop to change order
4. **Skip prevention**: Limit how many skips DJ can make
5. **Voting system**: Guests vote on next track instead of DJ-only control
6. **Queue persistence**: Save queue history for future sessions

