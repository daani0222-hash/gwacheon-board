/**
 * app.js - 과천중 비밀게시판 클라이언트
 */

// =============================================
// 사용자 세션
// =============================================
const USER = {
  id:        localStorage.getItem('userId')    || generateId(),
  nickname:  localStorage.getItem('nickname')  || '',
  color:     localStorage.getItem('color')     || randomColor(),
  avatarUrl: localStorage.getItem('avatarUrl') || null,
  bio:       localStorage.getItem('bio')       || '',
};

if (!localStorage.getItem('userId')) localStorage.setItem('userId', USER.id);

function generateId() {
  return 'u_' + Math.random().toString(36).slice(2, 11);
}

function randomColor() {
  const colors = ['#2563eb','#7c3aed','#db2777','#dc2626','#d97706','#16a34a','#0891b2','#374151'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// =============================================
// Socket.io
// =============================================
const socket = io({ transports: ['websocket', 'polling'] });

// =============================================
// 앱 상태
// =============================================
const LIKE_TYPES = ['👍', '😂', '🧠', '💀'];

const state = {
  currentView:    'home',
  currentChannel: 'global',
  activeDMSocket: null,
  activeGroupId:  null,
  onlineUsers:    [],
  groupRooms:     [],
  pendingFiles:   [],
  chatFile:       null,
  postPage:       1,
  hasMorePosts:   true,
  isLoadingPosts: false,
  searchQuery:    '',
  unreadDM:       {},
  unreadGroup:    {},
  typingTimers:   {},
  likedTypes:     JSON.parse(localStorage.getItem('likedTypes') || '{}'), // { postId: 'type' | null }
  rankingsData:   { top10: [], hallOfFame: null, pinnedPostId: null, recommendedPostId: null, week: '' },
  adminPw:        '',
  adminVerified:  false,
  logoClickCount: 0,
};

// =============================================
// DOM 참조
// =============================================
const $ = (id) => document.getElementById(id);

const dom = {
  app:             $('app'),
  nicknameModal:   $('nicknameModal'),
  nicknameInput:   $('nicknameInput'),
  setNicknameBtn:  $('setNicknameBtn'),
  sidebarNickname: $('sidebarNickname'),
  sidebarAvatar:   $('sidebarAvatar'),
  creatorAvatar:   $('creatorAvatar'),
  postContent:     $('postContent'),
  fileInput:       $('fileInput'),
  filePreviewArea: $('filePreviewArea'),
  dropZone:        $('dropZone'),
  charCount:       $('charCount'),
  postFeed:        $('postFeed'),
  feedLoading:     $('feedLoading'),
  feedEnd:         $('feedEnd'),
  loadMoreTrigger: $('loadMoreTrigger'),
  searchInput:     $('searchInput'),
  searchClear:     $('searchClear'),
  onlineUsersList: $('onlineUsersList'),
  onlineCount:     $('onlineCount'),
  groupRoomsList:  $('groupRoomsList'),
  chatBadge:       $('chatBadge'),
  messageArea:     $('messageArea'),
  messageInput:    $('messageInput'),
  typingIndicator: $('typingIndicator'),
  typingText:      $('typingText'),
  chatHeaderName:  $('chatHeaderName'),
  chatHeaderDesc:  $('chatHeaderDesc'),
  chatHeaderIcon:  $('chatHeaderIcon'),
  chatFileInput:   $('chatFileInput'),
  chatFilePreview: $('chatFilePreview'),
  dmList:          $('dmList'),
  groupList:       $('groupList'),
  rightOnlineList: $('rightOnlineList'),
  profileAvatarLarge: $('profileAvatarLarge'),
  profileName:     $('profileName'),
  profileBio:      $('profileBio'),
  myPostCount:     $('myPostCount'),
  myLikeCount:     $('myLikeCount'),
  myPostsFeed:     $('myPostsFeed'),
  exploreGrid:     $('exploreGrid'),
  imageModal:      $('imageModal'),
  imageModalImg:   $('imageModalImg'),
  createRoomModal: $('createRoomModal'),
  roomNameInput:   $('roomNameInput'),
  settingsModal:   $('settingsModal'),
  changeNicknameInput: $('changeNicknameInput'),
  changeBioInput:  $('changeBioInput'),
  avatarInput:     $('avatarInput'),
  settingsAvatarPreview: $('settingsAvatarPreview'),
  toastContainer:  $('toastContainer'),
  recommendedBanner: $('recommendedBanner'),
  pinnedPostArea:  $('pinnedPostArea'),
  profileBadge:    $('profileBadge'),
  profileTitle:    $('profileTitle'),
  likeBreakdownDetail: $('likeBreakdownDetail'),
  hofPowers:       $('hofPowers'),
  hofPowerButtons: $('hofPowerButtons'),
};

// =============================================
// 이모지
// =============================================
const EMOJIS = [
  '😀','😂','😍','🥰','😎','🤔','😅','🙏',
  '👍','👎','❤️','🔥','✨','🎉','😭','😊',
  '🤣','😏','🥳','😤','😡','🤩','😋','🤗',
  '💯','🎊','🚀','💪','🤝','👀','💬','🌟',
  '🍕','🍔','🎮','🎵','📱','💻','🌈','⚡',
  '😴','🤯','🥹','💀','👻','🦊','🐱','🐶',
];

// =============================================
// 초기화
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  buildEmojiPicker();
  bindEvents();

  if (USER.nickname) {
    startApp();
  } else {
    dom.nicknameModal.style.display = 'flex';
    dom.nicknameInput.focus();
  }
});

function startApp() {
  dom.nicknameModal.style.display = 'none';
  dom.app.classList.remove('hidden');

  updateProfileUI();
  connectSocket();
  loadPosts();
  setupInfiniteScroll();
  setupDropZone();
  setupKeyboardShortcuts();
}

// =============================================
// 이벤트 바인딩
// =============================================
function bindEvents() {
  // 닉네임 모달
  dom.setNicknameBtn.addEventListener('click', handleSetNickname);
  dom.nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSetNickname();
  });

  socket.on('nicknameResult', ({ available, nickname }) => {
    if (available) {
      USER.nickname = nickname;
      localStorage.setItem('nickname', nickname);
      dom.setNicknameBtn.disabled = false;
      dom.setNicknameBtn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> 입장하기';
      startApp();
      showToast(`환영합니다, ${nickname}님!`, 'success');
    } else {
      showToast('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.', 'error');
      dom.setNicknameBtn.disabled = false;
      dom.setNicknameBtn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> 입장하기';
      dom.nicknameInput.focus();
    }
  });

  // 게시글 작성
  dom.postContent.addEventListener('input', () => {
    const len = dom.postContent.value.length;
    dom.charCount.textContent = len;
    dom.charCount.style.color = len > 1800 ? 'var(--red)' : '';
  });

  dom.fileInput.addEventListener('change', handleFileSelect);
  dom.chatFileInput.addEventListener('change', handleChatFileSelect);

  dom.avatarInput && dom.avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !dom.settingsAvatarPreview) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarEl(dom.settingsAvatarPreview, ev.target.result, USER.color, getInitials(USER.nickname));
    };
    reader.readAsDataURL(file);
  });

  // 검색
  let searchTimer;
  dom.searchInput.addEventListener('input', () => {
    const q = dom.searchInput.value.trim();
    dom.searchClear.classList.toggle('hidden', !q);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = q;
      resetAndLoadPosts();
    }, 400);
  });

  // 메시지 입력
  dom.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  let typingTimer;
  dom.messageInput.addEventListener('input', () => {
    socket.emit('typing', { channel: state.currentChannel, roomId: state.activeGroupId });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      socket.emit('stopTyping', { channel: state.currentChannel, roomId: state.activeGroupId });
    }, 1500);
  });

  // 색상 선택
  document.querySelectorAll('.color-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      USER.color = opt.dataset.color;
    });
  });

  // 로고 5번 클릭 → 관리자 패널
  const logoEl = $('sidebarLogo');
  if (logoEl) {
    logoEl.addEventListener('click', () => {
      state.logoClickCount = (state.logoClickCount || 0) + 1;
      if (state.logoClickCount >= 5) {
        state.logoClickCount = 0;
        openAdminModal();
      }
    });
  }
}

// =============================================
// 닉네임 설정 (중복 확인 포함)
// =============================================
function handleSetNickname() {
  const nickname = dom.nicknameInput.value.trim();
  if (nickname.length < 2 || nickname.length > 20) {
    showToast('닉네임은 2~20자 이내여야 합니다.', 'error');
    dom.nicknameInput.focus();
    return;
  }
  dom.setNicknameBtn.disabled = true;
  dom.setNicknameBtn.textContent = '확인 중...';
  socket.emit('checkNickname', { nickname });
}

// =============================================
// 아바타 렌더링 헬퍼
// =============================================
function setAvatarEl(el, avatarUrl, color, initials) {
  if (avatarUrl) {
    el.innerHTML = `<img src="${avatarUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">`;
    el.style.background = 'transparent';
  } else {
    el.innerHTML = '';
    el.textContent = initials;
    el.style.background = color || '#2563eb';
  }
}

function avatarHtml(avatarUrl, color, name, sizeClass = 'sm') {
  const initials = getInitials(name);
  if (avatarUrl) {
    return `<div class="avatar ${sizeClass} no-status" style="background:transparent;overflow:hidden">
      <img src="${avatarUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">
    </div>`;
  }
  return `<div class="avatar ${sizeClass} no-status" style="background:${color || '#2563eb'}">${initials}</div>`;
}

// =============================================
// 랭킹 헬퍼
// =============================================
function getRankedUser(authorId) {
  return (state.rankingsData.top10 || []).find(u => u.userId === authorId);
}

function getPostRankClass(authorId) {
  const ranked = getRankedUser(authorId);
  if (!ranked) return '';
  const cons = ranked.consecutiveWins || 0;
  if (cons >= 3) return 'legend-post';
  if (cons >= 2) return 'diamond-post';
  if (ranked.rank === 1) return 'rank-1-post';
  if (ranked.rank === 2) return 'rank-2-post';
  if (ranked.rank === 3) return 'rank-3-post';
  return 'rank-top10-post';
}

function getAuthorBadge(authorId) {
  const ranked = getRankedUser(authorId);
  return ranked ? (ranked.badge || '') : '';
}

function isGoldenAuthor(authorId) {
  const ranked = getRankedUser(authorId);
  return ranked && ranked.rank === 1;
}

// =============================================
// Socket.io 이벤트
// =============================================
function connectSocket() {
  socket.emit('userJoin', {
    nickname: USER.nickname,
    userId: USER.id,
    color: USER.color,
    avatarUrl: USER.avatarUrl,
    bio: USER.bio,
  });

  socket.on('nicknameTaken', ({ nickname }) => {
    showToast(`닉네임 "${escHtml(nickname)}"이(가) 이미 사용 중입니다. 닉네임을 변경해 주세요.`, 'error');
    setTimeout(() => openSettingsModal(), 500);
  });

  socket.on('onlineUsers', (users) => {
    state.onlineUsers = users;
    renderOnlineUsers();
  });

  socket.on('systemMessage', (msg) => {
    appendSystemMessage(msg.message);
  });

  socket.on('newPost', (post) => {
    if (state.currentView === 'home' && !state.searchQuery) {
      prependPost(post);
    }
  });

  socket.on('deletePost', (postId) => {
    const el = document.querySelector(`[data-post-id="${postId}"]`);
    if (el) {
      el.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }
  });

  socket.on('newComment', (comment) => {
    const section = document.querySelector(`[data-comments-id="${comment.postId}"]`);
    if (section) {
      appendComment(section.querySelector('.comments-list'), comment);
      const countEl = document.querySelector(`[data-post-id="${comment.postId}"] .comment-count`);
      if (countEl) countEl.textContent = parseInt(countEl.textContent || 0) + 1;
    }
  });

  socket.on('likeUpdate', ({ postId, breakdown, totalLikes, userId, liked, type }) => {
    updateLikeUI(postId, breakdown, totalLikes, userId, liked, type);
  });

  socket.on('rankingsUpdate', (top10) => {
    state.rankingsData.top10 = top10 || [];
  });

  socket.on('adminWarning', ({ message }) => {
    $('warningText').textContent = message;
    $('warningModal').classList.remove('hidden');
  });

  socket.on('announcement', ({ message }) => {
    showToast(`📢 공지: ${message.slice(0, 60)}${message.length > 60 ? '...' : ''}`, 'warning');
  });

  socket.on('pinnedPost', ({ postId }) => {
    state.rankingsData.pinnedPostId = postId;
    renderPinnedBanner();
  });

  socket.on('recommendedPost', ({ postId }) => {
    state.rankingsData.recommendedPostId = postId;
    renderRecommendedBanner();
  });

  socket.on('globalHistory', (messages) => {
    dom.messageArea.innerHTML = '';
    if (messages.length === 0) {
      dom.messageArea.innerHTML = `
        <div class="chat-welcome">
          <div class="chat-welcome-icon"><i class="fa-solid fa-earth-asia"></i></div>
          <h3>전체 채팅에 오신 것을 환영합니다!</h3>
          <p>모든 접속자와 실시간으로 대화할 수 있습니다</p>
        </div>`;
    } else {
      messages.forEach(msg => appendMessage(msg, 'global'));
      scrollToBottom();
    }
  });

  socket.on('globalMessage', (msg) => {
    if (state.currentChannel !== 'global' || state.activeDMSocket || state.activeGroupId) {
      incrementChatBadge();
    }
    if (state.currentChannel === 'global' && !state.activeDMSocket && !state.activeGroupId) {
      appendMessage(msg, 'global');
      scrollToBottom();
    }
  });

  socket.on('directMessage', (msg) => {
    const isActiveDM = state.activeDMSocket === msg.fromSocketId ||
                       state.activeDMSocket === msg.toSocketId;
    if (isActiveDM) {
      appendMessage(msg, 'dm');
      scrollToBottom();
    } else {
      const otherId = msg.fromSocketId === socket.id ? msg.toSocketId : msg.fromSocketId;
      state.unreadDM[otherId] = (state.unreadDM[otherId] || 0) + 1;
      updateDMList();
      incrementChatBadge();
      showToast(`💬 ${msg.fromNickname}: ${msg.content.slice(0, 30)}`, 'info');
    }
  });

  socket.on('dmHistory', ({ otherSocketId, messages }) => {
    if (state.activeDMSocket !== otherSocketId) return;
    dom.messageArea.innerHTML = '';
    messages.forEach(msg => appendMessage(msg, 'dm'));
    scrollToBottom();
  });

  socket.on('groupRooms', (rooms) => {
    state.groupRooms = rooms;
    renderGroupRooms();
  });

  socket.on('groupRoomCreated', (room) => {
    state.groupRooms.push(room);
    renderGroupRooms();
    showToast(`"${room.name}" 채팅방이 만들어졌습니다!`, 'success');
  });

  socket.on('groupRoomHistory', ({ roomId, messages }) => {
    if (state.activeGroupId !== roomId) return;
    dom.messageArea.innerHTML = '';
    messages.forEach(msg => appendMessage(msg, 'group'));
    scrollToBottom();
  });

  socket.on('groupMessage', (msg) => {
    if (state.activeGroupId === msg.roomId) {
      appendMessage(msg, 'group');
      scrollToBottom();
    } else {
      state.unreadGroup[msg.roomId] = (state.unreadGroup[msg.roomId] || 0) + 1;
      renderGroupRooms();
      incrementChatBadge();
    }
  });

  socket.on('userTyping', ({ nickname, channel, socketId, roomId }) => {
    if (
      (channel === 'global' && state.currentChannel === 'global' && !state.activeDMSocket && !state.activeGroupId) ||
      (channel === 'dm' && state.activeDMSocket === socketId) ||
      (channel === 'group' && state.activeGroupId === roomId)
    ) {
      dom.typingIndicator.classList.remove('hidden');
      dom.typingText.textContent = `${nickname}님이 입력 중...`;
      clearTimeout(state.typingTimers[socketId]);
      state.typingTimers[socketId] = setTimeout(() => {
        dom.typingIndicator.classList.add('hidden');
      }, 2000);
    }
  });

  socket.on('userStopTyping', () => {
    dom.typingIndicator.classList.add('hidden');
  });

  socket.on('connect_error', () => {
    showToast('서버 연결에 실패했습니다. 재연결 중...', 'warning');
  });

  socket.on('reconnect', () => {
    showToast('서버에 재연결되었습니다!', 'success');
    socket.emit('userJoin', {
      nickname: USER.nickname,
      userId: USER.id,
      color: USER.color,
      avatarUrl: USER.avatarUrl,
      bio: USER.bio,
    });
  });
}

// =============================================
// 게시글 로딩
// =============================================
async function loadPosts(append = false) {
  if (state.isLoadingPosts || (!state.hasMorePosts && append)) return;
  state.isLoadingPosts = true;
  dom.feedLoading.classList.remove('hidden');

  try {
    const params = new URLSearchParams({
      page: state.postPage,
      limit: 10,
      search: state.searchQuery,
    });

    const res = await fetch(`/api/posts?${params}`);
    const data = await res.json();

    // 핀된/추천글 정보 업데이트
    if (data.pinnedPostId !== undefined) state.rankingsData.pinnedPostId = data.pinnedPostId;
    if (data.recommendedPostId !== undefined) state.rankingsData.recommendedPostId = data.recommendedPostId;
    renderPinnedBanner();
    renderRecommendedBanner();

    if (!append) dom.postFeed.innerHTML = '';

    if (data.posts.length === 0 && !append) {
      dom.postFeed.innerHTML = `
        <div class="empty-feed">
          <div class="empty-feed-icon"><i class="fa-solid fa-wind"></i></div>
          <h3>${state.searchQuery ? '검색 결과가 없습니다' : '아직 게시글이 없습니다'}</h3>
          <p>${state.searchQuery ? '다른 키워드로 검색해보세요' : '첫 번째 게시글을 작성해보세요!'}</p>
        </div>`;
    } else {
      data.posts.forEach(post => dom.postFeed.appendChild(createPostElement(post)));
    }

    state.hasMorePosts = data.hasMore;
    state.postPage++;
    dom.feedEnd.classList.toggle('hidden', state.hasMorePosts || data.posts.length === 0);

  } catch (err) {
    showToast('게시글을 불러오는 데 실패했습니다.', 'error');
  } finally {
    state.isLoadingPosts = false;
    dom.feedLoading.classList.add('hidden');
  }
}

function resetAndLoadPosts() {
  state.postPage = 1;
  state.hasMorePosts = true;
  loadPosts(false);
}

// =============================================
// 추천글 / 고정글 배너
// =============================================
function renderPinnedBanner() {
  const pid = state.rankingsData.pinnedPostId;
  if (!dom.pinnedPostArea) return;
  if (pid) {
    dom.pinnedPostArea.classList.remove('hidden');
    dom.pinnedPostArea.innerHTML = `<i class="fa-solid fa-thumbtack"></i> <span>📌 고정 게시글이 있습니다</span>`;
  } else {
    dom.pinnedPostArea.classList.add('hidden');
  }
}

function renderRecommendedBanner() {
  const rid = state.rankingsData.recommendedPostId;
  if (!dom.recommendedBanner) return;
  if (rid) {
    dom.recommendedBanner.classList.remove('hidden');
    dom.recommendedBanner.innerHTML = `<i class="fa-solid fa-star"></i> <span>⭐ 오늘의 추천글이 선정되었습니다</span>`;
  } else {
    dom.recommendedBanner.classList.add('hidden');
  }
}

// =============================================
// 게시글 요소 생성
// =============================================
function createPostElement(post) {
  const isOwner = post.authorId === USER.id;
  const myType  = state.likedTypes[post.id] || null;
  const timeAgo = formatTime(post.createdAt);
  const imagesHtml = buildImagesHtml(post.files || []);
  const filesHtml  = buildFilesHtml(post.files || []);
  const breakdown  = post.likeBreakdown || {};
  const totalLikes = post.likeCount || 0;

  // 랭킹 스타일
  const rankClass = post.authorId === 'admin'
    ? (post.isAnnouncement ? 'announcement-post' : '')
    : getPostRankClass(post.authorId);

  const badge      = post.authorId === 'admin' ? '' : getAuthorBadge(post.authorId);
  const isGolden   = post.authorId !== 'admin' && isGoldenAuthor(post.authorId);
  const isPinned   = state.rankingsData.pinnedPostId === post.id;
  const isRecommended = state.rankingsData.recommendedPostId === post.id;

  // 좋아요 버튼들
  const likeButtons = LIKE_TYPES.map(t => {
    const cnt = breakdown[t] || 0;
    const active = myType === t ? 'active' : '';
    return `<button class="like-type-btn ${active}" data-like-type="${t}"
                    onclick="doLike('${post.id}','${t}')">
      <span class="lt-emoji">${t}</span>
      <span class="lt-count">${cnt}</span>
    </button>`;
  }).join('');

  const el = document.createElement('div');
  el.className = `post-card ${rankClass}`;
  el.setAttribute('data-post-id', post.id);

  const pinIndicator = isPinned ? '<span style="color:var(--accent);font-size:11px;margin-left:4px">📌</span>' : '';
  const recIndicator = isRecommended ? '<span style="color:#f59e0b;font-size:11px;margin-left:4px">⭐</span>' : '';

  el.innerHTML = `
    <div class="post-header">
      ${avatarHtml(post.authorAvatar, post.authorColor, post.author, 'sm')}
      <div class="post-author-info">
        <div class="post-author-name ${isGolden ? 'golden-name' : ''}" style="${!isGolden ? `color:${post.authorColor||'var(--text-1)'}` : ''}">
          ${escHtml(post.author)}${badge ? `<span class="nick-badge">${badge}</span>` : ''}${pinIndicator}${recIndicator}
        </div>
        <div class="post-time">${timeAgo}${post.isAnnouncement ? ' · <span style="color:var(--red);font-weight:700">📢 공지</span>' : ''}</div>
      </div>
      <div class="post-menu" style="display:flex;gap:2px">
        ${state.adminVerified ? `
          <button class="icon-btn" onclick="copyPostId('${post.id}')" title="ID 복사" style="font-size:11px;color:var(--text-3)">
            ID
          </button>
          <button class="icon-btn" onclick="adminQuickDelete('${post.id}')" title="강제삭제" style="color:var(--red)">
            <i class="fa-solid fa-shield-halved"></i>
          </button>` : ''}
        ${isOwner ? `
          <button class="icon-btn" onclick="deletePost('${post.id}')" title="삭제" style="color:var(--red)">
            <i class="fa-solid fa-trash-can"></i>
          </button>` : ''}
      </div>
    </div>
    ${post.content ? `<div class="post-content">${escHtml(post.content)}</div>` : ''}
    ${imagesHtml}
    ${filesHtml}
    <div class="post-actions">
      <div class="like-types-row">${likeButtons}</div>
      <button class="action-btn" onclick="toggleComments('${post.id}')">
        <i class="fa-regular fa-comment"></i>
        <span class="comment-count">${post.commentCount || 0}</span>
      </button>
      <button class="action-btn" onclick="sharePost('${post.id}')">
        <i class="fa-solid fa-share-nodes"></i>
      </button>
    </div>
    <div class="comments-section" data-comments-id="${post.id}">
      <div class="comment-form">
        ${avatarHtml(USER.avatarUrl, USER.color, USER.nickname, 'sm')}
        <input type="text" class="comment-input" placeholder="댓글을 입력하세요..."
               maxlength="500"
               onkeydown="if(event.key==='Enter')submitComment('${post.id}',this)" />
        <button class="comment-send-btn" onclick="submitComment('${post.id}',this.previousElementSibling)">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </div>
      <div class="comments-list" data-comments-list="${post.id}"></div>
    </div>
  `;
  return el;
}

function buildImagesHtml(files) {
  const images = files.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
  if (images.length === 0) return '';
  const countClass = images.length === 1 ? 'single' : images.length === 2 ? 'double' : 'triple';
  const imgs = images.slice(0, 3).map(f => `
    <div class="post-img" onclick="openImageModal('${f.url}')">
      <img src="${f.url}" alt="${escHtml(f.originalname)}" loading="lazy" />
    </div>`).join('');
  return `<div class="post-images ${countClass}">${imgs}</div>`;
}

function buildFilesHtml(files) {
  const nonImages = files.filter(f => !f.mimetype || !f.mimetype.startsWith('image/'));
  if (nonImages.length === 0) return '';
  return `<div class="post-files">
    ${nonImages.map(f => `
      <a href="${f.url}" download="${escHtml(f.originalname)}" class="post-file-link">
        <i class="fa-solid fa-file"></i>
        ${escHtml(f.originalname)}
        <span style="color:var(--text-3)">(${formatFileSize(f.size)})</span>
      </a>`).join('')}
  </div>`;
}

function prependPost(post) {
  if (document.querySelector(`[data-post-id="${post.id}"]`)) return;
  dom.postFeed.insertBefore(createPostElement(post), dom.postFeed.firstChild);
}

// =============================================
// 게시글 제출
// =============================================
async function submitPost() {
  const content = dom.postContent.value.trim();
  if (!content && state.pendingFiles.length === 0) {
    showToast('내용을 입력하거나 파일을 첨부하세요.', 'warning');
    return;
  }

  const btn = $('submitPostBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';

  try {
    const formData = new FormData();
    formData.append('content', content);
    formData.append('author', USER.nickname);
    formData.append('authorId', USER.id);
    formData.append('authorColor', USER.color);
    formData.append('authorAvatar', USER.avatarUrl || '');
    state.pendingFiles.forEach(f => formData.append('files', f));

    const res = await fetch('/api/posts', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('작성 실패');

    dom.postContent.value = '';
    dom.charCount.textContent = '0';
    clearFilePreview();
    showToast('게시글이 작성되었습니다!', 'success');

  } catch (err) {
    showToast('게시글 작성에 실패했습니다.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 게시하기';
  }
}

// =============================================
// 게시글 삭제
// =============================================
async function deletePost(postId) {
  if (!confirm('게시글을 삭제하시겠습니까?')) return;
  try {
    const res = await fetch(`/api/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorId: USER.id }),
    });
    if (!res.ok) throw new Error();
    showToast('게시글이 삭제되었습니다.', 'info');
  } catch {
    showToast('삭제에 실패했습니다.', 'error');
  }
}

// =============================================
// 다중 좋아요
// =============================================
async function doLike(postId, type) {
  try {
    const res = await fetch(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER.id, type }),
    });
    const data = await res.json();
    if (data.liked) {
      state.likedTypes[postId] = type;
    } else {
      delete state.likedTypes[postId];
    }
    localStorage.setItem('likedTypes', JSON.stringify(state.likedTypes));
  } catch {
    showToast('좋아요 처리에 실패했습니다.', 'error');
  }
}

function updateLikeUI(postId, breakdown, totalLikes, userId, liked, type) {
  const card = document.querySelector(`[data-post-id="${postId}"]`);
  if (!card) return;

  const isMe = userId === USER.id;
  if (isMe) {
    if (liked) state.likedTypes[postId] = type;
    else delete state.likedTypes[postId];
    localStorage.setItem('likedTypes', JSON.stringify(state.likedTypes));
  }

  const myType = state.likedTypes[postId] || null;
  LIKE_TYPES.forEach(t => {
    const btn = card.querySelector(`[data-like-type="${t}"]`);
    if (!btn) return;
    btn.querySelector('.lt-count').textContent = breakdown[t] || 0;
    btn.classList.toggle('active', myType === t);
  });
}

// =============================================
// 댓글
// =============================================
function toggleComments(postId) {
  const section = document.querySelector(`[data-comments-id="${postId}"]`);
  const isOpen = section.classList.contains('open');
  if (!isOpen) {
    section.classList.add('open');
    loadComments(postId);
    section.querySelector('.comment-input').focus();
  } else {
    section.classList.remove('open');
  }
}

async function loadComments(postId) {
  try {
    const res = await fetch(`/api/posts/${postId}/comments`);
    const comments = await res.json();
    const list = document.querySelector(`[data-comments-list="${postId}"]`);
    list.innerHTML = '';
    comments.forEach(c => appendComment(list, c));
  } catch (err) {
    console.error('댓글 로딩 실패:', err);
  }
}

function appendComment(listEl, comment) {
  const el = document.createElement('div');
  el.className = 'comment-item';
  el.setAttribute('data-comment-id', comment.id);
  el.innerHTML = `
    ${avatarHtml(comment.authorAvatar, comment.authorColor, comment.author, 'sm')}
    <div class="comment-body">
      <div class="comment-author" style="color:${comment.authorColor || '#2563eb'}">${escHtml(comment.author)}</div>
      <div class="comment-text">${escHtml(comment.content)}</div>
      <div class="comment-time">${formatTime(comment.createdAt)}</div>
    </div>
  `;
  listEl.appendChild(el);
}

async function submitComment(postId, inputEl) {
  const content = inputEl.value.trim();
  if (!content) return;
  try {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        author: USER.nickname,
        authorId: USER.id,
        authorColor: USER.color,
        authorAvatar: USER.avatarUrl || null,
      }),
    });
    if (!res.ok) throw new Error();
    inputEl.value = '';
  } catch {
    showToast('댓글 작성에 실패했습니다.', 'error');
  }
}

// =============================================
// 파일 업로드 (게시글)
// =============================================
function handleFileSelect(e) {
  addFilesToPreview(Array.from(e.target.files));
  e.target.value = '';
}

function addFilesToPreview(files) {
  if (state.pendingFiles.length + files.length > 5) {
    showToast('파일은 최대 5개까지 첨부 가능합니다.', 'warning');
    return;
  }
  files.forEach(file => {
    if (file.size > 10 * 1024 * 1024) {
      showToast(`${file.name}: 10MB 초과 파일은 업로드할 수 없습니다.`, 'error');
      return;
    }
    state.pendingFiles.push(file);
  });
  renderFilePreview();
}

function renderFilePreview() {
  dom.filePreviewArea.innerHTML = '';
  dom.filePreviewArea.classList.toggle('hidden', state.pendingFiles.length === 0);
  state.pendingFiles.forEach((file, i) => {
    const item = document.createElement('div');
    item.className = 'file-preview-item';
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        item.innerHTML = `
          <img src="${e.target.result}" alt="${escHtml(file.name)}" />
          <button class="file-preview-remove" onclick="removeFile(${i})"><i class="fa-solid fa-xmark"></i></button>`;
      };
      reader.readAsDataURL(file);
    } else {
      item.innerHTML = `
        <div class="file-info"><i class="fa-solid fa-file"></i> ${escHtml(file.name)}</div>
        <button class="file-preview-remove" onclick="removeFile(${i})"><i class="fa-solid fa-xmark"></i></button>`;
    }
    dom.filePreviewArea.appendChild(item);
  });
}

function removeFile(index) {
  state.pendingFiles.splice(index, 1);
  renderFilePreview();
}

function clearFilePreview() {
  state.pendingFiles = [];
  dom.filePreviewArea.innerHTML = '';
  dom.filePreviewArea.classList.add('hidden');
}

function setupDropZone() {
  const postCreator = document.querySelector('.post-creator');
  postCreator.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('hidden');
  });
  postCreator.addEventListener('dragleave', (e) => {
    if (!postCreator.contains(e.relatedTarget)) dom.dropZone.classList.add('hidden');
  });
  postCreator.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.add('hidden');
    addFilesToPreview(Array.from(e.dataTransfer.files));
  });
}

// =============================================
// 무한 스크롤
// =============================================
function setupInfiniteScroll() {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && state.hasMorePosts && !state.isLoadingPosts) {
      loadPosts(true);
    }
  }, { threshold: 0.1 });
  observer.observe(dom.loadMoreTrigger);
}

// =============================================
// 랭킹 뷰
// =============================================
async function loadRankings() {
  try {
    const res = await fetch('/api/rankings');
    const data = await res.json();
    state.rankingsData = { ...state.rankingsData, ...data };
    renderRankings(data);
  } catch {
    showToast('랭킹 로딩 실패', 'error');
  }
}

function renderRankings(data) {
  const { week, top10, hallOfFame } = data;

  // 주차 표시
  const weekEl = $('rankingWeek');
  if (weekEl) weekEl.textContent = week ? `(${week})` : '';

  // 명예의전당 카드
  const hofEl = $('hofCard');
  if (hofEl) {
    if (!hallOfFame) {
      hofEl.className = 'hof-card-placeholder';
      hofEl.innerHTML = `<p>아직 명예의 전당에 헌액된 사람이 없습니다.<br>주간 1위를 차지하면 헌액됩니다!</p>`;
    } else {
      const cons = hallOfFame.consecutiveWins || 1;
      const hofClass = cons >= 3 ? 'legend' : cons >= 2 ? 'diamond' : '';
      const crownEmoji = cons >= 3 ? '👑' : cons >= 2 ? '💎' : '🏆';
      const bd = hallOfFame.likeBreakdown || {};
      const bdHtml = Object.entries(bd)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `<span class="hof-like-tag">${k} ${v}</span>`)
        .join('');

      hofEl.className = `hof-card ${hofClass}`;
      hofEl.innerHTML = `
        <div class="hof-avatar-wrap">
          <div class="hof-avatar" style="background:${hallOfFame.color || '#2563eb'}">
            ${hallOfFame.avatarUrl
              ? `<img src="${hallOfFame.avatarUrl}" style="width:100%;height:100%;object-fit:cover" />`
              : getInitials(hallOfFame.nickname)}
          </div>
          <div class="hof-crown">${crownEmoji}</div>
        </div>
        <div class="hof-info">
          <div class="hof-nickname">${escHtml(hallOfFame.nickname)}</div>
          <div class="hof-title">${escHtml(hallOfFame.title || '')}</div>
          <div class="hof-meta">
            <span class="hof-stat">❤️ 총 <strong>${hallOfFame.totalLikes || 0}</strong>개 좋아요</span>
            ${cons > 1 ? `<span class="hof-stat">🔥 <strong>${cons}연속</strong> 1위</span>` : ''}
          </div>
          ${bdHtml ? `<div class="hof-like-breakdown">${bdHtml}</div>` : ''}
        </div>
      `;
    }
  }

  // TOP 10 리스트
  const rankList = $('rankingList');
  if (!rankList) return;

  if (!top10 || top10.length === 0) {
    rankList.innerHTML = `
      <div class="empty-feed">
        <div class="empty-feed-icon"><i class="fa-solid fa-trophy"></i></div>
        <h3>이번주 랭킹 계산 중...</h3>
        <p>게시글을 작성하고 좋아요를 받으면 랭킹에 오를 수 있어요!</p>
      </div>`;
    return;
  }

  rankList.innerHTML = top10.map(u => {
    const isGolden = u.rank === 1;
    const numClass = u.rank === 1 ? 'gold' : u.rank === 2 ? 'silver' : u.rank === 3 ? 'bronze' : 'normal';
    const numDisplay = u.rank <= 3 ? ['🥇','🥈','🥉'][u.rank - 1] : u.rank;
    const rowClass = u.rank <= 3 ? `rank-${u.rank}` : '';
    const bd = u.likeBreakdown || {};
    const bdStr = Object.entries(bd).filter(([,v]) => v > 0).map(([k,v]) => `${k}${v}`).join(' ');

    return `
      <div class="ranking-item ${rowClass}">
        <div class="rank-num ${numClass}">${numDisplay}</div>
        ${avatarHtml(u.avatarUrl, u.color, u.nickname, 'sm')}
        <div class="ranking-user-info">
          <div class="ranking-nickname ${isGolden ? 'golden-name' : ''}">
            ${escHtml(u.nickname)}
            ${u.badge ? `<span class="rank-badge-chip">${u.badge}</span>` : ''}
          </div>
          <div class="ranking-title">${escHtml(u.title || '')}${bdStr ? ` · ${bdStr}` : ''}</div>
        </div>
        <div class="ranking-likes"><i class="fa-solid fa-heart" style="color:#dc2626"></i> ${u.totalLikes}</div>
      </div>`;
  }).join('');
}

// =============================================
// 채팅
// =============================================
function openGlobalChat() {
  state.activeDMSocket = null;
  state.activeGroupId  = null;
  updateChatHeader('전체 채팅', '모든 사용자와 대화', 'fa-earth-asia');
  setActiveChannelItem('chatList-global', 0);
  dom.messageInput.placeholder = '전체 채팅에 메시지를 입력하세요...';
  dom.messageInput.focus();
}

function openDM(targetSocketId, targetNickname, targetColor) {
  state.activeDMSocket = targetSocketId;
  state.activeGroupId  = null;
  delete state.unreadDM[targetSocketId];
  updateDMList();
  updateChatBadge();
  updateChatHeader(targetNickname, '1:1 다이렉트 메시지', 'fa-user',
    `background:${targetColor || '#2563eb'}`);
  dom.messageInput.placeholder = `${targetNickname}에게 메시지...`;
  dom.messageArea.innerHTML = '';
  socket.emit('getDMHistory', { otherSocketId: targetSocketId });
  if (state.currentView !== 'chat') switchView('chat');
  switchChatTab('dm');
  dom.messageInput.focus();
}

function openGroupChat(roomId, roomName) {
  state.activeGroupId  = roomId;
  state.activeDMSocket = null;
  delete state.unreadGroup[roomId];
  renderGroupRooms();
  updateChatBadge();
  updateChatHeader(roomName, '그룹 채팅방', 'fa-users');
  dom.messageInput.placeholder = `${roomName}에 메시지 입력...`;
  dom.messageArea.innerHTML = '';
  socket.emit('joinGroupRoom', { roomId });
  dom.messageInput.focus();
}

function sendMessage() {
  const content = dom.messageInput.value.trim();
  if (!content && !state.chatFile) return;
  const payload = { content, file: state.chatFile };
  if (state.activeGroupId) {
    socket.emit('groupMessage', { roomId: state.activeGroupId, ...payload });
  } else if (state.activeDMSocket) {
    socket.emit('directMessage', { toSocketId: state.activeDMSocket, ...payload });
  } else {
    socket.emit('globalMessage', payload);
  }
  dom.messageInput.value = '';
  state.chatFile = null;
  dom.chatFilePreview.classList.add('hidden');
  dom.chatFilePreview.innerHTML = '';
  socket.emit('stopTyping', {});
}

function appendMessage(msg, type) {
  if (document.querySelector(`[data-msg-id="${msg.id}"]`)) return;
  if (msg.type === 'system' || (!msg.content && !msg.file && msg.message)) {
    appendSystemMessage(msg.message || msg.content);
    return;
  }
  const isMe = (type === 'dm')
    ? msg.fromSocketId === socket.id
    : (msg.authorId === USER.id || msg.socketId === socket.id);

  const author  = msg.author || msg.fromNickname || '알 수 없음';
  const color   = msg.authorColor || msg.fromColor || '#2563eb';
  const avatar  = msg.authorAvatar || msg.fromAvatar || null;
  const content = msg.content || '';
  const timeStr = formatTime(msg.createdAt);

  const el = document.createElement('div');
  el.className = `msg-item ${isMe ? 'mine' : ''}`;
  el.setAttribute('data-msg-id', msg.id);

  let fileHtml = '';
  if (msg.file) {
    if (msg.file.mimetype && msg.file.mimetype.startsWith('image/')) {
      fileHtml = `<div class="msg-file">
        <img src="${msg.file.url}" alt="이미지" onclick="openImageModal('${msg.file.url}')" />
      </div>`;
    } else {
      fileHtml = `<div class="msg-file">
        <a href="${msg.file.url}" download class="post-file-link" style="max-width:200px">
          <i class="fa-solid fa-file"></i> ${escHtml(msg.file.originalname || '파일')}
        </a>
      </div>`;
    }
  }

  el.innerHTML = `
    ${avatarHtml(avatar, color, author, 'sm')}
    <div class="msg-content-wrap">
      <div class="msg-header">
        <span class="msg-author" style="color:${color}">${escHtml(author)}</span>
        <span class="msg-time">${timeStr}</span>
      </div>
      ${content ? `<div class="msg-bubble">${escHtml(content)}</div>` : ''}
      ${fileHtml}
    </div>
  `;
  dom.messageArea.appendChild(el);
}

function appendSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg-system';
  el.innerHTML = `<span>${escHtml(text)}</span>`;
  dom.messageArea.appendChild(el);
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    dom.messageArea.scrollTop = dom.messageArea.scrollHeight;
  });
}

function updateChatHeader(name, desc, iconClass, iconStyle = '') {
  dom.chatHeaderName.textContent = name;
  dom.chatHeaderDesc.textContent = desc;
  dom.chatHeaderIcon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
  dom.chatHeaderIcon.style.cssText = iconStyle;
}

function setActiveChannelItem(listId, index) {
  document.querySelectorAll('.chat-channel-item').forEach(i => i.classList.remove('active'));
  const list = $(listId);
  if (list) {
    const items = list.querySelectorAll('.chat-channel-item, .dm-item, .group-item');
    if (items[index]) items[index].classList.add('active');
  }
}

function handleChatFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  fetch('/api/upload', { method: 'POST', body: formData })
    .then(r => r.json())
    .then(data => {
      state.chatFile = data;
      dom.chatFilePreview.classList.remove('hidden');
      dom.chatFilePreview.innerHTML = `
        <i class="fa-solid fa-paperclip"></i>
        ${escHtml(data.originalname)}
        <span class="remove-preview" onclick="removeChatFile()">✕</span>`;
    })
    .catch(() => showToast('파일 업로드 실패', 'error'));
  e.target.value = '';
}

function removeChatFile() {
  state.chatFile = null;
  dom.chatFilePreview.classList.add('hidden');
  dom.chatFilePreview.innerHTML = '';
}

// =============================================
// 채팅 탭
// =============================================
function switchChatTab(tab) {
  state.currentChannel = tab;
  document.querySelectorAll('.chat-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.channel === tab);
  });
  ['global', 'dm', 'group'].forEach(ch => {
    const el = $(`chatList-${ch}`);
    if (el) el.classList.toggle('hidden', ch !== tab);
  });
  if (tab === 'global' && !state.activeDMSocket && !state.activeGroupId) {
    openGlobalChat();
  }
}

// =============================================
// 배지
// =============================================
function incrementChatBadge() {
  if (state.currentView === 'chat') return;
  const current = parseInt(dom.chatBadge.textContent || '0');
  dom.chatBadge.textContent = current + 1;
  dom.chatBadge.classList.remove('hidden');
}

function updateChatBadge() {
  const total = Object.values(state.unreadDM).reduce((a, b) => a + b, 0)
              + Object.values(state.unreadGroup).reduce((a, b) => a + b, 0);
  dom.chatBadge.textContent = total;
  dom.chatBadge.classList.toggle('hidden', total === 0);
}

// =============================================
// 그룹 방
// =============================================
function openCreateRoomModal() {
  dom.createRoomModal.classList.remove('hidden');
  dom.roomNameInput.value = '';
  dom.roomNameInput.focus();
}

function closeCreateRoomModal() {
  dom.createRoomModal.classList.add('hidden');
}

function confirmCreateRoom() {
  const name = dom.roomNameInput.value.trim();
  if (!name) { showToast('방 이름을 입력하세요.', 'warning'); return; }
  socket.emit('createGroupRoom', { name });
  closeCreateRoomModal();
}

dom.roomNameInput && dom.roomNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmCreateRoom();
});

// =============================================
// 온라인 사용자 렌더링
// =============================================
function renderOnlineUsers() {
  const others = state.onlineUsers.filter(u => u.socketId !== socket.id);
  dom.onlineCount.textContent = state.onlineUsers.length;

  dom.onlineUsersList.innerHTML = others.length === 0
    ? '<div style="padding:6px 8px;font-size:0.75rem;color:var(--text-3)">혼자 접속 중...</div>'
    : others.map(u => `
        <div class="online-user-item" onclick="openDM('${u.socketId}','${escHtml(u.nickname)}','${u.color}')">
          ${avatarHtml(u.avatarUrl, u.color, u.nickname, 'sm')}
          <span class="online-user-name">${escHtml(u.nickname)}</span>
        </div>`).join('');

  const countEl = $('onlineCountRight');
  if (countEl) countEl.textContent = state.onlineUsers.length;

  dom.rightOnlineList.innerHTML = state.onlineUsers.map(u => `
    <div class="right-online-item" onclick="openDM('${u.socketId}','${escHtml(u.nickname)}','${u.color}')">
      ${avatarHtml(u.avatarUrl, u.color, u.nickname, 'sm')}
      <span class="right-online-item-name">${escHtml(u.nickname)}${u.socketId === socket.id ? ' (나)' : ''}</span>
    </div>`).join('');

  updateDMList();
}

function updateDMList() {
  const others = state.onlineUsers.filter(u => u.socketId !== socket.id);
  if (others.length === 0) {
    dom.dmList.innerHTML = `<div class="empty-state-sm">
      <i class="fa-solid fa-message"></i>
      <p>온라인 사용자가 없습니다</p>
    </div>`;
    return;
  }
  dom.dmList.innerHTML = others.map(u => {
    const unread = state.unreadDM[u.socketId] || 0;
    const isActive = state.activeDMSocket === u.socketId;
    return `
      <div class="dm-item ${isActive ? 'active' : ''}"
           onclick="openDM('${u.socketId}','${escHtml(u.nickname)}','${u.color}')">
        ${avatarHtml(u.avatarUrl, u.color, u.nickname, 'sm')}
        <span class="dm-item-name">${escHtml(u.nickname)}</span>
        ${unread > 0 ? `<span class="dm-unread">${unread}</span>` : ''}
      </div>`;
  }).join('');
}

// =============================================
// 그룹 방 렌더링
// =============================================
function renderGroupRooms() {
  dom.groupRoomsList.innerHTML = state.groupRooms.length === 0
    ? '<div style="padding:6px 8px;font-size:0.72rem;color:var(--text-3)">방이 없습니다</div>'
    : state.groupRooms.map(r => `
        <div class="room-item" onclick="openGroupChat('${r.id}','${escHtml(r.name)}')">
          <i class="fa-solid fa-hashtag"></i>
          ${escHtml(r.name)}
        </div>`).join('');

  if (state.groupRooms.length === 0) {
    dom.groupList.innerHTML = `<div class="empty-state-sm">
      <i class="fa-solid fa-users"></i><p>채팅방이 없습니다</p>
    </div>`;
  } else {
    dom.groupList.innerHTML = state.groupRooms.map(r => {
      const unread = state.unreadGroup[r.id] || 0;
      const isActive = state.activeGroupId === r.id;
      return `
        <div class="group-item ${isActive ? 'active' : ''}"
             onclick="openGroupChat('${r.id}','${escHtml(r.name)}')">
          <div class="channel-icon" style="width:28px;height:28px;font-size:0.7rem">
            <i class="fa-solid fa-hashtag"></i>
          </div>
          <span class="group-item-name">${escHtml(r.name)}</span>
          ${unread > 0 ? `<span class="dm-unread">${unread}</span>` : ''}
        </div>`;
    }).join('');
  }
}

// =============================================
// 뷰 전환
// =============================================
function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const view = $(`view-${viewName}`);
  if (view) view.classList.add('active');
  const navItem = document.querySelector(`[data-view="${viewName}"]`);
  if (navItem) navItem.classList.add('active');
  if (viewName === 'chat') {
    dom.chatBadge.textContent = '0';
    dom.chatBadge.classList.add('hidden');
    if (!state.activeDMSocket && !state.activeGroupId) openGlobalChat();
  }
  if (viewName === 'profile') loadProfileView();
  if (viewName === 'explore') loadExploreView();
  if (viewName === 'ranking') loadRankings();
  closeSidebar();
}

// =============================================
// 프로필 뷰
// =============================================
async function loadProfileView() {
  dom.profileName.textContent = USER.nickname;
  if (dom.profileBio) dom.profileBio.textContent = USER.bio || '소개글이 없습니다.';
  setAvatarEl(dom.profileAvatarLarge, USER.avatarUrl, USER.color, getInitials(USER.nickname));

  // 내 랭킹 정보
  const ranked = getRankedUser(USER.id);
  if (ranked && dom.profileBadge && dom.profileTitle) {
    dom.profileBadge.textContent = ranked.badge || '';
    dom.profileBadge.classList.toggle('hidden', !ranked.badge);
    dom.profileTitle.textContent = ranked.title || '';
    dom.profileTitle.classList.toggle('hidden', !ranked.title);
  } else {
    dom.profileBadge && dom.profileBadge.classList.add('hidden');
    dom.profileTitle && dom.profileTitle.classList.add('hidden');
  }

  // 게시글 + 좋아요 분류
  try {
    const [postsRes, likesRes] = await Promise.all([
      fetch('/api/posts?limit=50'),
      fetch(`/api/users/${USER.id}/likes`),
    ]);
    const postsData = await postsRes.json();
    const likesData = await likesRes.json();

    const myPosts = postsData.posts.filter(p => p.authorId === USER.id);
    dom.myPostCount.textContent = myPosts.length;
    dom.myLikeCount.textContent = likesData.total || 0;

    if (dom.likeBreakdownDetail) {
      const bd = likesData.breakdown || {};
      dom.likeBreakdownDetail.innerHTML = LIKE_TYPES
        .map(t => `<span style="margin-right:8px">${t} <strong>${bd[t] || 0}</strong></span>`)
        .join('');
    }

    dom.myPostsFeed.innerHTML = '';
    if (myPosts.length === 0) {
      dom.myPostsFeed.innerHTML = `<div class="empty-feed">
        <div class="empty-feed-icon"><i class="fa-solid fa-pen-nib"></i></div>
        <p>아직 작성한 게시글이 없습니다</p>
      </div>`;
    } else {
      myPosts.forEach(p => dom.myPostsFeed.appendChild(createPostElement(p)));
    }
  } catch (err) {
    console.error('프로필 로딩 오류:', err);
  }

  // 명예의전당 1위 전용 기능
  const hofData = state.rankingsData.hallOfFame;
  const isHoF = hofData && hofData.userId === USER.id;
  if (dom.hofPowers) {
    dom.hofPowers.classList.toggle('hidden', !isHoF);
    if (isHoF && dom.hofPowerButtons) {
      dom.hofPowerButtons.innerHTML = `
        <div class="hof-powers-title">🔥 명예의전당 1위 전용 권한</div>
        <div class="hof-power-buttons">
          <button class="btn btn-ghost btn-sm" onclick="openHofPinModal()">
            <i class="fa-solid fa-thumbtack"></i> 게시글 고정
          </button>
          <button class="btn btn-ghost btn-sm" onclick="openHofRecommendModal()">
            <i class="fa-solid fa-star"></i> 오늘의 추천글 선정
          </button>
        </div>`;
    }
  }
}

function openHofPinModal() {
  const postId = prompt('고정할 게시글 ID를 입력하세요 (현재 페이지의 게시글 ID):');
  if (!postId) return;
  fetch(`/api/posts/${postId}/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: USER.id }),
  })
    .then(r => r.json())
    .then(d => showToast(d.success ? '고정 처리되었습니다!' : d.error, d.success ? 'success' : 'error'))
    .catch(() => showToast('고정 처리 실패', 'error'));
}

function openHofRecommendModal() {
  const postId = prompt('추천할 게시글 ID를 입력하세요:');
  if (!postId) return;
  fetch(`/api/posts/${postId}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: USER.id }),
  })
    .then(r => r.json())
    .then(d => showToast(d.success ? '추천글 선정 완료!' : d.error, d.success ? 'success' : 'error'))
    .catch(() => showToast('추천글 선정 실패', 'error'));
}

// =============================================
// 탐색 뷰
// =============================================
function loadExploreView() {
  fetch('/api/posts?limit=20')
    .then(r => r.json())
    .then(data => {
      dom.exploreGrid.innerHTML = '';
      if (data.posts.length === 0) {
        dom.exploreGrid.innerHTML = `<div class="empty-feed" style="grid-column:1/-1">
          <div class="empty-feed-icon"><i class="fa-solid fa-compass"></i></div>
          <h3>탐색할 게시글이 없습니다</h3>
        </div>`;
        return;
      }
      data.posts.forEach(p => dom.exploreGrid.appendChild(createPostElement(p)));
    });
}

// =============================================
// 프로필 UI 업데이트
// =============================================
function updateProfileUI() {
  dom.sidebarNickname.textContent = USER.nickname;
  setAvatarEl(dom.sidebarAvatar, USER.avatarUrl, USER.color, getInitials(USER.nickname));
  dom.sidebarAvatar.className = 'avatar sm no-status';

  setAvatarEl(dom.creatorAvatar, USER.avatarUrl, USER.color, getInitials(USER.nickname));
  dom.creatorAvatar.className = 'avatar sm no-status';

  if (dom.profileAvatarLarge) {
    setAvatarEl(dom.profileAvatarLarge, USER.avatarUrl, USER.color, getInitials(USER.nickname));
    dom.profileName.textContent = USER.nickname;
  }
  if (dom.profileBio) dom.profileBio.textContent = USER.bio || '소개글이 없습니다.';
}

// =============================================
// 설정 모달
// =============================================
function openSettingsModal() {
  dom.settingsModal.classList.remove('hidden');
  dom.changeNicknameInput.value = USER.nickname;
  if (dom.changeBioInput) dom.changeBioInput.value = USER.bio || '';

  if (dom.settingsAvatarPreview) {
    setAvatarEl(dom.settingsAvatarPreview, USER.avatarUrl, USER.color, getInitials(USER.nickname));
    dom.settingsAvatarPreview.className = 'avatar lg no-status';
  }

  document.querySelectorAll('.color-opt').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.color === USER.color);
  });
}

function closeSettingsModal() {
  dom.settingsModal.classList.add('hidden');
}

async function saveSettings() {
  const newNickname = dom.changeNicknameInput.value.trim();
  const newBio = (dom.changeBioInput?.value || '').trim().slice(0, 100);

  if (newNickname.length < 2 || newNickname.length > 20) {
    showToast('닉네임은 2~20자 이내여야 합니다.', 'error');
    return;
  }

  const avatarFile = dom.avatarInput?.files?.[0];
  if (avatarFile) {
    const formData = new FormData();
    formData.append('avatar', avatarFile);
    try {
      const res = await fetch('/api/upload/avatar', { method: 'POST', body: formData });
      if (!res.ok) throw new Error();
      const data = await res.json();
      USER.avatarUrl = data.url;
      localStorage.setItem('avatarUrl', data.url);
    } catch {
      showToast('프로필 사진 업로드에 실패했습니다.', 'error');
      return;
    }
  }

  const oldNickname = USER.nickname;
  USER.nickname = newNickname;
  USER.bio = newBio;
  localStorage.setItem('nickname', newNickname);
  localStorage.setItem('color', USER.color);
  localStorage.setItem('bio', newBio);

  if (oldNickname !== newNickname) {
    socket.emit('updateNickname', { oldNickname, newNickname });
  }

  socket.emit('updateProfile', { avatarUrl: USER.avatarUrl, bio: USER.bio });

  updateProfileUI();
  closeSettingsModal();
  showToast('프로필이 저장되었습니다!', 'success');
}

// =============================================
// 관리자 패널
// =============================================
function openAdminModal() {
  $('adminModal').classList.remove('hidden');
  if (state.adminVerified) {
    $('adminLoginSection').classList.add('hidden');
    $('adminPanel').classList.remove('hidden');
    loadAdminUsers();
  } else {
    $('adminLoginSection').classList.remove('hidden');
    $('adminPanel').classList.add('hidden');
  }
}

function closeAdminModal() {
  $('adminModal').classList.add('hidden');
}

async function verifyAdmin() {
  const pw = $('adminPasswordInput').value;
  if (!pw) { showToast('비밀번호를 입력하세요.', 'warning'); return; }
  try {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      state.adminPw = pw;
      state.adminVerified = true;
      $('adminLoginSection').classList.add('hidden');
      $('adminPanel').classList.remove('hidden');
      loadAdminUsers();
      showToast('관리자 인증 성공!', 'success');
    } else {
      showToast('비밀번호가 틀렸습니다.', 'error');
    }
  } catch {
    showToast('인증 오류', 'error');
  }
}

async function loadAdminUsers() {
  try {
    const res = await fetch(`/api/admin/users?password=${encodeURIComponent(state.adminPw)}`);
    if (!res.ok) return;
    const users = await res.json();
    const listEl = $('adminUserList');
    const selectEl = $('warnTargetSelect');

    listEl.innerHTML = users.length === 0
      ? '<div style="color:var(--text-3);font-size:12px;padding:4px">온라인 사용자 없음</div>'
      : users.map(u => `
          <div class="admin-user-item">
            <span class="admin-user-name">${escHtml(u.nickname)}</span>
            <span class="admin-user-sid">${u.socketId.slice(0, 8)}</span>
            <button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:11px"
                    onclick="quickWarn('${u.socketId}','${escHtml(u.nickname)}')">경고</button>
          </div>`).join('');

    selectEl.innerHTML = users.map(u =>
      `<option value="${u.socketId}">${escHtml(u.nickname)}</option>`
    ).join('');
  } catch (err) {
    console.error('관리자 유저 로딩 오류:', err);
  }
}

async function sendAnnounce() {
  const message = $('announceText').value.trim();
  if (!message) { showToast('공지 내용을 입력하세요.', 'warning'); return; }
  try {
    const res = await fetch('/api/admin/announce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: state.adminPw, message }),
    });
    if (res.ok) {
      $('announceText').value = '';
      showToast('공지가 발송되었습니다!', 'success');
    } else {
      const d = await res.json();
      showToast(d.error || '공지 발송 실패', 'error');
    }
  } catch {
    showToast('공지 발송 오류', 'error');
  }
}

async function sendWarning() {
  const targetSocketId = $('warnTargetSelect').value;
  const message = $('warnMessage').value.trim();
  if (!targetSocketId) { showToast('대상 유저를 선택하세요.', 'warning'); return; }
  if (!message) { showToast('경고 메시지를 입력하세요.', 'warning'); return; }
  await doWarn(targetSocketId, message);
}

async function quickWarn(socketId, nickname) {
  const message = prompt(`${nickname}에게 보낼 경고 메시지:`);
  if (!message) return;
  await doWarn(socketId, message);
}

function copyPostId(postId) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(postId).then(() => showToast('게시글 ID가 복사되었습니다!', 'success'));
  } else {
    showToast('ID: ' + postId, 'info');
  }
}

async function adminQuickDelete(postId) {
  if (!confirm('이 게시글을 강제 삭제하시겠습니까?')) return;
  try {
    const res = await fetch(`/api/admin/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: state.adminPw }),
    });
    if (res.ok) {
      showToast('게시글이 삭제되었습니다.', 'success');
    } else {
      const d = await res.json();
      showToast(d.error || '삭제 실패', 'error');
    }
  } catch {
    showToast('삭제 오류', 'error');
  }
}

async function adminDeletePost() {
  const postId = $('deletePostIdInput').value.trim();
  if (!postId) { showToast('게시글 ID를 입력하세요.', 'warning'); return; }
  if (!confirm('정말 이 게시글을 강제 삭제하시겠습니까?')) return;
  try {
    const res = await fetch(`/api/admin/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: state.adminPw }),
    });
    if (res.ok) {
      $('deletePostIdInput').value = '';
      showToast('게시글이 삭제되었습니다.', 'success');
    } else {
      const d = await res.json();
      showToast(d.error || '삭제 실패', 'error');
    }
  } catch {
    showToast('삭제 오류', 'error');
  }
}

async function doWarn(targetSocketId, message) {
  try {
    const res = await fetch('/api/admin/warn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: state.adminPw, targetSocketId, message }),
    });
    if (res.ok) {
      $('warnMessage') && ($('warnMessage').value = '');
      showToast('경고 메시지가 전송되었습니다.', 'success');
    } else {
      const d = await res.json();
      showToast(d.error || '경고 전송 실패', 'error');
    }
  } catch {
    showToast('경고 전송 오류', 'error');
  }
}

// =============================================
// 이미지 모달
// =============================================
function openImageModal(url) {
  dom.imageModalImg.src = url;
  dom.imageModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeImageModal() {
  dom.imageModal.classList.add('hidden');
  document.body.style.overflow = '';
}

// =============================================
// 이모지 피커
// =============================================
function buildEmojiPicker() {
  ['emojiPicker', 'emojiPickerChat'].forEach(id => {
    const picker = $(id);
    if (!picker) return;
    picker.innerHTML = EMOJIS.map(e =>
      `<button class="emoji-btn" onclick="insertEmoji('${e}','${id}')">${e}</button>`
    ).join('');
  });
}

function toggleEmojiPicker() {
  $('emojiPicker').classList.toggle('hidden');
  $('emojiPickerChat').classList.add('hidden');
}

function toggleEmojiPickerChat() {
  $('emojiPickerChat').classList.toggle('hidden');
  $('emojiPicker').classList.add('hidden');
}

function insertEmoji(emoji, pickerId) {
  if (pickerId === 'emojiPicker') {
    dom.postContent.value += emoji;
    dom.postContent.dispatchEvent(new Event('input'));
    dom.postContent.focus();
  } else {
    dom.messageInput.value += emoji;
    dom.messageInput.focus();
  }
  $(pickerId).classList.add('hidden');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.emoji-toggle') && !e.target.closest('.emoji-toggle-chat')) {
    $('emojiPicker')?.classList.add('hidden');
    $('emojiPickerChat')?.classList.add('hidden');
  }
});

// =============================================
// 모바일 사이드바
// =============================================
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = getOrCreateOverlay();
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}

function closeSidebar() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('show');
}

function getOrCreateOverlay() {
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);
  }
  return overlay;
}

// =============================================
// 검색
// =============================================
function clearSearch() {
  dom.searchInput.value = '';
  dom.searchClear.classList.add('hidden');
  state.searchQuery = '';
  resetAndLoadPosts();
}

// =============================================
// 게시글 공유
// =============================================
function sharePost(postId) {
  const url = `${window.location.origin}?post=${postId}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('링크가 복사되었습니다!', 'success'));
  } else {
    showToast('링크: ' + url, 'info');
  }
}

// =============================================
// 키보드 단축키
// =============================================
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeImageModal();
      closeCreateRoomModal();
      closeSettingsModal();
      closeAdminModal();
      $('warningModal')?.classList.add('hidden');
      $('emojiPicker')?.classList.add('hidden');
      $('emojiPickerChat')?.classList.add('hidden');
    }
    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      dom.searchInput.focus();
    }
    if (e.ctrlKey && e.key === 'Enter') {
      if (document.activeElement === dom.postContent) submitPost();
    }
  });
}

// =============================================
// 토스트 알림
// =============================================
function showToast(message, type = 'info') {
  const icons = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info:    'fa-circle-info',
  };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type]} toast-icon"></i>
    <span>${escHtml(message)}</span>
  `;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// =============================================
// 유틸리티
// =============================================
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(isoString) {
  if (!isoString) return '';
  const now  = new Date();
  const date = new Date(isoString);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)     return '방금 전';
  if (diff < 3600)   return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const style = document.createElement('style');
style.textContent = `@keyframes fadeOut { to { opacity:0; transform:scale(0.95); } }`;
document.head.appendChild(style);
