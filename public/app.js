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
  if (viewName === 'members') loadMembers();
  if (viewName === 'games') { loadUserGames(); }
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

// =============================================
// 멤버 목록
// =============================================
let allMembers = [];

socket.on('membersUpdate', (members) => {
  allMembers = members;
  if (state.currentView === 'members') renderMemberGrid(members);
});

async function loadMembers() {
  try {
    const res = await fetch('/api/members');
    allMembers = await res.json();
    renderMemberGrid(allMembers);
  } catch { showToast('멤버 로딩 실패', 'error'); }
}

function renderMemberGrid(members) {
  const grid = $('memberGrid');
  const countEl = $('memberCount');
  if (!grid) return;
  const onlineIds = new Set(state.onlineUsers.map(u => u.userId));
  if (countEl) countEl.textContent = `전체 ${members.length}명`;
  if (members.length === 0) {
    grid.innerHTML = `<div class="empty-feed" style="grid-column:1/-1">
      <div class="empty-feed-icon"><i class="fa-solid fa-users"></i></div>
      <p>아직 방문한 멤버가 없습니다</p>
    </div>`;
    return;
  }
  const sorted = [...members].sort((a, b) => {
    const aOn = onlineIds.has(a.userId) ? 1 : 0;
    const bOn = onlineIds.has(b.userId) ? 1 : 0;
    return bOn - aOn || new Date(b.lastSeen) - new Date(a.lastSeen);
  });
  grid.innerHTML = sorted.map(m => {
    const isOn = onlineIds.has(m.userId);
    const ranked = getRankedUser(m.userId);
    return `
      <div class="member-card ${isOn ? 'online' : 'offline'}" onclick="openUserProfile('${m.userId}')">
        ${avatarHtml(m.avatarUrl, m.color, m.nickname, 'sm')}
        <div class="member-info">
          <div class="member-name">${escHtml(m.nickname)}${ranked ? ` <span style="font-size:12px">${ranked.badge}</span>` : ''}</div>
          <div class="member-status ${isOn ? 'on' : 'off'}">
            <i class="fa-solid fa-circle" style="font-size:7px"></i>
            ${isOn ? '온라인' : '오프라인'}
          </div>
          ${m.bio ? `<div class="member-bio">${escHtml(m.bio)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// =============================================
// 다른 유저 프로필 보기
// =============================================
async function openUserProfile(userId) {
  try {
    const res = await fetch(`/api/users/${userId}/profile`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const ranked = data.rank;

    setAvatarEl($('upAvatar'), data.avatarUrl, data.color, getInitials(data.nickname));
    $('upAvatar').style.background = data.avatarUrl ? 'transparent' : data.color;

    $('upNickname').textContent = data.nickname;
    $('upNickname').style.color = ranked && ranked.rank === 1 ? '' : data.color;
    if (ranked && ranked.rank === 1) {
      $('upNickname').style.background = 'linear-gradient(90deg,#d97706,#f59e0b,#eab308)';
      $('upNickname').style.webkitBackgroundClip = 'text';
      $('upNickname').style.webkitTextFillColor = 'transparent';
    }

    $('upBadge').textContent = ranked ? ranked.badge : '';
    $('upTitle').textContent = ranked ? ranked.title : '';
    $('upTitle').style.display = ranked ? '' : 'none';

    const onlineEl = $('upOnline');
    onlineEl.textContent = data.isOnline ? '● 온라인' : '● 오프라인';
    onlineEl.style.cssText = `font-size:11px;padding:2px 8px;border-radius:10px;background:${data.isOnline ? 'rgba(22,163,74,.1)' : 'rgba(0,0,0,.06)'};color:${data.isOnline ? 'var(--green)' : 'var(--text-3)'}`;

    $('upBio').textContent = data.bio || '소개글이 없습니다.';
    $('upPostCount').textContent = data.postCount || 0;
    $('upLikeCount').textContent = data.totalLikes || 0;

    const bd = data.likeBreakdown || {};
    $('upLikeBreakdown').innerHTML = LIKE_TYPES.map(t =>
      `<span style="font-size:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:2px 8px">${t} ${bd[t]||0}</span>`
    ).join('');

    const recentEl = $('upRecentPosts');
    if (data.recentPosts && data.recentPosts.length > 0) {
      recentEl.innerHTML = `<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-3);margin-bottom:6px">최근 게시글</div>` +
        data.recentPosts.slice(0, 3).map(p => `
          <div style="font-size:12px;padding:5px 0;border-bottom:1px solid var(--border);color:var(--text-2)">
            ${escHtml(p.content?.slice(0, 50) || '(파일)')}
            <span style="color:var(--text-4);margin-left:6px">${formatTime(p.createdAt)}</span>
          </div>`).join('');
    } else {
      recentEl.innerHTML = '';
    }

    // DM 버튼
    const dmBtn = $('upDmBtn');
    const targetUser = state.onlineUsers.find(u => u.userId === userId);
    if (targetUser && targetUser.socketId !== socket.id) {
      dmBtn.style.display = '';
      dmBtn.onclick = () => {
        closeUserProfile();
        openDM(targetUser.socketId, targetUser.nickname, targetUser.color);
      };
    } else {
      dmBtn.style.display = 'none';
    }

    $('userProfileModal').classList.remove('hidden');
  } catch {
    showToast('프로필을 불러올 수 없습니다.', 'error');
  }
}

function closeUserProfile() {
  $('userProfileModal').classList.add('hidden');
}

// =============================================
// 게임존
// =============================================
let gameState = {
  type: null,        // 'gomoku' | 'tictactoe' | 'snake'
  mode: null,        // 'ai' | 'multi'
  roomId: null,
  myTurn: false,
  mySymbol: null,    // '⚫'/'⚪' or 'X'/'O'
  board: null,
  isOver: false,
  snakeTimer: null,
};

function openGame(type) {
  gameState.type = type;
  gameState.mode = null;
  gameState.roomId = null;
  gameState.isOver = false;
  gameState.gomokuCanvas = null;
  gameState.gomokuCtx = null;

  const titles = { gomoku:'⚫ 오목', tictactoe:'❌ 틱택토', snake:'🐍 뱀 게임', chess:'♟ 체스', shooting:'🔫 우주 사격', archery:'🎯 양궁' };
  $('gameModalTitle').textContent = titles[type] || type;
  $('gameModeSelect').classList.remove('hidden');
  $('multiLobby').classList.add('hidden');
  $('multiWaiting').classList.add('hidden');
  $('gameBoard').classList.add('hidden');

  const singleOnly = ['snake', 'shooting', 'archery'];
  const multiSupport = ['gomoku', 'tictactoe', 'chess'];

  if (singleOnly.includes(type)) {
    $('gameModeSelect').innerHTML = `
      <div class="game-mode-btns">
        <button class="btn btn-primary" onclick="startGame('ai')"><i class="fa-solid fa-play"></i> 시작하기</button>
      </div>`;
  } else {
    $('gameModeSelect').innerHTML = `
      <div class="game-mode-btns">
        <button class="btn btn-primary" onclick="startGame('ai')"><i class="fa-solid fa-robot"></i> 1인용 (AI 대전)</button>
        <button class="btn btn-outline" onclick="showMultiLobby()"><i class="fa-solid fa-user-group"></i> 2인용 (온라인)</button>
      </div>`;
  }

  $('gameModal').classList.remove('hidden');
  socket.emit('getGameRooms');
}

function closeGame() {
  if (gameState.snakeTimer) { clearInterval(gameState.snakeTimer); gameState.snakeTimer = null; }
  if (gameState._shootCleanup) { gameState._shootCleanup(); gameState._shootCleanup = null; }
  if (gameState.roomId) socket.emit('leaveGameRoom', { roomId: gameState.roomId });
  $('gameModal').classList.add('hidden');
  gameState = { type:null, mode:null, roomId:null, myTurn:false, mySymbol:null, board:null, isOver:false, snakeTimer:null, gomokuCanvas:null, gomokuCtx:null };
}

function startGame(mode) {
  gameState.mode = mode;
  $('gameModeSelect').classList.add('hidden');
  $('multiLobby').classList.add('hidden');
  $('multiWaiting').classList.add('hidden');
  $('gameBoard').classList.remove('hidden');

  const t = gameState.type;
  if (t === 'gomoku')    initGomoku(mode);
  else if (t === 'tictactoe') initTicTacToe(mode);
  else if (t === 'snake')    initSnake();
  else if (t === 'chess')    initChess(mode);
  else if (t === 'shooting') initShooting();
  else if (t === 'archery')  initArchery();
}

function restartGame() {
  if (gameState.mode) startGame(gameState.mode);
}

// ---- 멀티 로비 ----
function showMultiLobby() {
  $('gameModeSelect').classList.add('hidden');
  $('multiLobby').classList.remove('hidden');
  refreshGameRooms();
}

function refreshGameRooms() { socket.emit('getGameRooms'); }

function createMultiGame() {
  socket.emit('createGameRoom', { gameType: gameState.type, nickname: USER.nickname });
}

function joinGameRoom(roomId) {
  socket.emit('joinGameRoom', { roomId });
}

function leaveGameRoom() {
  if (gameState.roomId) socket.emit('leaveGameRoom', { roomId: gameState.roomId });
  gameState.roomId = null;
  $('multiWaiting').classList.add('hidden');
  $('multiLobby').classList.remove('hidden');
}

// 게임 소켓 이벤트
socket.on('gameRoomsList', (rooms) => {
  const list = $('gameRoomList');
  if (!list) return;
  const filtered = rooms.filter(r => r.gameType === gameState.type && r.players.length < 2);
  if (filtered.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-3);font-size:13px">참가 가능한 방이 없습니다.<br>방을 직접 만들어보세요!</div>`;
    return;
  }
  list.innerHTML = filtered.map(r => `
    <div class="game-room-item">
      <div class="room-info">
        <div class="room-name">${escHtml(r.players[0]?.nickname || '익명')}의 방</div>
        <div class="room-meta">1/2 명 대기 중</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="joinGameRoom('${r.id}')">참가</button>
    </div>`).join('');
});

socket.on('gameRoomCreated', (room) => {
  gameState.roomId = room.id;
  gameState.mySymbol = gameState.type === 'gomoku' ? '⚫' : 'X';
  gameState.myTurn = true;
  $('multiLobby').classList.add('hidden');
  $('multiWaiting').classList.remove('hidden');
  $('multiRoomId').textContent = `방 ID: ${room.id.slice(0,8)}`;
});

socket.on('gameRoomReady', (room) => {
  gameState.roomId = room.id;
  const isFirst = room.players[0].socketId === socket.id;
  gameState.mySymbol = gameState.type === 'gomoku' ? (isFirst ? '⚫' : '⚪') : (isFirst ? 'X' : 'O');
  gameState.myTurn = isFirst;
  $('multiWaiting').classList.add('hidden');
  startGame('multi');
  showToast('상대방이 입장했습니다! 게임 시작!', 'success');
});

socket.on('gameRoomError', ({ message }) => showToast(message, 'error'));

// gameMove 통합 핸들러 (체스 섹션의 socket.on으로 이동)

socket.on('gameOpponentLeft', () => {
  showToast('상대방이 게임을 떠났습니다.', 'warning');
  $('gameStatus').textContent = '상대방이 나갔습니다.';
  gameState.isOver = true;
});

// =============================================
// 오목 (캔버스 기반 - 클릭 버그 수정)
// =============================================
const GOMOKU_SIZE = 13;
const GOMOKU_CELL = 34;
const GOMOKU_PAD  = 22;

function initGomoku(mode) {
  gameState.board = Array(GOMOKU_SIZE).fill(null).map(() => Array(GOMOKU_SIZE).fill(null));
  gameState.isOver = false;
  if (mode === 'ai') { gameState.mySymbol = '⚫'; gameState.myTurn = true; }

  const canvasSize = GOMOKU_CELL * (GOMOKU_SIZE - 1) + GOMOKU_PAD * 2;
  const inner = $('gameBoardInner');
  inner.style.cssText = 'display:flex;justify-content:center;padding:8px 0;overflow-x:auto';
  inner.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.width = canvasSize; canvas.height = canvasSize;
  canvas.style.cssText = 'cursor:pointer;max-width:100%;border-radius:8px;touch-action:none';
  inner.appendChild(canvas);

  gameState.gomokuCanvas = canvas;
  gameState.gomokuCtx = canvas.getContext('2d');
  drawGomokuBoard();

  function getCell(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * sx;
    const my = (e.clientY - rect.top) * sy;
    const c = Math.round((mx - GOMOKU_PAD) / GOMOKU_CELL);
    const r = Math.round((my - GOMOKU_PAD) / GOMOKU_CELL);
    return (c >= 0 && c < GOMOKU_SIZE && r >= 0 && r < GOMOKU_SIZE) ? { r, c } : null;
  }

  canvas.addEventListener('click', (e) => {
    const cell = getCell(e);
    if (cell) handleGomokuClick(cell.r, cell.c);
  });

  updateGomokuStatus();
}

function drawGomokuBoard() {
  const canvas = gameState.gomokuCanvas;
  const ctx    = gameState.gomokuCtx;
  if (!ctx) return;
  const S = GOMOKU_SIZE, C = GOMOKU_CELL, P = GOMOKU_PAD;
  const W = C * (S - 1) + P * 2;

  // 배경 (나무색)
  ctx.fillStyle = '#dcb468';
  ctx.fillRect(0, 0, W, W);

  // 격자선
  ctx.strokeStyle = '#a0763c';
  ctx.lineWidth = 1;
  for (let i = 0; i < S; i++) {
    ctx.beginPath(); ctx.moveTo(P + i*C, P); ctx.lineTo(P + i*C, P + (S-1)*C); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(P, P + i*C); ctx.lineTo(P + (S-1)*C, P + i*C); ctx.stroke();
  }

  // 화점 (별자리)
  ctx.fillStyle = '#a0763c';
  [[3,3],[3,9],[9,3],[9,9],[6,6]].forEach(([sr,sc]) => {
    if (sr < S && sc < S) {
      ctx.beginPath(); ctx.arc(P + sc*C, P + sr*C, 3.5, 0, Math.PI*2); ctx.fill();
    }
  });

  // 돌 그리기
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      if (gameState.board[r][c]) {
        const isBlack = gameState.board[r][c] === '⚫';
        const x = P + c*C, y = P + r*C, rad = C * 0.43;
        const g = ctx.createRadialGradient(x - rad*.3, y - rad*.3, rad*.1, x, y, rad);
        if (isBlack) { g.addColorStop(0, '#666'); g.addColorStop(1, '#111'); }
        else          { g.addColorStop(0, '#fff'); g.addColorStop(1, '#ccc'); }
        ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 5; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI*2);
        ctx.fillStyle = g; ctx.fill();
        ctx.shadowColor = 'transparent';
      }
    }
  }
}

function handleGomokuClick(r, c) {
  if (gameState.isOver || !gameState.myTurn || gameState.board[r][c]) return;
  applyGomokuMove({ r, c }, true);
  if (gameState.mode === 'multi' && !gameState.isOver) {
    socket.emit('gameMove', { roomId: gameState.roomId, move: { r, c } });
  }
  if (gameState.mode === 'ai' && !gameState.isOver) {
    setTimeout(() => { const move = gomokuAI(); if (move) applyGomokuMove(move, false); }, 350);
  }
}

function applyGomokuMove({ r, c }, isMe) {
  const symbol = isMe ? gameState.mySymbol : (gameState.mySymbol === '⚫' ? '⚪' : '⚫');
  gameState.board[r][c] = symbol;
  drawGomokuBoard();
  gameState.myTurn = !isMe;
  if (checkGomokuWin(r, c, symbol)) {
    gameState.isOver = true;
    $('gameStatus').textContent = isMe ? '🎉 내가 이겼습니다!' : '😢 상대방이 이겼습니다!';
    if (gameState.mode === 'multi') socket.emit('gameEnd', { roomId: gameState.roomId, result: {} });
  } else {
    updateGomokuStatus();
  }
}

function updateGomokuStatus() {
  $('gameStatus').textContent = gameState.myTurn
    ? `내 차례 ${gameState.mySymbol}`
    : `상대 차례 ${gameState.mySymbol === '⚫' ? '⚪' : '⚫'}`;
}

function checkGomokuWin(r, c, sym) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr,dc] of dirs) {
    let cnt = 1;
    for (let i = 1; i < 5; i++) { const nr=r+dr*i,nc=c+dc*i; if (nr<0||nr>=GOMOKU_SIZE||nc<0||nc>=GOMOKU_SIZE||gameState.board[nr][nc]!==sym) break; cnt++; }
    for (let i = 1; i < 5; i++) { const nr=r-dr*i,nc=c-dc*i; if (nr<0||nr>=GOMOKU_SIZE||nc<0||nc>=GOMOKU_SIZE||gameState.board[nr][nc]!==sym) break; cnt++; }
    if (cnt >= 5) return true;
  }
  return false;
}

function gomokuAI() {
  const aiSym = gameState.mySymbol === '⚫' ? '⚪' : '⚫';
  const mySym = gameState.mySymbol;
  let best = null, bestScore = -1;
  const empty = [];
  for (let r=0;r<GOMOKU_SIZE;r++) for (let c=0;c<GOMOKU_SIZE;c++) if (!gameState.board[r][c]) empty.push([r,c]);
  for (const [r,c] of empty) {
    let score = 0;
    gameState.board[r][c] = aiSym;
    if (checkGomokuWin(r,c,aiSym)) { gameState.board[r][c] = null; return {r,c}; }
    gameState.board[r][c] = null;
    gameState.board[r][c] = mySym;
    if (checkGomokuWin(r,c,mySym)) score += 900;
    gameState.board[r][c] = null;
    const dirs=[[0,1],[1,0],[1,1],[1,-1]];
    for (const [dr,dc] of dirs) {
      let a=0,b=0;
      for(let i=1;i<5;i++){const nr=r+dr*i,nc=c+dc*i;if(nr<0||nr>=GOMOKU_SIZE||nc<0||nc>=GOMOKU_SIZE)break;if(gameState.board[nr][nc]===aiSym)a++;else break;}
      for(let i=1;i<5;i++){const nr=r-dr*i,nc=c-dc*i;if(nr<0||nr>=GOMOKU_SIZE||nc<0||nc>=GOMOKU_SIZE)break;if(gameState.board[nr][nc]===aiSym)b++;else break;}
      score += Math.pow(10, a+b);
    }
    if (score > bestScore) { bestScore = score; best = {r,c}; }
  }
  if (!best && empty.length) best = { r: empty[0][0], c: empty[0][1] };
  return best;
}

// =============================================
// 틱택토
// =============================================
function initTicTacToe(mode) {
  gameState.board = Array(9).fill(null);
  gameState.isOver = false;
  if (mode === 'ai') { gameState.mySymbol = 'X'; gameState.myTurn = true; }

  const inner = $('gameBoardInner');
  inner.innerHTML = '';
  const board = document.createElement('div');
  board.className = 'ttt-board';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'ttt-cell';
    cell.dataset.idx = i;
    cell.onclick = () => handleTTTClick(i);
    board.appendChild(cell);
  }
  inner.style.display = 'flex'; inner.style.justifyContent = 'center'; inner.style.padding = '12px 0';
  inner.appendChild(board);
  updateTTTStatus();
}

function handleTTTClick(idx) {
  if (gameState.isOver || !gameState.myTurn || gameState.board[idx]) return;
  applyTTTMove(idx, true);
  if (gameState.mode === 'multi' && !gameState.isOver) {
    socket.emit('gameMove', { roomId: gameState.roomId, move: { idx } });
  }
  if (gameState.mode === 'ai' && !gameState.isOver) {
    setTimeout(() => { const i = tttAI(); if (i !== null) applyTTTMove(i, false); }, 300);
  }
}

function applyTTTMove(idx, isMe) {
  const sym = isMe ? gameState.mySymbol : (gameState.mySymbol === 'X' ? 'O' : 'X');
  gameState.board[idx] = sym;
  const cell = $('gameBoardInner').querySelector(`[data-idx="${idx}"]`);
  if (cell) { cell.textContent = sym === 'X' ? '❌' : '⭕'; cell.classList.add('taken'); }
  gameState.myTurn = !isMe;
  const winner = checkTTTWin();
  if (winner) {
    gameState.isOver = true;
    $('gameStatus').textContent = winner === gameState.mySymbol ? '🎉 내가 이겼습니다!' : '😢 상대방이 이겼습니다!';
    if (gameState.mode === 'multi') socket.emit('gameEnd', { roomId: gameState.roomId, result: {} });
  } else if (gameState.board.every(v => v)) {
    gameState.isOver = true;
    $('gameStatus').textContent = '🤝 무승부!';
  } else { updateTTTStatus(); }
}

function checkTTTWin() {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (gameState.board[a] && gameState.board[a]===gameState.board[b] && gameState.board[a]===gameState.board[c]) return gameState.board[a];
  }
  return null;
}

function tttAI() {
  const aiSym = gameState.mySymbol === 'X' ? 'O' : 'X';
  const mySym = gameState.mySymbol;
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if ([gameState.board[a],gameState.board[b],gameState.board[c]].filter(x=>x===aiSym).length===2 &&
        [a,b,c].find(i=>!gameState.board[i])!==undefined) return [a,b,c].find(i=>!gameState.board[i]);
  }
  for (const [a,b,c] of lines) {
    if ([gameState.board[a],gameState.board[b],gameState.board[c]].filter(x=>x===mySym).length===2 &&
        [a,b,c].find(i=>!gameState.board[i])!==undefined) return [a,b,c].find(i=>!gameState.board[i]);
  }
  if (!gameState.board[4]) return 4;
  const corners = [0,2,6,8].filter(i=>!gameState.board[i]);
  if (corners.length) return corners[Math.floor(Math.random()*corners.length)];
  return [1,3,5,7].find(i=>!gameState.board[i]) ?? null;
}

function updateTTTStatus() {
  $('gameStatus').textContent = gameState.myTurn ? `내 차례 ${gameState.mySymbol==='X'?'❌':'⭕'}` : `상대 차례`;
}

// =============================================
// 뱀 게임
// =============================================
function initSnake() {
  if (gameState.snakeTimer) clearInterval(gameState.snakeTimer);
  const COLS = 20, ROWS = 16, CELL = 20;
  let snake = [{x:10,y:8},{x:9,y:8},{x:8,y:8}];
  let dir = {x:1,y:0}, nextDir = {x:1,y:0};
  let food = randomFood(snake, COLS, ROWS);
  let score = 0;
  gameState.isOver = false;

  const inner = $('gameBoardInner');
  inner.style = 'display:flex;justify-content:center;padding:8px 0';
  inner.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'snake-canvas';
  canvas.width = COLS * CELL; canvas.height = ROWS * CELL;
  inner.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const keyHandler = (e) => {
    const map = { ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0},
                  w:{x:0,y:-1}, s:{x:0,y:1}, a:{x:-1,y:0}, d:{x:1,y:0} };
    const nd = map[e.key];
    if (nd && !(nd.x===-dir.x && nd.y===-dir.y)) { nextDir = nd; e.preventDefault(); }
  };
  document.addEventListener('keydown', keyHandler);
  canvas._cleanup = () => document.removeEventListener('keydown', keyHandler);

  function draw() {
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath(); ctx.arc((food.x+.5)*CELL,(food.y+.5)*CELL,CELL*.4,0,Math.PI*2); ctx.fill();
    snake.forEach((seg,i) => {
      ctx.fillStyle = i===0 ? '#00d4aa' : '#00a884';
      ctx.beginPath(); ctx.roundRect(seg.x*CELL+1,seg.y*CELL+1,CELL-2,CELL-2,4); ctx.fill();
    });
    ctx.fillStyle='#fff'; ctx.font='12px sans-serif'; ctx.fillText(`점수: ${score}`,6,14);
  }

  function tick() {
    dir = nextDir;
    const head = {x: snake[0].x+dir.x, y: snake[0].y+dir.y};
    if (head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS||snake.some(s=>s.x===head.x&&s.y===head.y)) {
      clearInterval(gameState.snakeTimer);
      canvas._cleanup && canvas._cleanup();
      $('gameStatus').textContent = `💀 게임오버! 최종 점수: ${score}`;
      return;
    }
    snake.unshift(head);
    if (head.x===food.x && head.y===food.y) { score++; food=randomFood(snake,COLS,ROWS); }
    else snake.pop();
    draw();
  }

  draw();
  $('gameStatus').textContent = '방향키 또는 WASD로 조작하세요!';
  gameState.snakeTimer = setInterval(tick, 130);
  canvas.addEventListener('remove', () => { clearInterval(gameState.snakeTimer); canvas._cleanup&&canvas._cleanup(); });
}

function randomFood(snake, cols, rows) {
  let f;
  do { f={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)}; }
  while (snake.some(s=>s.x===f.x&&s.y===f.y));
  return f;
}

// =============================================
// 체스
// =============================================
const CHESS_PIECES = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
};

function initChess(mode) {
  // 초기 배치
  const INIT = [
    ['bR','bN','bB','bQ','bK','bB','bN','bR'],
    ['bP','bP','bP','bP','bP','bP','bP','bP'],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ['wP','wP','wP','wP','wP','wP','wP','wP'],
    ['wR','wN','wB','wQ','wK','wB','wN','wR'],
  ];
  gameState.board = INIT.map(r => [...r]);
  gameState.isOver = false;
  gameState.mySymbol = 'w'; // 플레이어는 흰색
  gameState.myTurn = true;
  gameState.selected = null;
  gameState.possibleMoves = [];

  const inner = $('gameBoardInner');
  inner.style.cssText = 'display:flex;justify-content:center;padding:8px 0';
  inner.innerHTML = '';
  renderChessBoard();
  $('gameStatus').textContent = '흰색(♙)이 먼저 시작합니다!';
}

function renderChessBoard() {
  const inner = $('gameBoardInner');
  inner.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'chess-board';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      cell.className = 'chess-cell ' + (isLight ? 'light' : 'dark');

      if (gameState.selected && gameState.selected[0] === r && gameState.selected[1] === c)
        cell.classList.add('selected');
      if (gameState.possibleMoves.some(([pr,pc]) => pr === r && pc === c))
        cell.classList.add('possible');

      const piece = gameState.board[r][c];
      if (piece) cell.textContent = CHESS_PIECES[piece];

      cell.addEventListener('click', () => handleChessClick(r, c));
      grid.appendChild(cell);
    }
  }
  inner.appendChild(grid);
}

function handleChessClick(r, c) {
  if (gameState.isOver || !gameState.myTurn) return;
  const piece = gameState.board[r][c];

  // 이동 가능한 칸 클릭
  if (gameState.selected && gameState.possibleMoves.some(([pr,pc]) => pr === r && pc === c)) {
    applyChessMove(gameState.selected[0], gameState.selected[1], r, c, true);
    return;
  }

  // 내 말 선택
  if (piece && piece.startsWith(gameState.mySymbol)) {
    gameState.selected = [r, c];
    gameState.possibleMoves = getChessMoves(r, c);
    renderChessBoard();
    return;
  }

  // 선택 취소
  gameState.selected = null;
  gameState.possibleMoves = [];
  renderChessBoard();
}

function applyChessMove(fr, fc, tr, tc, isMe) {
  const captured = gameState.board[tr][tc];
  gameState.board[tr][tc] = gameState.board[fr][fc];
  gameState.board[fr][fc] = null;

  // 폰 승급
  if (gameState.board[tr][tc] === 'wP' && tr === 0) gameState.board[tr][tc] = 'wQ';
  if (gameState.board[tr][tc] === 'bP' && tr === 7) gameState.board[tr][tc] = 'bQ';

  gameState.selected = null;
  gameState.possibleMoves = [];

  if (captured === 'bK' || captured === 'wK') {
    gameState.isOver = true;
    renderChessBoard();
    $('gameStatus').textContent = isMe ? '🎉 승리! 왕을 잡았습니다!' : '😢 패배! 왕을 잡혔습니다!';
    if (gameState.mode === 'multi') socket.emit('gameEnd', { roomId: gameState.roomId, result: {} });
    return;
  }

  gameState.myTurn = !isMe;
  renderChessBoard();

  if (gameState.mode === 'multi' && isMe) {
    socket.emit('gameMove', { roomId: gameState.roomId, move: { fr, fc, tr, tc } });
    $('gameStatus').textContent = '상대방 차례...';
  } else if (gameState.mode === 'ai' && isMe && !gameState.isOver) {
    $('gameStatus').textContent = 'AI 생각 중...';
    setTimeout(chessAIMove, 400);
  }
}

function getChessMoves(r, c) {
  const piece = gameState.board[r][c];
  if (!piece) return [];
  const color = piece[0], type = piece[1];
  const moves = [];
  const enemy = color === 'w' ? 'b' : 'w';
  const dir = color === 'w' ? -1 : 1;

  const inBounds = (r,c) => r>=0&&r<8&&c>=0&&c<8;
  const isEmpty = (r,c) => inBounds(r,c) && !gameState.board[r][c];
  const isEnemy = (r,c) => inBounds(r,c) && gameState.board[r][c]?.startsWith(enemy);
  const canGo = (r,c) => isEmpty(r,c) || isEnemy(r,c);

  const slide = (drs, dcs) => {
    for (let i=0;i<drs.length;i++) {
      let nr=r+drs[i], nc=c+dcs[i];
      while (inBounds(nr,nc)) {
        if (gameState.board[nr][nc]) { if (isEnemy(nr,nc)) moves.push([nr,nc]); break; }
        moves.push([nr,nc]); nr+=drs[i]; nc+=dcs[i];
      }
    }
  };

  if (type === 'P') {
    if (isEmpty(r+dir,c)) {
      moves.push([r+dir,c]);
      const startRow = color==='w'?6:1;
      if (r===startRow && isEmpty(r+dir*2,c)) moves.push([r+dir*2,c]);
    }
    if (isEnemy(r+dir,c-1)) moves.push([r+dir,c-1]);
    if (isEnemy(r+dir,c+1)) moves.push([r+dir,c+1]);
  } else if (type === 'N') {
    [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>{
      if (canGo(r+dr,c+dc)) moves.push([r+dr,c+dc]);
    });
  } else if (type === 'K') {
    [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>{
      if (canGo(r+dr,c+dc)) moves.push([r+dr,c+dc]);
    });
  } else if (type === 'R') {
    slide([-1,1,0,0],[0,0,-1,1]);
  } else if (type === 'B') {
    slide([-1,-1,1,1],[-1,1,-1,1]);
  } else if (type === 'Q') {
    slide([-1,1,0,0,-1,-1,1,1],[0,0,-1,1,-1,1,-1,1]);
  }
  return moves;
}

function chessAIMove() {
  if (gameState.isOver || gameState.myTurn) return;
  const enemy = 'b';
  let best = null, bestScore = -Infinity;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!gameState.board[r][c]?.startsWith(enemy)) continue;
      const moves = getChessMoves(r, c);
      for (const [tr, tc] of moves) {
        const cap = gameState.board[tr][tc];
        const score = cap ? { P:1, N:3, B:3, R:5, Q:9, K:100 }[cap[1]] || 0 : 0;
        const rand = Math.random() * 0.5;
        if (score + rand > bestScore) { bestScore = score + rand; best = {r,c,tr,tc}; }
      }
    }
  }
  if (best) {
    applyChessMove(best.r, best.c, best.tr, best.tc, false);
    if (!gameState.isOver) {
      gameState.myTurn = true;
      $('gameStatus').textContent = '내 차례 (흰색 ♙)';
    }
  }
}

// 멀티 체스 이동 수신
socket.on('gameMove', ({ move }) => {
  if (gameState.type === 'chess' && move.fr !== undefined) {
    applyChessMove(move.fr, move.fc, move.tr, move.tc, false);
    gameState.myTurn = true;
    $('gameStatus').textContent = '내 차례';
  } else if (gameState.type === 'gomoku') {
    applyGomokuMove(move, false);
  } else if (gameState.type === 'tictactoe') {
    applyTTTMove(move.idx, false);
  }
});

// =============================================
// 우주 사격 게임
// =============================================
function initShooting() {
  if (gameState.snakeTimer) clearInterval(gameState.snakeTimer);
  const W = 380, H = 480;
  const inner = $('gameBoardInner');
  inner.style.cssText = 'display:flex;justify-content:center;padding:8px 0';
  inner.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.cssText = 'cursor:crosshair;max-width:100%;border-radius:8px;background:#0a0a2e';
  inner.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let player = { x: W/2, y: H-50, w: 34, h: 28 };
  let bullets = [], enemies = [], stars = [];
  let score = 0, lives = 3, wave = 1, frame = 0, running = true;

  // 별 배경
  for (let i=0;i<60;i++) stars.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.5+.3,s:Math.random()*.5+.2});

  function spawnEnemies() {
    for (let c=0;c<Math.min(5+wave,8);c++)
      enemies.push({x:60+c*(W-60)/7,y:30+Math.floor(Math.random()*3)*32,w:28,h:22,hp:wave,shootTimer:Math.random()*120+60,dir:1});
  }
  spawnEnemies();

  // 조작
  const keys = {};
  const kd = e => { keys[e.key]=true; e.preventDefault(); };
  const ku = e => keys[e.key]=false;
  document.addEventListener('keydown', kd);
  document.addEventListener('keyup',   ku);

  canvas.addEventListener('click', () => {
    if (running) bullets.push({x:player.x,y:player.y-14,vy:-8,isPlayer:true});
  });
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    player.x = Math.max(20, Math.min(W-20, (e.clientX-rect.left)*(W/rect.width)));
  });

  const tid = setInterval(() => {
    if (!running) return;
    frame++;

    // 플레이어 이동 (키보드)
    if (keys['ArrowLeft']||keys['a']) player.x = Math.max(20, player.x-4);
    if (keys['ArrowRight']||keys['d']) player.x = Math.min(W-20, player.x+4);
    if ((keys[' ']||keys['ArrowUp']) && frame%10===0) bullets.push({x:player.x,y:player.y-14,vy:-8,isPlayer:true});

    // 적 이동 + 사격
    let hitEdge = false;
    enemies.forEach(e => {
      e.x += e.dir * (1+wave*.2);
      if (e.x>W-20||e.x<20) hitEdge = true;
      e.shootTimer--;
      if (e.shootTimer <= 0) {
        bullets.push({x:e.x,y:e.y+12,vy:3+wave*.3,isPlayer:false});
        e.shootTimer = 80 + Math.random()*60;
      }
    });
    if (hitEdge) enemies.forEach(e => { e.dir*=-1; e.y+=16; });

    // 총알 이동
    bullets = bullets.filter(b => b.y>-10 && b.y<H+10);
    bullets.forEach(b => b.y += b.vy);

    // 충돌 검사
    bullets.forEach((b,bi) => {
      if (b.isPlayer) {
        enemies.forEach((e,ei) => {
          if (Math.abs(b.x-e.x)<16 && Math.abs(b.y-e.y)<14) {
            e.hp--; bullets.splice(bi,1,{y:9999});
            if (e.hp<=0) { enemies.splice(ei,1); score+=10+wave*2; }
          }
        });
      } else {
        if (Math.abs(b.x-player.x)<16 && Math.abs(b.y-player.y)<14) {
          lives--; bullets.splice(bi,1,{y:9999});
          if (lives<=0) { running=false; $('gameStatus').textContent=`💀 게임오버! 점수: ${score}`; }
        }
      }
    });

    if (enemies.length===0) { wave++; spawnEnemies(); }

    // 그리기
    ctx.fillStyle='#0a0a2e'; ctx.fillRect(0,0,W,H);
    stars.forEach(s => { s.y+=s.s; if(s.y>H)s.y=0; ctx.fillStyle='rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); });

    // 플레이어 우주선
    ctx.fillStyle='#00d4ff';
    ctx.beginPath(); ctx.moveTo(player.x,player.y-14); ctx.lineTo(player.x+17,player.y+14); ctx.lineTo(player.x-17,player.y+14); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(0,212,255,.3)'; ctx.beginPath(); ctx.ellipse(player.x,player.y+4,18,8,0,0,Math.PI*2); ctx.fill();

    // 적 우주선
    enemies.forEach(e => {
      ctx.fillStyle='#ff4466';
      ctx.beginPath(); ctx.moveTo(e.x,e.y+12); ctx.lineTo(e.x+14,e.y-10); ctx.lineTo(e.x-14,e.y-10); ctx.closePath(); ctx.fill();
    });

    // 총알
    bullets.forEach(b => {
      ctx.fillStyle = b.isPlayer ? '#ffe66d' : '#ff6b6b';
      ctx.fillRect(b.x-2, b.y-5, 4, 10);
    });

    // HUD
    ctx.fillStyle='#fff'; ctx.font='bold 14px sans-serif';
    ctx.fillText(`점수: ${score}`, 10, 22);
    ctx.fillText(`목숨: ${'❤️'.repeat(lives)}`, 10, 42);
    ctx.fillText(`웨이브: ${wave}`, W-90, 22);
  }, 1000/60);

  gameState.snakeTimer = tid;
  gameState._shootCleanup = () => { document.removeEventListener('keydown',kd); document.removeEventListener('keyup',ku); };
  $('gameStatus').textContent = '마우스로 이동 · 클릭/스페이스로 사격!';
}

// =============================================
// 양궁 게임
// =============================================
function initArchery() {
  if (gameState.snakeTimer) clearInterval(gameState.snakeTimer);
  const W = 380, H = 360;
  const inner = $('gameBoardInner');
  inner.style.cssText = 'display:flex;justify-content:center;padding:8px 0';
  inner.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.cssText = 'max-width:100%;border-radius:8px;background:#1a3a1a;cursor:pointer';
  inner.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let score = 0, arrows = 5, phase = 'aim'; // aim → release → result
  let windAngle = 0, windSpeed = 0;
  let aimAngle = Math.PI/2; // 90° = 직선
  let power = 0, powerDir = 1;
  let arrow = null, frameId;

  function newRound() {
    windAngle = (Math.random() - 0.5) * 0.6;
    windSpeed = Math.random() * 2 + 0.5;
    power = 0; powerDir = 1; phase = 'aim'; arrow = null;
  }
  newRound();

  // 과녁 중심
  const TX = W/2, TY = 100;
  const RINGS = [50,40,30,20,10]; // 점수

  function drawTarget() {
    const colors = ['#fff','#000','#00a','#f00','#ff0'];
    [60,46,32,18,8].forEach((r,i) => {
      ctx.fillStyle = colors[i];
      ctx.beginPath(); ctx.arc(TX, TY, r, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(TX, TY, 3, 0, Math.PI*2); ctx.fill();
  }

  function drawScene() {
    // 배경
    ctx.fillStyle = '#1a3a1a'; ctx.fillRect(0, 0, W, H);
    // 잔디
    ctx.fillStyle = '#2d5a2d'; ctx.fillRect(0, H-60, W, 60);
    // 과녁대
    ctx.fillStyle = '#8B4513'; ctx.fillRect(TX-6, TY+60, 12, H-120-TY);
    drawTarget();

    // 바람 표시
    ctx.save();
    ctx.translate(60, 30);
    ctx.strokeStyle = '#88ccff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(windAngle)*windSpeed*20, Math.sin(windAngle)*windSpeed*20);
    ctx.stroke();
    ctx.fillStyle='#88ccff'; ctx.font='12px sans-serif';
    ctx.fillText(`💨 ${windSpeed.toFixed(1)}`, 30, 5);
    ctx.restore();

    // 조준각 표시 (aim phase)
    if (phase === 'aim') {
      const AX = W/2, AY = H-30;
      ctx.save();
      ctx.translate(AX, AY);
      // 파워 게이지
      ctx.fillStyle = '#333'; ctx.fillRect(-40, -8, 80, 6);
      ctx.fillStyle = `hsl(${120-power*1.2},80%,50%)`;
      ctx.fillRect(-40, -8, power*0.8, 6);
      ctx.fillStyle = '#aaa'; ctx.font='11px sans-serif'; ctx.fillText('파워', -60, -2);

      // 조준선
      const len = 80;
      ctx.strokeStyle = 'rgba(255,200,0,.7)'; ctx.lineWidth = 2;
      ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(0,0);
      ctx.lineTo(-Math.cos(aimAngle)*len, -Math.sin(aimAngle)*len);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }

    // 화살
    if (arrow) {
      ctx.save();
      ctx.translate(arrow.x, arrow.y);
      ctx.rotate(Math.atan2(arrow.vy, arrow.vx));
      ctx.fillStyle = '#8B4513'; ctx.fillRect(-20, -1.5, 24, 3);
      ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(4,0); ctx.lineTo(-4,-5); ctx.lineTo(-4,5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // HUD
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`점수: ${score}`, 10, 22);
    ctx.fillText(`화살: ${'🏹'.repeat(Math.max(0,arrows))}`, 10, 42);
    if (phase === 'aim') {
      ctx.fillStyle = '#ffe'; ctx.font = '12px sans-serif';
      ctx.fillText('클릭 또는 스페이스로 발사!', W/2-70, H-8);
    }
  }

  function shoot() {
    if (phase !== 'aim' || arrows <= 0) return;
    arrows--;
    const AX = W/2, AY = H-30;
    const spd = 8 + power * 0.08;
    arrow = {
      x: AX, y: AY,
      vx: -Math.cos(aimAngle)*spd,
      vy: -Math.sin(aimAngle)*spd
    };
    phase = 'release';
  }

  canvas.addEventListener('click', shoot);
  document.addEventListener('keydown', function sh(e){ if(e.key===' '){shoot();e.preventDefault();} if(e.key==='Escape'||e.key==='q'){clearInterval(gameState.snakeTimer);cancelAnimationFrame(frameId);document.removeEventListener('keydown',sh);} });

  let t = 0;
  const tid = setInterval(() => {
    t++;
    // 조준 흔들림
    if (phase === 'aim') {
      aimAngle = Math.PI/2 + Math.sin(t*0.03)*0.4;
      power += powerDir * 1.5;
      if (power >= 100 || power <= 0) powerDir *= -1;
    }

    // 화살 비행
    if (phase === 'release' && arrow) {
      arrow.x += arrow.vx + Math.cos(windAngle)*windSpeed*0.15;
      arrow.y += arrow.vy;
      arrow.vy += 0.2; // 중력

      // 과녁 명중 확인
      const dx = arrow.x - TX, dy = arrow.y - TY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 62) {
        // 점수 계산
        const pts = dist < 8 ? 10 : dist < 18 ? 8 : dist < 32 ? 6 : dist < 46 ? 4 : 2;
        score += pts;
        $('gameStatus').textContent = `${pts === 10 ? '🎯 퍼펙트!' : pts >= 6 ? '👍 굿샷!' : '화살 적중!'} +${pts}점`;
        phase = 'hit';
        setTimeout(() => { if (arrows > 0) newRound(); else { clearInterval(gameState.snakeTimer); $('gameStatus').textContent = `🏆 최종 점수: ${score}점`; } }, 1500);
      }

      // 땅/화면 이탈
      if (arrow.y > H || arrow.x < 0 || arrow.x > W) {
        $('gameStatus').textContent = `빗나갔습니다! 남은 화살: ${arrows}개`;
        phase = arrows > 0 ? 'miss' : 'over';
        setTimeout(() => { if (arrows > 0) newRound(); else { clearInterval(gameState.snakeTimer); $('gameStatus').textContent = `🏆 최종 점수: ${score}점`; } }, 1200);
      }
    }
    drawScene();
  }, 1000/60);

  gameState.snakeTimer = tid;
  $('gameStatus').textContent = '클릭으로 발사! 타이밍에 맞춰 쏘세요!';
}

// =============================================
// 블록 코딩 시스템
// =============================================

const BC_CATS = [
  { id:'event',    label:'이벤트',  color:'#f59e0b', blocks:[
    { type:'event_start',   label:'🚀 시작하면',               params:[] },
    { type:'event_keydown', label:'⌨️ [key] 키를 눌렀을 때', params:[{name:'key',type:'keysel',default:'오른쪽'}] },
  ]},
  { id:'motion',   label:'이동',    color:'#3b82f6', blocks:[
    { type:'motion_x',      label:'➡️ X를 [n] 만큼 바꾸기',    params:[{name:'n',type:'num',default:'10'}] },
    { type:'motion_y',      label:'⬆️ Y를 [n] 만큼 바꾸기',    params:[{name:'n',type:'num',default:'10'}] },
    { type:'motion_setx',   label:'📍 X 위치를 [x] 로 정하기', params:[{name:'x',type:'num',default:'160'}] },
    { type:'motion_sety',   label:'📍 Y 위치를 [y] 로 정하기', params:[{name:'y',type:'num',default:'120'}] },
    { type:'motion_bounce', label:'🔄 벽에서 튕기기',           params:[] },
    { type:'motion_velx',   label:'💨 가로 속도를 [vx] 로',    params:[{name:'vx',type:'num',default:'2'}] },
    { type:'motion_vely',   label:'💨 세로 속도를 [vy] 로',    params:[{name:'vy',type:'num',default:'2'}] },
    { type:'motion_applyvel',label:'▶️ 속도 적용하기',          params:[] },
  ]},
  { id:'looks',    label:'생김새',  color:'#8b5cf6', blocks:[
    { type:'looks_color',  label:'🎨 색을 [color] 로 바꾸기',   params:[{name:'color',type:'color',default:'#ff0000'}] },
    { type:'looks_size',   label:'📏 크기를 [size] 로 정하기',  params:[{name:'size',type:'num',default:'40'}] },
    { type:'looks_show',   label:'👁 보이기',                   params:[] },
    { type:'looks_hide',   label:'🙈 숨기기',                   params:[] },
    { type:'looks_label',  label:'🏷 텍스트를 [text] 로 정하기',params:[{name:'text',type:'text',default:'안녕!'}] },
  ]},
  { id:'control',  label:'제어',    color:'#f97316', blocks:[
    { type:'control_forever',label:'♾ 계속 반복하기',           params:[],                                     hasChildren:true },
    { type:'control_repeat', label:'🔢 [n] 번 반복하기',         params:[{name:'n',type:'num',default:'10'}],  hasChildren:true },
    { type:'control_wait',   label:'⏰ [n] 초 기다리기',         params:[{name:'n',type:'num',default:'1'}] },
    { type:'control_if',     label:'❓ 만약 [cond] 이라면',      params:[{name:'cond',type:'cond',default:'right_key'}], hasChildren:true },
  ]},
  { id:'sense',    label:'감지',    color:'#06b6d4', blocks:[
    { type:'sense_key',  label:'🎮 [key] 키가 눌렸는지',         params:[{name:'key',type:'keysel',default:'오른쪽'}] },
    { type:'sense_edge', label:'🟦 화면 끝에 닿았는지',          params:[] },
  ]},
  { id:'sound',    label:'소리',    color:'#10b981', blocks:[
    { type:'sound_beep', label:'🔊 삑 소리 내기',                params:[] },
  ]},
  { id:'variable', label:'변수',    color:'#ef4444', blocks:[
    { type:'var_set',    label:'📊 변수 [name] 을 [val] 로',     params:[{name:'name',type:'text',default:'점수'},{name:'val',type:'num',default:'0'}] },
    { type:'var_change', label:'📈 변수 [name] 을 [n] 만큼',     params:[{name:'name',type:'text',default:'점수'},{name:'n',type:'num',default:'1'}] },
    { type:'var_show',   label:'👁 변수 [name] 보이기',          params:[{name:'name',type:'text',default:'점수'}] },
  ]},
];

const KEY_MAP = { '오른쪽':'ArrowRight','왼쪽':'ArrowLeft','위':'ArrowUp','아래':'ArrowDown','스페이스':' ','A':'a','S':'s','D':'d','W':'w' };
const COND_MAP = { right_key:'오른쪽 키',left_key:'왼쪽 키',up_key:'위 키',down_key:'아래 키',space_key:'스페이스',edge:'벽에 닿음' };

let bcScript = [];
let bcSprite  = { x:160, y:120, w:40, h:40, color:'#3b82f6', shape:'rect', visible:true, velX:0, velY:0, label:'' };
let bcBgColor = '#87ceeb';
let bcRuntime = null;
let bcVars = {}, bcShownVars = new Set();
let _bcIdCounter = 0;
const bcId = () => 'blk' + (++_bcIdCounter);

function bcInitPalette() {
  const el = $('bcPalette');
  if (!el) return;
  el.innerHTML = BC_CATS.map(cat => `
    <div>
      <div class="bc-cat-header" onclick="bcToggleCat('${cat.id}')">
        <div class="bc-cat-dot" style="background:${cat.color}"></div>
        <span>${cat.label}</span>
        <i class="fa-solid fa-chevron-right" id="bcCatArrow-${cat.id}" style="font-size:10px;margin-left:auto;color:var(--text-3);transition:transform .2s"></i>
      </div>
      <div class="bc-cat-blocks" id="bcCat-${cat.id}">
        ${cat.blocks.map(b => `<button class="bc-block-item" onclick="bcAddBlock('${b.type}')">
          <span class="bc-block-pill" style="background:${cat.color}">${b.label.replace(/\[[^\]]+\]/g,'(값)')}</span>
        </button>`).join('')}
      </div>
    </div>`).join('');
}

function bcToggleCat(id) {
  const el = $('bcCat-'+id), arrow = $('bcCatArrow-'+id);
  el.classList.toggle('open');
  if (arrow) arrow.style.transform = el.classList.contains('open') ? 'rotate(90deg)' : '';
}

function bcAddBlock(type, parentId) {
  const cat = BC_CATS.find(c => c.blocks.some(b => b.type===type));
  const def = cat?.blocks.find(b => b.type===type);
  if (!def) return;
  const params = {};
  def.params.forEach(p => params[p.name] = p.default);
  const block = { id:bcId(), type, params, children: def.hasChildren ? [] : undefined };
  if (parentId) {
    const parent = bcFindBlock(bcScript, parentId);
    if (parent?.children) parent.children.push(block);
  } else {
    bcScript.push(block);
  }
  bcRenderScript();
}

function bcFindBlock(blocks, id) {
  for (const b of blocks) {
    if (b.id===id) return b;
    if (b.children) { const f = bcFindBlock(b.children, id); if (f) return f; }
  }
  return null;
}

function bcDeleteBlock(id) {
  function remove(arr) {
    const i = arr.findIndex(b => b.id===id);
    if (i!==-1) { arr.splice(i,1); return true; }
    for (const b of arr) if (b.children && remove(b.children)) return true;
    return false;
  }
  remove(bcScript); bcRenderScript();
}

function bcMoveBlock(id, dir) {
  function move(arr) {
    const i = arr.findIndex(b => b.id===id);
    if (i!==-1) { const j=i+dir; if(j>=0&&j<arr.length){[arr[i],arr[j]]=[arr[j],arr[i]];return true;} return false; }
    for (const b of arr) if (b.children && move(b.children)) return true;
    return false;
  }
  move(bcScript); bcRenderScript();
}

function bcClearScript() {
  if (!confirm('스크립트를 모두 초기화할까요?')) return;
  bcScript = []; bcRenderScript();
}

function bcRenderScript() {
  const area = $('bcScriptArea');
  if (!area) return;
  if (bcScript.length===0) { area.innerHTML='<div class="bc-empty-hint">← 왼쪽에서 블록을 클릭해 추가하세요</div>'; return; }
  area.innerHTML = '';
  bcScript.forEach(b => area.appendChild(bcRenderBlock(b, true)));
  if (!bcRuntime) bcDrawPreview();
}

function bcRenderBlock(block, isTop) {
  const cat = BC_CATS.find(c => c.blocks.some(b => b.type===block.type));
  const def  = cat?.blocks.find(b => b.type===block.type);
  if (!def) return document.createTextNode('');
  const color = cat.color;

  const wrap = document.createElement('div');
  wrap.className = 'bc-script-block';
  wrap.style.borderColor = color+'44';

  const header = document.createElement('div');
  header.className = 'bc-script-block-header';
  header.style.background = color;

  const labelEl = document.createElement('div');
  labelEl.className = 'bc-script-block-label';

  def.label.split(/(\[[^\]]+\])/).forEach(part => {
    const match = part.match(/^\[(\w+)\]$/);
    if (match) {
      const pname = match[1];
      const pDef  = def.params.find(p => p.name===pname);
      if (!pDef) return;
      if (pDef.type==='color') {
        const inp = document.createElement('input');
        inp.type='color'; inp.value=block.params[pname]||pDef.default;
        inp.style.cssText='width:28px;height:22px;border:none;background:transparent;cursor:pointer;border-radius:3px;padding:0';
        inp.addEventListener('change', e => { block.params[pname]=e.target.value; bcDrawPreview(); });
        labelEl.appendChild(inp);
      } else if (pDef.type==='keysel'||pDef.type==='cond') {
        const opts = pDef.type==='keysel' ? ['오른쪽','왼쪽','위','아래','스페이스','A','S','D','W'] : Object.keys(COND_MAP);
        const sel = document.createElement('select');
        sel.style.cssText='background:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.4);color:#fff;font-size:11px;border-radius:4px;padding:1px 3px';
        opts.forEach(k => {
          const o=document.createElement('option'); o.value=k;
          o.textContent = pDef.type==='cond' ? COND_MAP[k]||k : k;
          if((block.params[pname]||pDef.default)===k) o.selected=true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', e => block.params[pname]=e.target.value);
        labelEl.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.className='bc-script-param';
        inp.value=block.params[pname]!==undefined ? block.params[pname] : (pDef.default||'');
        inp.style.cssText='width:42px;min-width:28px;';
        inp.addEventListener('input', e => { block.params[pname]=e.target.value; bcDrawPreview(); });
        labelEl.appendChild(inp);
      }
    } else if (part) {
      const s=document.createElement('span'); s.textContent=part; labelEl.appendChild(s);
    }
  });

  header.appendChild(labelEl);
  const btns = document.createElement('div');
  btns.className='bc-script-block-btns';
  if (isTop) {
    ['▲','▼'].forEach((t,i) => {
      const b=document.createElement('button'); b.className='bc-script-block-btn'; b.textContent=t;
      b.onclick=()=>bcMoveBlock(block.id, i===0?-1:1); btns.appendChild(b);
    });
  }
  const del=document.createElement('button'); del.className='bc-script-block-btn'; del.textContent='✕';
  del.onclick=()=>bcDeleteBlock(block.id); btns.appendChild(del);
  header.appendChild(btns);
  wrap.appendChild(header);

  if (block.children!==undefined) {
    const childArea=document.createElement('div');
    childArea.className='bc-children'; childArea.style.borderLeftColor=color+'66';
    block.children.forEach(ch => childArea.appendChild(bcRenderBlock(ch, false)));

    const addSel=document.createElement('select');
    addSel.style.cssText='font-size:10px;background:rgba(0,0,0,.05);border:1px dashed var(--border);border-radius:4px;margin:2px 0 4px;padding:2px 4px;width:100%';
    const ph=document.createElement('option'); ph.value=''; ph.textContent='+ 블록 추가...'; addSel.appendChild(ph);
    BC_CATS.forEach(cat => {
      const grp=document.createElement('optgroup'); grp.label=cat.label;
      cat.blocks.filter(b=>!b.type.startsWith('event_')).forEach(b=>{
        const o=document.createElement('option'); o.value=b.type;
        o.textContent=b.label.replace(/\[[^\]]+\]/g,'(값)'); grp.appendChild(o);
      }); addSel.appendChild(grp);
    });
    addSel.addEventListener('change', e => { if(e.target.value){bcAddBlock(e.target.value,block.id);e.target.value='';} });
    childArea.appendChild(addSel);

    const endLabel=document.createElement('div');
    endLabel.className='bc-block-end'; endLabel.style.background=color+'88'; endLabel.textContent='끝';
    wrap.appendChild(childArea); wrap.appendChild(endLabel);
  }
  return wrap;
}

function openBlockCoder() {
  $('bcModal').classList.remove('hidden');
  bcInitPalette();
  bcRenderScript();
  bcDrawPreview();
}

function closeBlockCoder() {
  bcStop();
  $('bcModal').classList.add('hidden');
}

function bcSetBg(color) {
  bcBgColor = color;
  const el = $('bcBgColor');
  if (el) el.value = color;
  bcDrawPreview();
}

const BC_CHARS = {
  person:   { shape:'emoji', emoji:'🧍', w:36, h:36 },
  cat:      { shape:'emoji', emoji:'🐱', w:36, h:36 },
  rocket:   { shape:'emoji', emoji:'🚀', w:36, h:36 },
  star:     { shape:'emoji', emoji:'⭐', w:36, h:36 },
  circle:   { shape:'circle', w:36, h:36 },
  rect:     { shape:'rect',   w:36, h:36 },
  triangle: { shape:'triangle', w:36, h:36 },
};

function bcSetChar(charKey) {
  const ch = BC_CHARS[charKey];
  if (!ch) return;
  bcSprite.shape = ch.shape;
  bcSprite.emoji = ch.emoji || null;
  document.querySelectorAll('.bc-char-btn').forEach(b => b.classList.remove('active'));
  const btn = [...document.querySelectorAll('.bc-char-btn')].find(b => b.title === { person:'사람',cat:'고양이',rocket:'로켓',star:'별',circle:'원',rect:'사각형',triangle:'삼각형' }[charKey]);
  if (btn) btn.classList.add('active');
  bcDrawPreview();
}

function bcUpdateSprite() {
  bcSprite.color = $('bcSpriteColor')?.value||'#3b82f6';
  bcSprite.w=bcSprite.h=parseInt($('bcSpriteSize')?.value||40);
  bcSprite.label = $('bcSpriteLabel')?.value||'';
  bcBgColor = $('bcBgColor')?.value||'#87ceeb';
  bcDrawPreview();
}

function bcDrawSprite(ctx, sp) {
  if (!sp.visible) return;
  const {x,y,w,h,shape,color,label,emoji}=sp;
  if (shape==='emoji' && emoji) {
    ctx.font = `${w}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(emoji, x, y);
    ctx.textBaseline='alphabetic';
  } else {
    ctx.fillStyle=color;
    if(shape==='circle'){ctx.beginPath();ctx.arc(x,y,w/2,0,Math.PI*2);ctx.fill();}
    else if(shape==='triangle'){ctx.beginPath();ctx.moveTo(x,y-h/2);ctx.lineTo(x+w/2,y+h/2);ctx.lineTo(x-w/2,y+h/2);ctx.closePath();ctx.fill();}
    else{ctx.fillRect(x-w/2,y-h/2,w,h);}
  }
  if(label){ctx.fillStyle='#222';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(label,x,y+w/2+12);}
}

function bcDrawPreview() {
  const canvas=$('bcCanvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=bcBgColor; ctx.fillRect(0,0,canvas.width,canvas.height);
  bcDrawSprite(ctx, bcSprite);
  let varY=14;
  bcShownVars.forEach(name=>{
    ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(4,varY-11,100,16);
    ctx.fillStyle='#fff';ctx.font='11px sans-serif';ctx.textAlign='left';
    ctx.fillText(`${name}: ${bcVars[name]??0}`,8,varY);varY+=19;
  });
}

function bcRun() {
  if (bcRuntime) bcStop();
  bcVars={}; bcShownVars=new Set();
  bcSprite.x=160;bcSprite.y=120;bcSprite.velX=0;bcSprite.velY=0;bcSprite.visible=true;
  const canvas=$('bcCanvas'), W=canvas?canvas.width:320, H=canvas?canvas.height:240;
  const keyState={};
  const onKD=e=>keyState[e.key]=true, onKU=e=>keyState[e.key]=false;
  document.addEventListener('keydown',onKD); document.addEventListener('keyup',onKU);
  let running=true;

  function evalCond(cond){
    const m={right_key:'ArrowRight',left_key:'ArrowLeft',up_key:'ArrowUp',down_key:'ArrowDown',space_key:' '};
    if(cond==='edge'){const sp=bcSprite;return sp.x<=sp.w/2||sp.x>=W-sp.w/2||sp.y<=sp.h/2||sp.y>=H-sp.h/2;}
    return !!(keyState[m[cond]]||keyState[KEY_MAP[cond]]||keyState[cond]);
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  async function exec(blocks){
    for(const b of blocks){
      if(!running) return;
      const p=b.params,sp=bcSprite;
      switch(b.type){
        case 'motion_x': sp.x=Math.max(sp.w/2,Math.min(W-sp.w/2,sp.x+(parseFloat(p.n)||0))); break;
        case 'motion_y': sp.y=Math.max(sp.h/2,Math.min(H-sp.h/2,sp.y+(parseFloat(p.n)||0))); break;
        case 'motion_setx': sp.x=parseFloat(p.x)||0; break;
        case 'motion_sety': sp.y=parseFloat(p.y)||0; break;
        case 'motion_bounce':
          if(sp.x-sp.w/2<=0||sp.x+sp.w/2>=W)sp.velX=-sp.velX;
          if(sp.y-sp.h/2<=0||sp.y+sp.h/2>=H)sp.velY=-sp.velY; break;
        case 'motion_velx': sp.velX=parseFloat(p.vx)||0; break;
        case 'motion_vely': sp.velY=parseFloat(p.vy)||0; break;
        case 'motion_applyvel':
          sp.x=Math.max(sp.w/2,Math.min(W-sp.w/2,sp.x+sp.velX));
          sp.y=Math.max(sp.h/2,Math.min(H-sp.h/2,sp.y+sp.velY)); break;
        case 'looks_color': sp.color=p.color; break;
        case 'looks_size': sp.w=sp.h=Math.max(5,parseFloat(p.size)||40); break;
        case 'looks_show': sp.visible=true; break;
        case 'looks_hide': sp.visible=false; break;
        case 'looks_label': sp.label=p.text||''; break;
        case 'control_wait': await sleep((parseFloat(p.n)||1)*1000); break;
        case 'control_repeat': for(let i=0;i<(parseInt(p.n)||10)&&running;i++){await exec(b.children||[]);await sleep(16);} break;
        case 'control_forever': while(running){await exec(b.children||[]);await sleep(16);} break;
        case 'control_if': if(evalCond(p.cond))await exec(b.children||[]); break;
        case 'var_set': bcVars[p.name||'변수']=parseFloat(p.val)||0; break;
        case 'var_change': bcVars[p.name||'변수']=(bcVars[p.name||'변수']||0)+(parseFloat(p.n)||0); break;
        case 'var_show': bcShownVars.add(p.name||'변수'); break;
        case 'sound_beep': try{const ac=new AudioContext();const o=ac.createOscillator();o.connect(ac.destination);o.start();o.stop(ac.currentTime+.1);}catch{} break;
        case 'event_start': await exec(b.children||[]); break;
      }
    }
  }

  let rafId;
  function loop(){if(!running)return;bcDrawPreview();rafId=requestAnimationFrame(loop);}
  loop();
  bcScript.filter(b=>b.type==='event_start').forEach(b=>exec(b.children||[]));
  const kbBlocks=bcScript.filter(b=>b.type==='event_keydown');
  const kbTrigger=e=>kbBlocks.forEach(b=>{const k=KEY_MAP[b.params.key||'오른쪽']||b.params.key;if(e.key===k)exec(b.children||[]);});
  document.addEventListener('keydown',kbTrigger);

  bcRuntime={stop:()=>{running=false;cancelAnimationFrame(rafId);document.removeEventListener('keydown',onKD);document.removeEventListener('keyup',onKU);document.removeEventListener('keydown',kbTrigger);}};
  if($('bcRunBtn'))$('bcRunBtn').style.display='none';
  if($('bcStopBtn'))$('bcStopBtn').style.display='';
}

function bcStop(){
  if(bcRuntime){bcRuntime.stop();bcRuntime=null;}
  if($('bcRunBtn'))$('bcRunBtn').style.display='';
  if($('bcStopBtn'))$('bcStopBtn').style.display='none';
  bcDrawPreview();
}

async function bcSubmit(){
  const title=$('bcGameTitle')?.value?.trim();
  if(!title){showToast('게임 제목을 입력해주세요!','error');return;}
  if(bcScript.length===0){showToast('블록을 추가해주세요!','error');return;}
  bcStop();
  const program={script:bcScript,sprite:bcSprite,bgColor:bcBgColor};
  try{
    const res=await fetch('/api/block-games',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:USER.id,nickname:USER.nickname,title,program})});
    const data=await res.json();
    if(data.success){showToast('제출 완료! 관리자 승인을 기다리세요 🎉','success');$('bcGameTitle').value='';}
    else showToast(data.error||'제출 실패','error');
  }catch{showToast('제출 중 오류 발생','error');}
}

// (switchView 확장은 원본 함수에 통합됨)

// ---- 유저 게임 목록 ----
async function loadUserGames(){
  const el=$('userGamesList'); if(!el) return;
  try{
    const res=await fetch('/api/block-games');
    const games=await res.json();
    if(games.length===0){el.innerHTML='<div style="text-align:center;padding:16px;color:var(--text-3);font-size:13px">아직 승인된 게임이 없습니다.<br>블록코딩으로 게임을 만들어 제출해보세요!</div>';return;}
    el.innerHTML=games.map(g=>`
      <div class="user-game-item" onclick="openUserGame('${g.id}')">
        <div class="user-game-thumb">🎮</div>
        <div class="user-game-info">
          <div class="user-game-title">${escHtml(g.title)}</div>
          <div class="user-game-meta">by ${escHtml(g.nickname)} · 플레이 ${g.playCount||0}회</div>
        </div>
        <i class="fa-solid fa-play-circle" style="color:var(--accent);font-size:20px"></i>
      </div>`).join('');
  }catch{el.innerHTML='<div style="padding:12px;color:var(--text-3)">불러오기 실패</div>';}
}

let userGameRuntime=null;

async function openUserGame(gameId){
  try{
    const res=await fetch(`/api/block-games/${gameId}`);
    const game=await res.json();
    $('userGameTitle').textContent=game.title;
    $('userGameMeta').textContent=`by ${game.nickname}`;
    $('userGameModal').classList.remove('hidden');
    fetch(`/api/block-games/${gameId}/play`,{method:'POST'});
    window._ugProgram=game.program;
    const canvas=$('userGameCanvas'),ctx=canvas.getContext('2d');
    ctx.fillStyle=game.program.bgColor||'#87ceeb';ctx.fillRect(0,0,canvas.width,canvas.height);
  }catch{showToast('게임을 불러오지 못했습니다.','error');}
}

function closeUserGame(){userGameStop();$('userGameModal').classList.add('hidden');window._ugProgram=null;}

function userGameRun(){
  userGameStop();
  const prog=window._ugProgram; if(!prog) return;
  const canvas=$('userGameCanvas'),W=canvas.width,H=canvas.height;
  const sprite={...prog.sprite,velX:0,velY:0,visible:true};
  const script=prog.script||[],bgColor=prog.bgColor||'#87ceeb';
  let vars={},shownVars=new Set(),running=true;
  const keyState={};
  const onKD=e=>keyState[e.key]=true,onKU=e=>keyState[e.key]=false;
  document.addEventListener('keydown',onKD);document.addEventListener('keyup',onKU);

  function evalCond(c){
    const m={right_key:'ArrowRight',left_key:'ArrowLeft',up_key:'ArrowUp',down_key:'ArrowDown',space_key:' '};
    if(c==='edge')return sprite.x<=sprite.w/2||sprite.x>=W-sprite.w/2||sprite.y<=sprite.h/2||sprite.y>=H-sprite.h/2;
    return !!(keyState[m[c]]||keyState[KEY_MAP[c]]||keyState[c]);
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function exec(blocks){
    for(const b of blocks){
      if(!running)return;
      const p=b.params,sp=sprite;
      switch(b.type){
        case 'motion_x': sp.x=Math.max(sp.w/2,Math.min(W-sp.w/2,sp.x+(parseFloat(p.n)||0)));break;
        case 'motion_y': sp.y=Math.max(sp.h/2,Math.min(H-sp.h/2,sp.y+(parseFloat(p.n)||0)));break;
        case 'motion_setx': sp.x=parseFloat(p.x)||0;break;
        case 'motion_sety': sp.y=parseFloat(p.y)||0;break;
        case 'motion_bounce':
          if(sp.x-sp.w/2<=0||sp.x+sp.w/2>=W)sp.velX=-sp.velX;
          if(sp.y-sp.h/2<=0||sp.y+sp.h/2>=H)sp.velY=-sp.velY;break;
        case 'motion_velx': sp.velX=parseFloat(p.vx)||0;break;
        case 'motion_vely': sp.velY=parseFloat(p.vy)||0;break;
        case 'motion_applyvel':
          sp.x=Math.max(sp.w/2,Math.min(W-sp.w/2,sp.x+sp.velX));
          sp.y=Math.max(sp.h/2,Math.min(H-sp.h/2,sp.y+sp.velY));break;
        case 'looks_color': sp.color=p.color;break;
        case 'looks_size': sp.w=sp.h=Math.max(5,parseFloat(p.size)||40);break;
        case 'looks_show': sp.visible=true;break;
        case 'looks_hide': sp.visible=false;break;
        case 'looks_label': sp.label=p.text||'';break;
        case 'control_wait': await sleep((parseFloat(p.n)||1)*1000);break;
        case 'control_repeat': for(let i=0;i<(parseInt(p.n)||10)&&running;i++){await exec(b.children||[]);await sleep(16);}break;
        case 'control_forever': while(running){await exec(b.children||[]);await sleep(16);}break;
        case 'control_if': if(evalCond(p.cond))await exec(b.children||[]);break;
        case 'var_set': vars[p.name||'변수']=parseFloat(p.val)||0;break;
        case 'var_change': vars[p.name||'변수']=(vars[p.name||'변수']||0)+(parseFloat(p.n)||0);break;
        case 'var_show': shownVars.add(p.name||'변수');break;
        case 'event_start': await exec(b.children||[]);break;
      }
    }
  }

  function draw(){
    if(!running)return;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=bgColor;ctx.fillRect(0,0,W,H);
    bcDrawSprite(ctx, sprite);
    let vy=14;
    shownVars.forEach(name=>{ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(4,vy-11,100,16);ctx.fillStyle='#fff';ctx.font='11px sans-serif';ctx.textAlign='left';ctx.fillText(`${name}: ${vars[name]??0}`,8,vy);vy+=19;});
    requestAnimationFrame(draw);
  }
  draw();
  script.filter(b=>b.type==='event_start').forEach(b=>exec(b.children||[]));
  const kbBlocks=script.filter(b=>b.type==='event_keydown');
  const kbTrigger=e=>kbBlocks.forEach(b=>{const k=KEY_MAP[b.params.key||'오른쪽']||b.params.key;if(e.key===k)exec(b.children||[]);});
  document.addEventListener('keydown',kbTrigger);
  userGameRuntime={stop:()=>{running=false;document.removeEventListener('keydown',onKD);document.removeEventListener('keyup',onKU);document.removeEventListener('keydown',kbTrigger);}};
  $('userGameRunBtn').style.display='none';
  $('userGameStopBtn').style.display='';
}

function userGameStop(){
  if(userGameRuntime){userGameRuntime.stop();userGameRuntime=null;}
  $('userGameRunBtn').style.display='';
  $('userGameStopBtn').style.display='none';
}

// ---- 관리자 게임 심사 ----
async function loadPendingGames(){
  const el=$('pendingGamesList'); if(!el) return;
  el.innerHTML='<div style="font-size:12px;color:var(--text-3)">불러오는 중...</div>';
  try{
    const res=await fetch(`/api/block-games/pending?password=${encodeURIComponent(state.adminPw)}`);
    const games=await res.json();
    if(games.length===0){el.innerHTML='<div style="font-size:12px;color:var(--text-3)">심사 대기 중인 게임이 없습니다.</div>';return;}
    el.innerHTML=games.map(g=>`
      <div class="pending-game-card">
        <div class="pending-game-title">${escHtml(g.title)}</div>
        <div class="pending-game-meta">by ${escHtml(g.nickname)} · ${formatTime(g.createdAt)}</div>
        <div class="pending-game-actions">
          <button class="btn btn-primary btn-sm" onclick="adminApproveGame('${g.id}')">✅ 승인</button>
          <button class="btn btn-danger btn-sm" onclick="adminRejectGame('${g.id}')">❌ 거절</button>
          <button class="btn btn-ghost btn-sm" onclick="openUserGame('${g.id}')">👁 미리보기</button>
        </div>
      </div>`).join('');
  }catch{el.innerHTML='<div style="font-size:12px;color:var(--text-3)">불러오기 실패</div>';}
}

async function adminApproveGame(id){
  const comment=prompt('승인 메시지 (선택사항):')||'';
  const res=await fetch(`/api/block-games/${id}/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:state.adminPw,comment})});
  const data=await res.json();
  if(data.success){showToast('게임 승인 완료!','success');loadPendingGames();}
  else showToast(data.error||'오류','error');
}

async function adminRejectGame(id){
  const comment=prompt('거절 이유를 입력하세요:')||'부적절한 내용';
  const res=await fetch(`/api/block-games/${id}/reject`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:state.adminPw,comment})});
  const data=await res.json();
  if(data.success){showToast('게임 거절됨','info');loadPendingGames();}
  else showToast(data.error||'오류','error');
}

socket.on('blockGameApproved',({title})=>showToast(`🎉 "${title}" 게임이 승인되어 게임존에 공개되었습니다!`,'success'));
socket.on('blockGameRejected',({title,comment})=>showToast(`"${title}" 게임이 거절되었습니다. 사유: ${comment}`,'error'));
