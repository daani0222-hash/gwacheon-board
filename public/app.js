/**
 * app.js - 과천중 비밀게시판 클라이언트 v2.09
 */
console.log('%c과천중 게임존 v2.09 로드됨 ✅', 'color:#6366f1;font-weight:bold;font-size:14px');

// =============================================
// 인증 토큰
// =============================================
let _authToken = localStorage.getItem('gwacheon_token') || null;

function getAuthHeaders() {
  return _authToken ? { 'Authorization': 'Bearer ' + _authToken } : {};
}

function authFetch(url, opts = {}) {
  opts.headers = Object.assign({}, opts.headers || {}, getAuthHeaders());
  return fetch(url, opts);
}

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

function applyAccountUser(user) {
  USER.id        = user.id;
  USER.nickname  = user.nickname;
  USER.color     = user.color;
  USER.avatarUrl = user.avatarUrl || null;
  USER.bio       = user.bio || '';
  localStorage.setItem('userId',    USER.id);
  localStorage.setItem('nickname',  USER.nickname);
  localStorage.setItem('color',     USER.color);
  if (USER.avatarUrl) localStorage.setItem('avatarUrl', USER.avatarUrl);
  else localStorage.removeItem('avatarUrl');
  localStorage.setItem('bio', USER.bio);
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
  initAuth();
});

function startApp() {
  if ($('authModal')) $('authModal').classList.add('hidden');
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
// 인증 (회원가입 / 로그인)
// =============================================
async function initAuth() {
  if (_authToken) {
    try {
      const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        applyAccountUser(data.user);
        startApp();
        return;
      }
    } catch(e) {}
    _authToken = null;
    localStorage.removeItem('gwacheon_token');
  }
  showAuthModal();
}

function showAuthModal() {
  const m = $('authModal');
  if (m) m.classList.remove('hidden');
}

function hideAuthModal() {
  const m = $('authModal');
  if (m) m.classList.add('hidden');
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  $('authLoginForm').classList.toggle('hidden', !isLogin);
  $('authRegisterForm').classList.toggle('hidden', isLogin);
  $('authTabLogin').classList.toggle('active', isLogin);
  $('authTabRegister').classList.toggle('active', !isLogin);
  if (isLogin) {
    $('loginError').classList.add('hidden');
    setTimeout(() => $('loginUsername').focus(), 50);
  } else {
    $('registerError').classList.add('hidden');
    setTimeout(() => $('regUsername').focus(), 50);
  }
}

async function doLogin() {
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  const errEl = $('loginError');
  errEl.classList.add('hidden');

  if (!username || !password) { errEl.textContent = '아이디와 비밀번호를 입력하세요'; errEl.classList.remove('hidden'); return; }

  const btn = $('loginBtn');
  btn.disabled = true; btn.textContent = '로그인 중...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }

    _authToken = data.token;
    localStorage.setItem('gwacheon_token', _authToken);
    applyAccountUser(data.user);
    hideAuthModal();
    startApp();
    showToast(`환영합니다, ${data.user.nickname}님!`, 'success');
  } catch(e) {
    errEl.textContent = '서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> 로그인';
  }
}

async function doRegister() {
  const username = $('regUsername').value.trim();
  const nickname = $('regNickname').value.trim();
  const password = $('regPassword').value;
  const passwordConfirm = $('regPasswordConfirm').value;
  const errEl = $('registerError');
  errEl.classList.add('hidden');

  if (!username || !nickname || !password) { errEl.textContent = '모든 항목을 입력하세요'; errEl.classList.remove('hidden'); return; }
  if (password !== passwordConfirm) { errEl.textContent = '비밀번호가 일치하지 않습니다'; errEl.classList.remove('hidden'); return; }

  const btn = $('registerBtn');
  btn.disabled = true; btn.textContent = '가입 처리 중...';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, nickname }),
    });
    const data = await res.json();
    if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }

    _authToken = data.token;
    localStorage.setItem('gwacheon_token', _authToken);
    applyAccountUser(data.user);
    hideAuthModal();
    startApp();
    showToast(`가입 완료! 환영합니다, ${data.user.nickname}님 🎉`, 'success');
  } catch(e) {
    errEl.textContent = '서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> 가입하기';
  }
}

async function doLogout() {
  if (!confirm('로그아웃하시겠습니까?')) return;
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() });
  } catch(e) {}
  _authToken = null;
  localStorage.removeItem('gwacheon_token');
  localStorage.removeItem('userId');
  localStorage.removeItem('nickname');
  localStorage.removeItem('color');
  localStorage.removeItem('avatarUrl');
  localStorage.removeItem('bio');
  closeSettingsModal();
  dom.app.classList.add('hidden');
  showAuthModal();
  switchAuthTab('login');
}

// =============================================
// 이벤트 바인딩
// =============================================
function bindEvents() {
  // 닉네임 모달
  // 레거시 닉네임 모달
  dom.setNicknameBtn && dom.setNicknameBtn.addEventListener('click', handleSetNickname);
  dom.nicknameInput && dom.nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSetNickname();
  });

  // 인증 모달 Enter 키
  const loginPwInput = $('loginPassword');
  if (loginPwInput) loginPwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  const loginUserInput = $('loginUsername');
  if (loginUserInput) loginUserInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  const regPwConfirm = $('regPasswordConfirm');
  if (regPwConfirm) regPwConfirm.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });

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
    const viewingGlobal = state.currentChannel === 'global' && !state.activeDMSocket && !state.activeGroupId;
    if (!viewingGlobal) {
      incrementChatBadge();
    }
    if (state.currentView !== 'chat' || !viewingGlobal) {
      showChatNotif(msg.nickname, msg.content, 'global');
    }
    if (viewingGlobal) {
      appendMessage(msg, 'global');
      scrollToBottom();
    }
  });

  socket.on('directMessage', (msg) => {
    const isActiveDM = state.activeDMSocket === msg.fromSocketId ||
                       state.activeDMSocket === msg.toSocketId;
    if (isActiveDM && state.currentView === 'chat') {
      appendMessage(msg, 'dm');
      scrollToBottom();
    } else {
      const otherId = msg.fromSocketId === socket.id ? msg.toSocketId : msg.fromSocketId;
      state.unreadDM[otherId] = (state.unreadDM[otherId] || 0) + 1;
      updateDMList();
      incrementChatBadge();
      showChatNotif(msg.fromNickname || msg.nickname, msg.content, 'dm');
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
    const viewingGroup = state.activeGroupId === msg.roomId && state.currentView === 'chat';
    if (viewingGroup) {
      appendMessage(msg, 'group');
      scrollToBottom();
    } else {
      state.unreadGroup[msg.roomId] = (state.unreadGroup[msg.roomId] || 0) + 1;
      renderGroupRooms();
      incrementChatBadge();
      showChatNotif(msg.nickname, msg.content, 'group');
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

  // 비밀번호 변경 (입력된 경우)
  const currentPw = $('currentPwInput')?.value || '';
  const newPw = $('newPwInput')?.value || '';
  if (newPw) {
    if (!currentPw) { showToast('현재 비밀번호를 입력하세요', 'error'); return; }
    if (newPw.length < 4) { showToast('새 비밀번호는 4자 이상이어야 합니다', 'error'); return; }
    try {
      const pwRes = await authFetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const pwData = await pwRes.json();
      if (pwData.error) { showToast(pwData.error, 'error'); return; }
      if ($('currentPwInput')) $('currentPwInput').value = '';
      if ($('newPwInput')) $('newPwInput').value = '';
    } catch(e) {
      showToast('비밀번호 변경 중 오류가 발생했습니다', 'error');
      return;
    }
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

  // 서버에 프로필 업데이트 (계정 있는 경우)
  if (_authToken) {
    try {
      const profileRes = await authFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: newNickname, bio: newBio, color: USER.color }),
      });
      const profileData = await profileRes.json();
      if (profileData.error) { showToast(profileData.error, 'error'); return; }
    } catch(e) { /* 소켓으로 폴백 */ }
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
  type: null,
  mode: null,
  difficulty: 'medium', // 'easy' | 'medium' | 'hard'
  roomId: null,
  myTurn: false,
  mySymbol: null,
  board: null,
  isOver: false,
  snakeTimer: null,
  tetrisTimer: null,
  snakePaused: false,
  gomokuCanvas: null,
  gomokuCtx: null,
  selected: null,
  possibleMoves: [],
  _shootCleanup: null,
};

function openGame(type) {
  gameState.type = type;
  gameState.mode = null;
  gameState.roomId = null;
  gameState.isOver = false;
  gameState.gomokuCanvas = null;
  gameState.gomokuCtx = null;

  const titles = { gomoku:'⚫ 오목', tictactoe:'❌ 틱택토', snake:'🐍 뱀 게임', chess:'♟ 체스', shooting:'🔫 우주 사격', archery:'🎯 양궁', tetris:'🟦 테트리스', g2048:'🔢 2048' };
  $('gameModalTitle').textContent = titles[type] || type;
  $('gameModeSelect').classList.remove('hidden');
  $('multiLobby').classList.add('hidden');
  $('multiWaiting').classList.add('hidden');
  $('gameBoard').classList.add('hidden');

  showRatingBar(type);

  const singleOnly = ['snake', 'shooting', 'archery', 'tetris', 'g2048'];
  const modeBtns = $('gameModeSelect').querySelector('.game-mode-btns');
  const diffSel = $('difficultySelect');

  if (singleOnly.includes(type)) {
    if (diffSel) diffSel.classList.add('hidden');
    if (modeBtns) modeBtns.innerHTML = `<button class="btn btn-primary" onclick="startGame('ai')"><i class="fa-solid fa-play"></i> 시작하기</button>`;
  } else {
    if (diffSel) diffSel.classList.remove('hidden');
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.diff === (gameState.difficulty || 'medium'));
    });
    if (modeBtns) modeBtns.innerHTML = `
      <button class="btn btn-primary" onclick="startGame('ai')"><i class="fa-solid fa-robot"></i> 1인용 (AI 대전)</button>
      <button class="btn btn-outline" onclick="showMultiLobby()"><i class="fa-solid fa-user-group"></i> 2인용 (온라인)</button>`;
  }

  $('gameModal').classList.remove('hidden');
  socket.emit('getGameRooms');
}

function setDifficulty(diff) {
  gameState.difficulty = diff;
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  });
}

function closeGame() {
  if (gameState.snakeTimer) { clearInterval(gameState.snakeTimer); gameState.snakeTimer = null; }
  if (gameState.tetrisTimer) { clearInterval(gameState.tetrisTimer); gameState.tetrisTimer = null; }
  if (gameState._shootCleanup) { gameState._shootCleanup(); gameState._shootCleanup = null; }
  if (gameState.roomId) socket.emit('leaveGameRoom', { roomId: gameState.roomId });
  $('gameModal').classList.add('hidden');
  if ($('gameRatingBar')) $('gameRatingBar').classList.add('hidden');
  const diff = gameState.difficulty || 'medium';
  gameState = { type:null, mode:null, difficulty: diff, roomId:null, myTurn:false, mySymbol:null, board:null, isOver:false, snakeTimer:null, tetrisTimer:null, snakePaused:false, gomokuCanvas:null, gomokuCtx:null, selected:null, possibleMoves:[], _shootCleanup:null };
}

function startGame(mode) {
  gameState.mode = mode;
  if (gameState.snakeTimer) { clearInterval(gameState.snakeTimer); gameState.snakeTimer = null; }
  if (gameState.tetrisTimer) { clearInterval(gameState.tetrisTimer); gameState.tetrisTimer = null; }
  if (gameState._shootCleanup) { gameState._shootCleanup(); gameState._shootCleanup = null; }
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
  else if (t === 'tetris')   initTetris();
  else if (t === 'g2048')    init2048();
}

function restartGame() {
  if (gameState.snakeTimer) { clearInterval(gameState.snakeTimer); gameState.snakeTimer = null; }
  if (gameState.tetrisTimer) { clearInterval(gameState.tetrisTimer); gameState.tetrisTimer = null; }
  if (gameState._shootCleanup) { gameState._shootCleanup(); gameState._shootCleanup = null; }
  if (gameState.mode) startGame(gameState.mode);
}

// =============================================
// 레이팅 시스템 (ELO)
// =============================================
function getGameRating(type) {
  const ratings = JSON.parse(localStorage.getItem('gwacheon_ratings') || '{}');
  return ratings[type] || 1200;
}

function setGameRating(type, val) {
  const ratings = JSON.parse(localStorage.getItem('gwacheon_ratings') || '{}');
  ratings[type] = Math.max(100, Math.round(val));
  localStorage.setItem('gwacheon_ratings', JSON.stringify(ratings));
}

function updateRating(type, result) {
  if (gameState.mode !== 'ai') return;
  const K = 32;
  const diffMap = { easy: 800, medium: 1200, hard: 1700 };
  const aiRating = diffMap[gameState.difficulty] || 1200;
  const myRating = getGameRating(type);
  const expected = 1 / (1 + Math.pow(10, (aiRating - myRating) / 400));
  const sc = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const newRating = myRating + K * (sc - expected);
  setGameRating(type, newRating);
  return Math.round(newRating);
}

function getRatingBadge(rating) {
  if (rating >= 2000) return { label: 'Master', color: '#f59e0b' };
  if (rating >= 1600) return { label: 'Gold', color: '#eab308' };
  if (rating >= 1400) return { label: 'Silver', color: '#94a3b8' };
  if (rating >= 1200) return { label: 'Bronze', color: '#b45309' };
  return { label: 'Rookie', color: '#6b7280' };
}

function showRatingBar(type) {
  const ratingBar = $('gameRatingBar');
  if (!ratingBar) return;
  const hasRating = ['gomoku', 'tictactoe', 'chess'].includes(type);
  if (hasRating) {
    const rating = getGameRating(type);
    const badge = getRatingBadge(rating);
    const rVal = $('gameRatingVal'), rBadge = $('gameRatingBadge');
    if (rVal) rVal.textContent = rating;
    if (rBadge) { rBadge.textContent = badge.label; rBadge.style.background = badge.color; }
    ratingBar.classList.remove('hidden');
  } else {
    ratingBar.classList.add('hidden');
  }
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
const GOMOKU_SIZE = 15;
const GOMOKU_CELL = 30;
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

  // 화점 (별자리) - 15x15 표준 위치
  ctx.fillStyle = '#a0763c';
  [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]].forEach(([sr,sc]) => {
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
    if (gameState.mode === 'ai') { updateRating('gomoku', isMe ? 'win' : 'loss'); showRatingBar('gomoku'); }
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

function gomokuScorePos(board, r, c, sym, S) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  let total = 0;
  for (const [dr, dc] of dirs) {
    let count = 1;
    let leftOpen = false, rightOpen = false;
    for (let i = 1; i < 6; i++) {
      const nr = r+dr*i, nc = c+dc*i;
      if (nr<0||nr>=S||nc<0||nc>=S) break;
      if (board[nr][nc] === sym) count++;
      else { if (board[nr][nc] === null) rightOpen = true; break; }
    }
    for (let i = 1; i < 6; i++) {
      const nr = r-dr*i, nc = c-dc*i;
      if (nr<0||nr>=S||nc<0||nc>=S) break;
      if (board[nr][nc] === sym) count++;
      else { if (board[nr][nc] === null) leftOpen = true; break; }
    }
    const opens = (leftOpen?1:0)+(rightOpen?1:0);
    if (count >= 5) total += 1000000;
    else if (count === 4) total += opens === 2 ? 100000 : opens === 1 ? 10000 : 500;
    else if (count === 3) total += opens === 2 ? 5000 : opens === 1 ? 500 : 50;
    else if (count === 2) total += opens === 2 ? 100 : opens === 1 ? 10 : 1;
  }
  return total;
}

function gomokuCandidates(S, radius) {
  const near = new Set();
  let hasStone = false;
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      if (!gameState.board[r][c]) continue;
      hasStone = true;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r+dr, nc = c+dc;
          if (nr>=0&&nr<S&&nc>=0&&nc<S&&!gameState.board[nr][nc]) near.add(nr*S+nc);
        }
      }
    }
  }
  if (!hasStone) return [[Math.floor(S/2), Math.floor(S/2)]];
  return [...near].map(k => [Math.floor(k/S), k%S]);
}

function gomokuAI() {
  const S = GOMOKU_SIZE;
  const aiSym = gameState.mySymbol === '⚫' ? '⚪' : '⚫';
  const mySym = gameState.mySymbol;
  const diff = gameState.difficulty || 'medium';
  const candidates = gomokuCandidates(S, 2);

  // Immediate win check
  for (const [r, c] of candidates) {
    gameState.board[r][c] = aiSym;
    if (checkGomokuWin(r, c, aiSym)) { gameState.board[r][c] = null; return { r, c }; }
    gameState.board[r][c] = null;
  }
  // Block immediate player win
  for (const [r, c] of candidates) {
    gameState.board[r][c] = mySym;
    if (checkGomokuWin(r, c, mySym)) { gameState.board[r][c] = null; return { r, c }; }
    gameState.board[r][c] = null;
  }

  // Score all candidates
  const scored = candidates.map(([r, c]) => {
    gameState.board[r][c] = aiSym;
    const atk = gomokuScorePos(gameState.board, r, c, aiSym, S);
    gameState.board[r][c] = null;
    gameState.board[r][c] = mySym;
    const def = gomokuScorePos(gameState.board, r, c, mySym, S);
    gameState.board[r][c] = null;
    return { r, c, score: atk * 1.05 + def };
  });
  scored.sort((a, b) => b.score - a.score);

  if (diff === 'easy') {
    const pool = scored.slice(0, Math.min(10, scored.length));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { r: pick.r, c: pick.c };
  }
  return { r: scored[0].r, c: scored[0].c };
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
    const iWon = winner === gameState.mySymbol;
    if (gameState.mode === 'ai') { updateRating('tictactoe', iWon ? 'win' : 'loss'); showRatingBar('tictactoe'); }
    $('gameStatus').textContent = iWon ? '🎉 내가 이겼습니다!' : '😢 상대방이 이겼습니다!';
    if (gameState.mode === 'multi') socket.emit('gameEnd', { roomId: gameState.roomId, result: {} });
  } else if (gameState.board.every(v => v)) {
    gameState.isOver = true;
    if (gameState.mode === 'ai') { updateRating('tictactoe', 'draw'); showRatingBar('tictactoe'); }
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
// 뱀 게임 (개선판)
// =============================================
function randomFood(blocked, cols, rows) {
  let f;
  do { f = {x:Math.floor(Math.random()*cols), y:Math.floor(Math.random()*rows)}; }
  while (blocked.some(s=>s.x===f.x&&s.y===f.y));
  return f;
}

function initSnake() {
  if (gameState.snakeTimer) clearInterval(gameState.snakeTimer);
  const COLS = 24, ROWS = 20, CELL = 22;
  const W = COLS*CELL, H = ROWS*CELL;
  let snake = [{x:12,y:10},{x:11,y:10},{x:10,y:10}];
  let dir = {x:1,y:0}, nextDir = {x:1,y:0};
  let food = randomFood(snake, COLS, ROWS);
  let goldenFood = null, goldenTimer = 0;
  let score = 0, level = 1, eaten = 0;
  let obstacles = [];
  let gameOver = false;
  gameState.snakePaused = false;

  const inner = $('gameBoardInner');
  inner.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0';
  inner.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.cssText = 'max-width:100%;border-radius:10px;display:block';
  inner.appendChild(canvas);

  const ctrlDiv = document.createElement('div');
  ctrlDiv.style.cssText = 'display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(2,40px);gap:4px';
  ctrlDiv.innerHTML = `<div></div><button class="btn btn-ghost btn-sm" style="font-size:18px;padding:0" onclick="window._snakeDir(0,-1)">▲</button><div></div><button class="btn btn-ghost btn-sm" style="font-size:18px;padding:0" onclick="window._snakeDir(-1,0)">◀</button><button class="btn btn-ghost btn-sm" style="font-size:18px;padding:0" onclick="window._snakeDir(0,1)">▼</button><button class="btn btn-ghost btn-sm" style="font-size:18px;padding:0" onclick="window._snakeDir(1,0)">▶</button>`;
  inner.appendChild(ctrlDiv);

  const ctx = canvas.getContext('2d');
  window._snakeDir = (dx, dy) => { if (!(dx===-dir.x&&dy===-dir.y)) nextDir={x:dx,y:dy}; };

  const keyHandler = e => {
    const map = {ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0],w:[0,-1],s:[0,1],a:[-1,0],d:[1,0]};
    const nd = map[e.key];
    if (nd) { if(!(nd[0]===-dir.x&&nd[1]===-dir.y)) nextDir={x:nd[0],y:nd[1]}; e.preventDefault(); }
    if (e.key==='p'||e.key==='P') { gameState.snakePaused=!gameState.snakePaused; $('gameStatus').textContent=gameState.snakePaused?'⏸ 일시정지 (P로 재개)':'방향키/WASD 이동 · P 정지'; }
  };
  document.addEventListener('keydown', keyHandler);

  let ts=null;
  canvas.addEventListener('touchstart',e=>{ts={x:e.touches[0].clientX,y:e.touches[0].clientY};e.preventDefault();},{passive:false});
  canvas.addEventListener('touchend',e=>{
    if(!ts)return;
    const dx=e.changedTouches[0].clientX-ts.x, dy=e.changedTouches[0].clientY-ts.y;
    if(Math.abs(dx)>Math.abs(dy)){if(Math.abs(dx)>15){const nd=dx>0?[1,0]:[-1,0];if(!(nd[0]===-dir.x&&nd[1]===-dir.y))nextDir={x:nd[0],y:nd[1]};}}
    else{if(Math.abs(dy)>15){const nd=dy>0?[0,1]:[0,-1];if(!(nd[0]===-dir.x&&nd[1]===-dir.y))nextDir={x:nd[0],y:nd[1]};}}
    ts=null;e.preventDefault();
  },{passive:false});

  function buildObstacles(lvl) {
    if (lvl < 3) return [];
    const obs=[]; const count=(lvl-2)*4;
    for(let i=0;i<count;i++){
      let p;
      do{p={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)};}
      while(snake.some(s=>s.x===p.x&&s.y===p.y)||obs.some(o=>o.x===p.x&&o.y===p.y)||(Math.abs(p.x-snake[0].x)<4&&Math.abs(p.y-snake[0].y)<4));
      obs.push(p);
    }
    return obs;
  }

  function draw() {
    ctx.fillStyle='#0f1923'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1;
    for(let x=0;x<=COLS;x++){ctx.beginPath();ctx.moveTo(x*CELL,0);ctx.lineTo(x*CELL,H);ctx.stroke();}
    for(let y=0;y<=ROWS;y++){ctx.beginPath();ctx.moveTo(0,y*CELL);ctx.lineTo(W,y*CELL);ctx.stroke();}

    obstacles.forEach(o=>{
      ctx.fillStyle='#3a3a5c'; ctx.fillRect(o.x*CELL+1,o.y*CELL+1,CELL-2,CELL-2);
      ctx.fillStyle='#555'; ctx.fillRect(o.x*CELL+4,o.y*CELL+4,CELL-8,CELL-8);
    });

    ctx.save(); ctx.shadowColor='#ff4757'; ctx.shadowBlur=14;
    ctx.fillStyle='#ff4757';
    ctx.beginPath(); ctx.arc((food.x+.5)*CELL,(food.y+.5)*CELL,CELL*.38,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle='rgba(255,255,255,.4)';
    ctx.beginPath(); ctx.arc((food.x+.3)*CELL,(food.y+.3)*CELL,CELL*.12,0,Math.PI*2); ctx.fill();

    if (goldenFood) {
      const pulse=0.9+Math.sin(Date.now()/180)*.1;
      ctx.save(); ctx.shadowColor='#ffd700'; ctx.shadowBlur=18;
      ctx.fillStyle='#ffd700';
      ctx.beginPath(); ctx.arc((goldenFood.x+.5)*CELL,(goldenFood.y+.5)*CELL,CELL*.42*pulse,0,Math.PI*2); ctx.fill();
      ctx.restore();
      ctx.fillStyle='rgba(255,255,200,.5)';
      ctx.beginPath(); ctx.arc((goldenFood.x+.3)*CELL,(goldenFood.y+.3)*CELL,CELL*.13,0,Math.PI*2); ctx.fill();
    }

    snake.forEach((seg,i)=>{
      const t=i/Math.max(snake.length-1,1);
      const g=Math.round(255-80*t), b=Math.round(170-120*t);
      ctx.fillStyle=i===0?'#00ffaa':`rgb(0,${g},${b})`;
      const pad=i===0?1:2;
      ctx.beginPath();
      if(typeof ctx.roundRect==='function')ctx.roundRect(seg.x*CELL+pad,seg.y*CELL+pad,CELL-pad*2,CELL-pad*2,i===0?5:3);
      else ctx.rect(seg.x*CELL+pad,seg.y*CELL+pad,CELL-pad*2,CELL-pad*2);
      ctx.fill();
      if(i===0){
        ctx.fillStyle='#000';
        const eox=dir.x===1?CELL*.7:dir.x===-1?CELL*.25:CELL*.35;
        const eoy1=dir.y!==0?CELL*.35:CELL*.3, eoy2=dir.y!==0?CELL*.35:CELL*.7;
        ctx.beginPath();ctx.arc(seg.x*CELL+eox,seg.y*CELL+eoy1,2.5,0,Math.PI*2);ctx.fill();
        const eox2=dir.x!==0?eox:(CELL-eox*CELL)*CELL+CELL*.65;
        ctx.beginPath();ctx.arc(seg.x*CELL+(dir.y!==0?CELL-eox:eox),seg.y*CELL+eoy2,2.5,0,Math.PI*2);ctx.fill();
      }
    });

    ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(0,0,W,26);
    ctx.fillStyle='#fff'; ctx.font='bold 13px monospace'; ctx.textAlign='left';
    ctx.fillText(`점수: ${score}`,8,18);
    ctx.fillStyle='#ffd700'; ctx.textAlign='center';
    ctx.fillText(`Lv.${level}`,W/2,18);
    ctx.fillStyle='#88aaff'; ctx.textAlign='right';
    ctx.fillText(`길이: ${snake.length}`,W-8,18);
    ctx.textAlign='left';
  }

  function tick() {
    if(gameState.snakePaused||gameOver)return;
    dir=nextDir;
    const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
    const died=head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS||snake.some(s=>s.x===head.x&&s.y===head.y)||obstacles.some(o=>o.x===head.x&&o.y===head.y);
    if(died){
      gameOver=true; clearInterval(gameState.snakeTimer); document.removeEventListener('keydown',keyHandler);
      ctx.fillStyle='rgba(0,0,0,.72)'; ctx.fillRect(0,H/2-44,W,88);
      ctx.fillStyle='#ff4757'; ctx.font='bold 26px sans-serif'; ctx.textAlign='center';
      ctx.fillText('💀 게임오버',W/2,H/2-8);
      ctx.fillStyle='#fff'; ctx.font='15px sans-serif';
      ctx.fillText(`최종 점수: ${score}  Lv.${level}`,W/2,H/2+22);
      ctx.textAlign='left';
      $('gameStatus').textContent=`💀 게임오버! 최종 점수: ${score} | Lv.${level}`;
      return;
    }
    snake.unshift(head);
    if(head.x===food.x&&head.y===food.y){
      score+=level; eaten++;
      food=randomFood([...snake,...obstacles],COLS,ROWS);
      if(eaten%8===0){
        level++; obstacles=buildObstacles(level);
        clearInterval(gameState.snakeTimer);
        gameState.snakeTimer=setInterval(tick,Math.max(65,200-(level-1)*18));
        $('gameStatus').textContent=`🎉 레벨 ${level}! 속도 상승!`;
      }
      if(!goldenFood&&Math.random()<0.15){goldenFood=randomFood([...snake,...obstacles,food],COLS,ROWS);goldenTimer=90;}
    } else if(goldenFood&&head.x===goldenFood.x&&head.y===goldenFood.y){
      score+=5*level; goldenFood=null;
      for(let i=0;i<2;i++)snake.push({...snake[snake.length-1]});
    } else { snake.pop(); }
    if(goldenFood){goldenTimer--;if(goldenTimer<=0)goldenFood=null;}
    draw();
  }

  draw();
  $('gameStatus').textContent='방향키/WASD 이동 · P 일시정지 · 황금사과 +5점!';
  gameState.snakeTimer=setInterval(tick,200);
  gameState._shootCleanup=()=>{document.removeEventListener('keydown',keyHandler);};
}

// =============================================
// 체스
// =============================================
const CHESS_PIECES = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
};

// =============================================
// 채팅 알림 바
// =============================================
function showChatNotif(nickname, content, type) {
  if (state.currentView === 'chat') return; // 채팅 화면이면 표시 안 함
  const bar = document.getElementById('chatNotifBar');
  if (!bar) return;
  // 같은 사람 연속 알림 방지 (0.5초 내)
  if (bar._lastNick === nickname && bar._lastTime && Date.now() - bar._lastTime < 500) return;
  bar._lastNick = nickname; bar._lastTime = Date.now();

  const item = document.createElement('div');
  item.className = 'chat-notif-item';
  const icon = type === 'dm' ? '💬' : type === 'group' ? '👥' : '🌏';
  const preview = content ? content.slice(0, 36) + (content.length > 36 ? '…' : '') : '(미디어)';
  item.innerHTML = `<span style="font-size:15px">${icon}</span><strong>${nickname}</strong><span style="opacity:.8;overflow:hidden;text-overflow:ellipsis">: ${preview}</span>`;
  item.onclick = () => { switchView('chat'); item.remove(); };
  bar.appendChild(item);

  setTimeout(() => {
    item.style.cssText += 'opacity:0;transition:opacity .3s';
    setTimeout(() => item.remove(), 320);
  }, 4000);
}

// =============================================
// 체스 – 앙파상 / 캐슬링 헬퍼
// =============================================
function isSquareAttacked(board, r, c, byColor) {
  const inB = (r,c) => r>=0&&r<8&&c>=0&&c<8;
  const dir = byColor === 'w' ? -1 : 1;
  for (let br=0;br<8;br++) for (let bc=0;bc<8;bc++) {
    const p = board[br][bc]; if (!p || p[0] !== byColor) continue;
    const t = p[1];
    if (t==='P') { if (br+dir===r && (bc-1===c||bc+1===c)) return true; }
    else if (t==='N') { const dr=Math.abs(br-r),dc=Math.abs(bc-c); if((dr===2&&dc===1)||(dr===1&&dc===2))return true; }
    else if (t==='K') { if(Math.abs(br-r)<=1&&Math.abs(bc-c)<=1)return true; }
    else if (t==='R'||t==='Q') {
      if (br===r||bc===c) {
        const sdr=br===r?0:(r-br)/Math.abs(r-br), sdc=bc===c?0:(c-bc)/Math.abs(c-bc);
        let nr=br+sdr,nc=bc+sdc; let ok=true;
        while(nr!==r||nc!==c){if(board[nr][nc]){ok=false;break;}nr+=sdr;nc+=sdc;}
        if(ok)return true;
      }
    }
    if (t==='B'||t==='Q') {
      if (Math.abs(br-r)===Math.abs(bc-c)&&br!==r) {
        const sdr=(r-br)/Math.abs(r-br), sdc=(c-bc)/Math.abs(c-bc);
        let nr=br+sdr,nc=bc+sdc; let ok=true;
        while(nr!==r||nc!==c){if(board[nr][nc]){ok=false;break;}nr+=sdr;nc+=sdc;}
        if(ok)return true;
      }
    }
  }
  return false;
}

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
  gameState.enPassant = null; // { r, c } 앙파상 대상 칸
  gameState.castling = { wK:true, wKR:true, wQR:true, bK:true, bKR:true, bQR:true };

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
  const piece = gameState.board[fr][fc];
  const captured = gameState.board[tr][tc];

  // 앙파상 판별 (폰이 대각으로 빈 칸으로 이동)
  const isEnPassant = piece?.[1]==='P' && fc!==tc && !gameState.board[tr][tc];
  // 캐슬링 판별 (킹이 2칸 이동)
  const isCastling = piece?.[1]==='K' && Math.abs(tc-fc)===2;

  gameState.board[tr][tc] = piece;
  gameState.board[fr][fc] = null;

  // 앙파상: 옆의 폰 제거
  if (isEnPassant) gameState.board[fr][tc] = null;

  // 캐슬링: 룩 이동
  if (isCastling) {
    const rookFromC = tc>fc ? 7 : 0;
    const rookToC   = tc>fc ? tc-1 : tc+1;
    gameState.board[fr][rookToC] = gameState.board[fr][rookFromC];
    gameState.board[fr][rookFromC] = null;
  }

  // 폰 승급
  if (gameState.board[tr][tc] === 'wP' && tr === 0) gameState.board[tr][tc] = 'wQ';
  if (gameState.board[tr][tc] === 'bP' && tr === 7) gameState.board[tr][tc] = 'bQ';

  // 앙파상 대상 칸 업데이트
  gameState.enPassant = (piece?.[1]==='P' && Math.abs(tr-fr)===2)
    ? { r: (fr+tr)/2, c: fc } : null;

  // 캐슬링 권리 갱신
  if (!gameState.castling) gameState.castling = { wK:true, wKR:true, wQR:true, bK:true, bKR:true, bQR:true };
  if (piece==='wK') gameState.castling.wK = false;
  if (piece==='bK') gameState.castling.bK = false;
  if (fr===7&&fc===7) gameState.castling.wKR = false;
  if (fr===7&&fc===0) gameState.castling.wQR = false;
  if (fr===0&&fc===7) gameState.castling.bKR = false;
  if (fr===0&&fc===0) gameState.castling.bQR = false;
  if (tr===7&&tc===7) gameState.castling.wKR = false;
  if (tr===7&&tc===0) gameState.castling.wQR = false;
  if (tr===0&&tc===7) gameState.castling.bKR = false;
  if (tr===0&&tc===0) gameState.castling.bQR = false;

  gameState.selected = null;
  gameState.possibleMoves = [];

  if (captured === 'bK' || captured === 'wK') {
    gameState.isOver = true;
    renderChessBoard();
    if (gameState.mode === 'ai') { updateRating('chess', isMe ? 'win' : 'loss'); showRatingBar('chess'); }
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
    // 앙파상
    const ep = gameState.enPassant;
    if (ep && r+dir===ep.r && Math.abs(c-ep.c)===1) moves.push([ep.r, ep.c]);
  } else if (type === 'N') {
    [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>{
      if (canGo(r+dr,c+dc)) moves.push([r+dr,c+dc]);
    });
  } else if (type === 'K') {
    [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>{
      if (canGo(r+dr,c+dc)) moves.push([r+dr,c+dc]);
    });
    // 캐슬링
    const cr = color==='w'?7:0;
    if (r===cr && c===4 && !isSquareAttacked(gameState.board,cr,4,enemy)) {
      // 킹사이드
      if (gameState.castling[color+'K'] && gameState.castling[color+'KR'] &&
          !gameState.board[cr][5] && !gameState.board[cr][6] &&
          !isSquareAttacked(gameState.board,cr,5,enemy) && !isSquareAttacked(gameState.board,cr,6,enemy)) {
        moves.push([cr, 6]);
      }
      // 퀸사이드
      if (gameState.castling[color+'K'] && gameState.castling[color+'QR'] &&
          !gameState.board[cr][1] && !gameState.board[cr][2] && !gameState.board[cr][3] &&
          !isSquareAttacked(gameState.board,cr,3,enemy) && !isSquareAttacked(gameState.board,cr,2,enemy)) {
        moves.push([cr, 2]);
      }
    }
  } else if (type === 'R') {
    slide([-1,1,0,0],[0,0,-1,1]);
  } else if (type === 'B') {
    slide([-1,-1,1,1],[-1,1,-1,1]);
  } else if (type === 'Q') {
    slide([-1,1,0,0,-1,-1,1,1],[0,0,-1,1,-1,1,-1,1]);
  }
  return moves;
}

// --- Chess AI: Alpha-Beta Minimax ---
const CHESS_PIECE_VAL = { P:100, N:320, B:330, R:500, Q:900, K:20000 };
const CHESS_PST = {
  P:[[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
  N:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
  B:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
  R:[[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
  Q:[[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
  K:[[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
};

function chessEvalBoard(board) {
  let score = 0;
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p=board[r][c]; if(!p) continue;
    const col=p[0], type=p[1];
    const val=(CHESS_PIECE_VAL[type]||0) + (CHESS_PST[type]?CHESS_PST[type][col==='w'?r:7-r][c]:0);
    score += col==='b' ? val : -val;
  }
  return score;
}

function chessMovesForBoard(board, r, c) {
  const p=board[r][c]; if(!p) return [];
  const col=p[0], type=p[1], moves=[], en=col==='w'?'b':'w', dir=col==='w'?-1:1;
  const inB=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
  const emp=(r,c)=>inB(r,c)&&!board[r][c];
  const isE=(r,c)=>inB(r,c)&&board[r][c]?.startsWith(en);
  const can=(r,c)=>emp(r,c)||isE(r,c);
  const sld=(drs,dcs)=>{for(let i=0;i<drs.length;i++){let nr=r+drs[i],nc=c+dcs[i];while(inB(nr,nc)){if(board[nr][nc]){if(isE(nr,nc))moves.push([nr,nc]);break;}moves.push([nr,nc]);nr+=drs[i];nc+=dcs[i];}}};
  if(type==='P'){if(emp(r+dir,c)){moves.push([r+dir,c]);const sr=col==='w'?6:1;if(r===sr&&emp(r+dir*2,c))moves.push([r+dir*2,c]);}if(isE(r+dir,c-1))moves.push([r+dir,c-1]);if(isE(r+dir,c+1))moves.push([r+dir,c+1]);}
  else if(type==='N'){[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>{if(can(r+dr,c+dc))moves.push([r+dr,c+dc]);});}
  else if(type==='K'){[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>{if(can(r+dr,c+dc))moves.push([r+dr,c+dc]);});}
  else if(type==='R')sld([-1,1,0,0],[0,0,-1,1]);
  else if(type==='B')sld([-1,-1,1,1],[-1,1,-1,1]);
  else if(type==='Q')sld([-1,1,0,0,-1,-1,1,1],[0,0,-1,1,-1,1,-1,1]);
  return moves;
}

function allChessMoves(board, col) {
  const moves=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    if(!board[r][c]?.startsWith(col))continue;
    for(const [tr,tc] of chessMovesForBoard(board,r,c))moves.push({fr:r,fc:c,tr,tc});
  }
  return moves;
}

function applyBoardMove(board, {fr,fc,tr,tc}) {
  const nb=board.map(row=>[...row]);
  const piece=nb[fr][fc];
  // 앙파상
  if(piece?.[1]==='P'&&fc!==tc&&!nb[tr][tc]) nb[fr][tc]=null;
  // 캐슬링
  if(piece?.[1]==='K'&&Math.abs(tc-fc)===2){
    const rfc=tc>fc?7:0, rtc=tc>fc?tc-1:tc+1;
    nb[fr][rtc]=nb[fr][rfc]; nb[fr][rfc]=null;
  }
  nb[tr][tc]=piece; nb[fr][fc]=null;
  if(nb[tr][tc]==='wP'&&tr===0)nb[tr][tc]='wQ';
  if(nb[tr][tc]==='bP'&&tr===7)nb[tr][tc]='bQ';
  return nb;
}

function alphaBeta(board, depth, alpha, beta, maxing) {
  if(depth===0) return chessEvalBoard(board);
  const col=maxing?'b':'w';
  const moves=allChessMoves(board,col);
  if(moves.length===0) return maxing?-30000:30000;
  if(maxing){
    let best=-Infinity;
    for(const m of moves){
      const nb=applyBoardMove(board,m);
      let hasWK=false; for(let r=0;r<8&&!hasWK;r++)for(let c=0;c<8&&!hasWK;c++)if(nb[r][c]==='wK')hasWK=true;
      if(!hasWK){best=Math.max(best,30000);break;}
      const ev=alphaBeta(nb,depth-1,alpha,beta,false);
      best=Math.max(best,ev); alpha=Math.max(alpha,ev);
      if(beta<=alpha)break;
    }
    return best;
  } else {
    let best=Infinity;
    for(const m of moves){
      const nb=applyBoardMove(board,m);
      let hasBK=false; for(let r=0;r<8&&!hasBK;r++)for(let c=0;c<8&&!hasBK;c++)if(nb[r][c]==='bK')hasBK=true;
      if(!hasBK){best=Math.min(best,-30000);break;}
      const ev=alphaBeta(nb,depth-1,alpha,beta,true);
      best=Math.min(best,ev); beta=Math.min(beta,ev);
      if(beta<=alpha)break;
    }
    return best;
  }
}

function chessAIMove() {
  if(gameState.isOver||gameState.myTurn)return;
  const diff=gameState.difficulty||'medium';
  const depth=diff==='easy'?1:diff==='medium'?2:3;
  const moves=allChessMoves(gameState.board,'b');
  if(moves.length===0){
    gameState.isOver=true;
    updateRating('chess','win'); showRatingBar('chess');
    $('gameStatus').textContent='🎉 승리! 체크메이트!'; return;
  }
  let bestMove=null, bestScore=-Infinity;
  for(const m of moves){
    const nb=applyBoardMove(gameState.board,m);
    let hasWK=false; for(let r=0;r<8&&!hasWK;r++)for(let c=0;c<8&&!hasWK;c++)if(nb[r][c]==='wK')hasWK=true;
    if(!hasWK){bestMove=m;bestScore=999999;break;}
    const sc=alphaBeta(nb,depth-1,-Infinity,Infinity,false);
    if(sc>bestScore){bestScore=sc;bestMove=m;}
  }
  if(bestMove){
    applyChessMove(bestMove.fr,bestMove.fc,bestMove.tr,bestMove.tc,false);
    if(!gameState.isOver){gameState.myTurn=true;$('gameStatus').textContent='내 차례 (흰색 ♙)';}
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
// 테트리스
// =============================================
function initTetris() {
  if (gameState.tetrisTimer) clearInterval(gameState.tetrisTimer);
  const COLS=10, ROWS=20, CELL=28, W=COLS*CELL, H=ROWS*CELL;
  const PIECES=[
    {shape:[[1,1,1,1]],color:'#00f5ff'},
    {shape:[[1,1],[1,1]],color:'#ffd700'},
    {shape:[[0,1,0],[1,1,1]],color:'#c000ff'},
    {shape:[[1,1,0],[0,1,1]],color:'#00ff44'},
    {shape:[[0,1,1],[1,1,0]],color:'#ff4400'},
    {shape:[[1,0,0],[1,1,1]],color:'#0066ff'},
    {shape:[[0,0,1],[1,1,1]],color:'#ff8800'},
  ];
  let board=Array(ROWS).fill(null).map(()=>Array(COLS).fill(null));
  let score=0, level=1, lines=0, hs=parseInt(localStorage.getItem('tetris_hs')||'0');
  let cur=null, nxt=null, hold=null, canHold=true, paused=false, isDead=false;

  const inner=$('gameBoardInner');
  inner.style.cssText='display:flex;justify-content:center;align-items:flex-start;gap:8px;padding:8px 0;flex-wrap:wrap';
  inner.innerHTML='';
  const canvas=document.createElement('canvas');
  canvas.width=W; canvas.height=H;
  canvas.style.cssText='border-radius:8px;display:block;flex-shrink:0';
  const side=document.createElement('div');
  side.style.cssText='display:flex;flex-direction:column;gap:6px;min-width:90px';
  side.innerHTML=`
    <div style="background:#1e2435;border-radius:8px;padding:8px;text-align:center">
      <div style="font-size:10px;color:#666;margin-bottom:4px">NEXT</div>
      <canvas id="tetNxt" width="80" height="80"></canvas>
    </div>
    <div style="background:#1e2435;border-radius:8px;padding:8px;text-align:center">
      <div style="font-size:10px;color:#666;margin-bottom:4px">HOLD (C)</div>
      <canvas id="tetHld" width="80" height="80"></canvas>
    </div>
    <div style="background:#1e2435;border-radius:8px;padding:8px;text-align:center">
      <div style="font-size:10px;color:#666">SCORE</div>
      <div id="tetScore" style="color:#fff;font-weight:bold;font-size:16px;margin:2px 0">${score}</div>
      <div style="font-size:10px;color:#666">BEST</div>
      <div id="tetHs" style="color:#ffd700;font-weight:bold">${hs}</div>
      <div style="font-size:10px;color:#666;margin-top:6px">LEVEL</div>
      <div id="tetLv" style="color:#00f5ff;font-weight:bold;font-size:18px">${level}</div>
      <div style="font-size:10px;color:#666">LINES</div>
      <div id="tetLn" style="color:#aaa;font-weight:bold">${lines}</div>
    </div>
    <div style="background:#1e2435;border-radius:8px;padding:6px 8px;font-size:10px;color:#555;line-height:1.7">
      ←→ 이동<br>↑ 회전<br>↓ 소프트<br>SPACE 하드<br>C 홀드<br>P 정지
    </div>`;
  inner.appendChild(canvas); inner.appendChild(side);
  const ctx=canvas.getContext('2d');

  function rng() { const p=PIECES[Math.floor(Math.random()*PIECES.length)]; return {shape:p.shape.map(r=>[...r]),color:p.color,x:Math.floor((COLS-p.shape[0].length)/2),y:0}; }
  function rot(s) { const R=s.length,C=s[0].length,r=Array(C).fill(null).map(()=>Array(R).fill(0)); for(let i=0;i<R;i++)for(let j=0;j<C;j++)r[j][R-1-i]=s[i][j]; return r; }
  function valid(s,px,py) { for(let r=0;r<s.length;r++)for(let c=0;c<s[r].length;c++){if(!s[r][c])continue;const nx=px+c,ny=py+r;if(nx<0||nx>=COLS||ny>=ROWS)return false;if(ny>=0&&board[ny][nx])return false;} return true; }

  function lock() {
    for(let r=0;r<cur.shape.length;r++)for(let c=0;c<cur.shape[r].length;c++)if(cur.shape[r][c]&&cur.y+r>=0)board[cur.y+r][cur.x+c]=cur.color;
    let cleared=0;
    for(let r=ROWS-1;r>=0;r--){if(board[r].every(c=>c)){board.splice(r,1);board.unshift(Array(COLS).fill(null));cleared++;r++;}}
    if(cleared){const pts=[0,100,300,500,800][cleared]*level;score+=pts;lines+=cleared;const nl=Math.floor(lines/10)+1;if(nl>level){level=nl;clearInterval(gameState.tetrisTimer);gameState.tetrisTimer=setInterval(tick,Math.max(80,500-(level-1)*40));}}
    if(score>hs){hs=score;localStorage.setItem('tetris_hs',hs);}
    canHold=true; cur=nxt; nxt=rng();
    if(!valid(cur.shape,cur.x,cur.y)){isDead=true;clearInterval(gameState.tetrisTimer);document.removeEventListener('keydown',kh);ctx.fillStyle='rgba(0,0,0,.75)';ctx.fillRect(0,H/2-50,W,100);ctx.fillStyle='#ff4757';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.fillText('GAME OVER',W/2,H/2-10);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText(`점수: ${score}`,W/2,H/2+20);ctx.textAlign='left';$('gameStatus').textContent=`💀 게임오버! 점수: ${score}`;}
    upd(); drawMini('tetNxt',nxt); drawMini('tetHld',hold);
  }

  function upd() { const g=id=>document.getElementById(id); if(g('tetScore'))g('tetScore').textContent=score;if(g('tetHs'))g('tetHs').textContent=hs;if(g('tetLv'))g('tetLv').textContent=level;if(g('tetLn'))g('tetLn').textContent=lines; }
  function drawMini(id,piece) { const c=document.getElementById(id);if(!c)return;const ctx2=c.getContext('2d');ctx2.fillStyle='#181e2e';ctx2.fillRect(0,0,80,80);if(!piece)return;const cs=16;const ox=Math.floor((80-piece.shape[0].length*cs)/2),oy=Math.floor((80-piece.shape.length*cs)/2);piece.shape.forEach((row,r)=>row.forEach((v,c2)=>{if(v){ctx2.fillStyle=piece.color;ctx2.fillRect(ox+c2*cs+1,oy+r*cs+1,cs-2,cs-2);}})); }

  function ghostY() { let g=cur.y; while(valid(cur.shape,cur.x,g+1))g++; return g; }

  function draw() {
    ctx.fillStyle='#0f1923';ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=.5;
    for(let r=0;r<=ROWS;r++){ctx.beginPath();ctx.moveTo(0,r*CELL);ctx.lineTo(W,r*CELL);ctx.stroke();}
    for(let c=0;c<=COLS;c++){ctx.beginPath();ctx.moveTo(c*CELL,0);ctx.lineTo(c*CELL,H);ctx.stroke();}
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){if(board[r][c]){ctx.fillStyle=board[r][c];ctx.fillRect(c*CELL+1,r*CELL+1,CELL-2,CELL-2);ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(c*CELL+1,r*CELL+1,CELL-2,5);}}
    if(!cur)return;
    const gy=ghostY();
    if(gy!==cur.y){ctx.fillStyle='rgba(255,255,255,.12)';cur.shape.forEach((row,r)=>row.forEach((v,c)=>{if(v)ctx.fillRect((cur.x+c)*CELL+1,(gy+r)*CELL+1,CELL-2,CELL-2);}));}
    cur.shape.forEach((row,r)=>row.forEach((v,c)=>{if(v){ctx.fillStyle=cur.color;ctx.fillRect((cur.x+c)*CELL+1,(cur.y+r)*CELL+1,CELL-2,CELL-2);ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect((cur.x+c)*CELL+1,(cur.y+r)*CELL+1,CELL-2,5);}}));
  }

  const kh=e=>{
    if(isDead)return;
    if(e.key==='p'||e.key==='P'){paused=!paused;$('gameStatus').textContent=paused?'⏸ 일시정지':'방향키 이동 · Space 하드드롭 · C 홀드';return;}
    if(paused)return;
    if(e.key==='ArrowLeft'){if(valid(cur.shape,cur.x-1,cur.y)){cur.x--;draw();}}
    else if(e.key==='ArrowRight'){if(valid(cur.shape,cur.x+1,cur.y)){cur.x++;draw();}}
    else if(e.key==='ArrowDown'){if(valid(cur.shape,cur.x,cur.y+1)){cur.y++;score++;upd();draw();}else{lock();draw();}}
    else if(e.key==='ArrowUp'||e.key==='x'||e.key==='X'){const r=rot(cur.shape);for(const k of[0,-1,1,-2,2])if(valid(r,cur.x+k,cur.y)){cur.shape=r;cur.x+=k;draw();break;}}
    else if(e.key===' '){cur.y=ghostY();score+=2;upd();lock();draw();drawMini('tetNxt',nxt);e.preventDefault();}
    else if(e.key==='c'||e.key==='C'){if(!canHold)return;canHold=false;if(!hold){hold=cur;cur=nxt;nxt=rng();}else{const tmp=hold;hold=cur;cur=tmp;cur.x=Math.floor((COLS-cur.shape[0].length)/2);cur.y=0;}drawMini('tetHld',hold);draw();}
    e.preventDefault();
  };
  document.addEventListener('keydown',kh);
  gameState._shootCleanup=()=>document.removeEventListener('keydown',kh);

  function tick(){if(paused||isDead)return;if(valid(cur.shape,cur.x,cur.y+1)){cur.y++;draw();}else{lock();draw();drawMini('tetNxt',nxt);}}

  cur=rng(); nxt=rng(); draw(); drawMini('tetNxt',nxt); upd();
  $('gameStatus').textContent='방향키 이동 · ↑ 회전 · Space 하드드롭 · C 홀드 · P 정지';
  gameState.tetrisTimer=setInterval(tick,500);
}

// =============================================
// 2048
// =============================================
function init2048() {
  const SZ=4;
  let board=Array(SZ).fill(null).map(()=>Array(SZ).fill(0));
  let score=0, best=parseInt(localStorage.getItem('2048_best')||'0'), dead=false;
  const COLORS={0:'#1e2435',2:'#2d6a4f',4:'#1b7a3e',8:'#f4a261',16:'#e76f51',32:'#e63946',64:'#d62828',128:'#7209b7',256:'#560bad',512:'#480ca8',1024:'#3a0ca3',2048:'#f72585',4096:'#b5179e'};
  const CELL=76, GAP=8, PAD=10, W=SZ*CELL+(SZ-1)*GAP+PAD*2;

  const inner=$('gameBoardInner');
  inner.style.cssText='display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0';
  inner.innerHTML='';
  const topBar=document.createElement('div');
  topBar.style.cssText='display:flex;gap:12px;align-items:center';
  topBar.innerHTML=`
    <div style="background:#1e2435;border-radius:8px;padding:8px 14px;text-align:center">
      <div style="font-size:10px;color:#666">SCORE</div>
      <div id="s2048" style="color:#fff;font-weight:bold;font-size:20px">${score}</div>
    </div>
    <div style="background:#1e2435;border-radius:8px;padding:8px 14px;text-align:center">
      <div style="font-size:10px;color:#666">BEST</div>
      <div id="b2048" style="color:#ffd700;font-weight:bold;font-size:20px">${best}</div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="restartGame()">새 게임</button>`;
  inner.appendChild(topBar);
  const canvas=document.createElement('canvas');
  canvas.width=W; canvas.height=W;
  canvas.style.cssText='border-radius:12px;display:block;max-width:100%';
  inner.appendChild(canvas);
  const ctx=canvas.getContext('2d');

  function addRand(){const e=[];for(let r=0;r<SZ;r++)for(let c=0;c<SZ;c++)if(!board[r][c])e.push([r,c]);if(!e.length)return;const[r,c]=e[Math.floor(Math.random()*e.length)];board[r][c]=Math.random()<.9?2:4;}
  function slide(line){let a=line.filter(v=>v),merged=false;for(let i=0;i<a.length-1;i++){if(a[i]===a[i+1]&&!merged){a[i]*=2;score+=a[i];a.splice(i+1,1);merged=true;}else merged=false;}while(a.length<SZ)a.push(0);return a;}
  function move(d){
    if(dead)return false; let mv=false;
    if(d==='l'){board=board.map(row=>{const n=slide(row);if(n.join()!==row.join())mv=true;return n;});}
    else if(d==='r'){board=board.map(row=>{const n=slide([...row].reverse()).reverse();if(n.join()!==row.join())mv=true;return n;});}
    else if(d==='u'){for(let c=0;c<SZ;c++){const col=board.map(r=>r[c]);const n=slide(col);n.forEach((v,r)=>{if(board[r][c]!==v)mv=true;board[r][c]=v;});}}
    else if(d==='d'){for(let c=0;c<SZ;c++){const col=board.map(r=>r[c]).reverse();const n=slide(col).reverse();n.forEach((v,r)=>{if(board[r][c]!==v)mv=true;board[r][c]=v;});}}
    if(mv){addRand();if(score>best){best=score;localStorage.setItem('2048_best',best);}draw2048();chkDead();}
    return mv;
  }
  function chkDead(){for(let r=0;r<SZ;r++)for(let c=0;c<SZ;c++){if(!board[r][c])return;if(c<SZ-1&&board[r][c]===board[r][c+1])return;if(r<SZ-1&&board[r][c]===board[r+1][c])return;}dead=true;$('gameStatus').textContent=`💀 게임오버! 최종 점수: ${score}`;}
  function draw2048(){
    ctx.fillStyle='#2d3250';ctx.fillRect(0,0,W,W);
    for(let r=0;r<SZ;r++)for(let c=0;c<SZ;c++){
      const v=board[r][c],x=PAD+c*(CELL+GAP),y=PAD+r*(CELL+GAP);
      ctx.fillStyle=COLORS[v]||'#f72585';
      if(typeof ctx.roundRect==='function'){ctx.beginPath();ctx.roundRect(x,y,CELL,CELL,8);ctx.fill();}
      else{ctx.fillRect(x,y,CELL,CELL);}
      if(v){ctx.fillStyle=v<=4?'#e0e0e0':'#fff';const fs=v<100?26:v<1000?20:14;ctx.font=`bold ${fs}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(v,x+CELL/2,y+CELL/2);}
    }
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    const s=document.getElementById('s2048'),b=document.getElementById('b2048');
    if(s)s.textContent=score;if(b)b.textContent=best;
  }
  const kh=e=>{const m={ArrowLeft:'l',ArrowRight:'r',ArrowUp:'u',ArrowDown:'d',a:'l',d:'r',w:'u',s:'d'};if(m[e.key]){move(m[e.key]);e.preventDefault();}};
  document.addEventListener('keydown',kh);
  let ts2=null;
  canvas.addEventListener('touchstart',e=>{ts2={x:e.touches[0].clientX,y:e.touches[0].clientY};e.preventDefault();},{passive:false});
  canvas.addEventListener('touchend',e=>{if(!ts2)return;const dx=e.changedTouches[0].clientX-ts2.x,dy=e.changedTouches[0].clientY-ts2.y;if(Math.abs(dx)>Math.abs(dy)){if(Math.abs(dx)>20)move(dx>0?'r':'l');}else{if(Math.abs(dy)>20)move(dy>0?'d':'u');}ts2=null;e.preventDefault();},{passive:false});
  gameState._shootCleanup=()=>document.removeEventListener('keydown',kh);
  addRand();addRand();draw2048();
  $('gameStatus').textContent='방향키/WASD로 이동! 2048에 도전하세요!';
}

// =============================================
// 블록 코딩 시스템 (Scratch 스타일)
// =============================================

const SCRATCH_CATS = [
  { id:'motion',    label:'동작',   color:'#4C97FF', dark:'#4280D7', blocks:[
    { type:'motion_move',     label:'[n] 만큼 움직이기',           params:[{name:'n',type:'num',default:'10'}] },
    { type:'motion_turnr',    label:'[n] 도 오른쪽 돌기',          params:[{name:'n',type:'num',default:'15'}] },
    { type:'motion_turnl',    label:'[n] 도 왼쪽 돌기',           params:[{name:'n',type:'num',default:'15'}] },
    { type:'motion_goto',     label:'x:[x] y:[y] 로 이동하기',    params:[{name:'x',type:'num',default:'0'},{name:'y',type:'num',default:'0'}] },
    { type:'motion_glide',    label:'[t]초 동안 x:[x] y:[y] 로',  params:[{name:'t',type:'num',default:'1'},{name:'x',type:'num',default:'0'},{name:'y',type:'num',default:'0'}] },
    { type:'motion_x',        label:'x좌표를 [n] 만큼 바꾸기',     params:[{name:'n',type:'num',default:'10'}] },
    { type:'motion_y',        label:'y좌표를 [n] 만큼 바꾸기',     params:[{name:'n',type:'num',default:'10'}] },
    { type:'motion_setx',     label:'x좌표를 [x] 로 정하기',       params:[{name:'x',type:'num',default:'0'}] },
    { type:'motion_sety',     label:'y좌표를 [y] 로 정하기',       params:[{name:'y',type:'num',default:'0'}] },
    { type:'motion_dir',      label:'[deg] 도 방향 보기',          params:[{name:'deg',type:'num',default:'90'}] },
    { type:'motion_bounce',   label:'벽에 닿으면 튕기기',          params:[] },
    { type:'motion_velx',     label:'가로속도를 [vx] 로 정하기',   params:[{name:'vx',type:'num',default:'3'}] },
    { type:'motion_vely',     label:'세로속도를 [vy] 로 정하기',   params:[{name:'vy',type:'num',default:'3'}] },
    { type:'motion_applyvel', label:'속도 적용하기',               params:[] },
  ]},
  { id:'looks',     label:'형태',   color:'#9966FF', dark:'#855CD6', blocks:[
    { type:'looks_say',        label:'[text] 라고 [t] 초 말하기',  params:[{name:'text',type:'text',default:'안녕!'},{name:'t',type:'num',default:'2'}] },
    { type:'looks_sayperm',    label:'[text] 라고 말하기',         params:[{name:'text',type:'text',default:'안녕!'}] },
    { type:'looks_think',      label:'[text] 라고 [t] 초 생각하기',params:[{name:'text',type:'text',default:'흠...'},{name:'t',type:'num',default:'2'}] },
    { type:'looks_stopsay',    label:'말풍선 지우기',              params:[] },
    { type:'looks_size',       label:'크기를 [size] % 로 정하기',  params:[{name:'size',type:'num',default:'100'}] },
    { type:'looks_changesize', label:'크기를 [n] % 만큼 바꾸기',   params:[{name:'n',type:'num',default:'10'}] },
    { type:'looks_color',      label:'색을 [color] 로 정하기',     params:[{name:'color',type:'color',default:'#ff0000'}] },
    { type:'looks_show',       label:'보이기',                     params:[] },
    { type:'looks_hide',       label:'숨기기',                     params:[] },
    { type:'looks_label',      label:'텍스트를 [text] 로 정하기',  params:[{name:'text',type:'text',default:'안녕!'}] },
  ]},
  { id:'sound',     label:'소리',   color:'#CF63CF', dark:'#C94FC9', blocks:[
    { type:'sound_beep',   label:'삑 소리내기',                    params:[] },
    { type:'sound_note',   label:'[note] 번 음 [t] 박자 연주',     params:[{name:'note',type:'num',default:'60'},{name:'t',type:'num',default:'0.5'}] },
    { type:'sound_drum',   label:'드럼 효과내기',                  params:[] },
    { type:'sound_vol',    label:'음량을 [vol] % 로 정하기',       params:[{name:'vol',type:'num',default:'100'}] },
  ]},
  { id:'events',    label:'이벤트', color:'#FFAB19', dark:'#CF8B17', blocks:[
    { type:'event_start',     label:'클릭했을 때',                 isHat:true, params:[], hasChildren:true },
    { type:'event_keydown',   label:'[key] 키를 눌렀을 때',       isHat:true, params:[{name:'key',type:'keysel',default:'오른쪽'}], hasChildren:true },
    { type:'event_click',     label:'이 스프라이트 클릭했을 때',   isHat:true, params:[], hasChildren:true },
    { type:'event_broadcast', label:'[msg] 방송하기',             params:[{name:'msg',type:'text',default:'메시지1'}] },
    { type:'event_receive',   label:'[msg] 를 받았을 때',         isHat:true, params:[{name:'msg',type:'text',default:'메시지1'}], hasChildren:true },
  ]},
  { id:'control',   label:'제어',   color:'#FFAB19', dark:'#CF8B17', blocks:[
    { type:'control_wait',    label:'[n] 초 기다리기',             params:[{name:'n',type:'num',default:'1'}] },
    { type:'control_repeat',  label:'[n] 번 반복하기',             params:[{name:'n',type:'num',default:'10'}], hasChildren:true },
    { type:'control_forever', label:'계속 반복하기',               params:[], hasChildren:true, isCap:true },
    { type:'control_if',      label:'만약 [cond] 라면',            params:[{name:'cond',type:'cond',default:'right_key'}], hasChildren:true },
    { type:'control_ifelse',  label:'만약 [cond] 라면/아니면',     params:[{name:'cond',type:'cond',default:'right_key'}], hasChildren:true, hasElse:true },
    { type:'control_stop',    label:'[which] 멈추기',              params:[{name:'which',type:'stopsel',default:'all'}], isCap:true },
  ]},
  { id:'sensing',   label:'감지',   color:'#5CB1D6', dark:'#47A8D1', blocks:[
    { type:'sensing_keypressed', label:'[key] 키 눌렸는가?',      params:[{name:'key',type:'keysel',default:'오른쪽'}] },
    { type:'sensing_mousedown',  label:'마우스 클릭했는가?',       params:[] },
    { type:'sensing_touchedge',  label:'벽에 닿았는가?',          params:[] },
    { type:'sense_key',          label:'[key] 키 눌렸는가? (구)', params:[{name:'key',type:'keysel',default:'오른쪽'}] },
    { type:'sense_edge',         label:'화면 끝에 닿았는가? (구)', params:[] },
  ]},
  { id:'operators', label:'연산',   color:'#59C059', dark:'#46B946', blocks:[
    { type:'op_add',    label:'[a] + [b]',                        params:[{name:'a',type:'num',default:'0'},{name:'b',type:'num',default:'0'}] },
    { type:'op_sub',    label:'[a] - [b]',                        params:[{name:'a',type:'num',default:'0'},{name:'b',type:'num',default:'0'}] },
    { type:'op_mul',    label:'[a] x [b]',                        params:[{name:'a',type:'num',default:'1'},{name:'b',type:'num',default:'1'}] },
    { type:'op_div',    label:'[a] / [b]',                        params:[{name:'a',type:'num',default:'1'},{name:'b',type:'num',default:'1'}] },
    { type:'op_random', label:'[a] ~ [b] 무작위 수',              params:[{name:'a',type:'num',default:'1'},{name:'b',type:'num',default:'10'}] },
    { type:'op_lt',     label:'[a] < [b]',                        params:[{name:'a',type:'num',default:'0'},{name:'b',type:'num',default:'0'}] },
    { type:'op_gt',     label:'[a] > [b]',                        params:[{name:'a',type:'num',default:'0'},{name:'b',type:'num',default:'0'}] },
    { type:'op_eq',     label:'[a] = [b]',                        params:[{name:'a',type:'num',default:'0'},{name:'b',type:'num',default:'0'}] },
    { type:'op_join',   label:'[a] 과 [b] 합치기',               params:[{name:'a',type:'text',default:'안녕'},{name:'b',type:'text',default:'세상'}] },
  ]},
  { id:'variables', label:'변수',   color:'#FF8C1A', dark:'#DB6E00', blocks:[
    { type:'var_set',    label:'[name] 을 [val] 로 정하기',       params:[{name:'name',type:'text',default:'점수'},{name:'val',type:'num',default:'0'}] },
    { type:'var_change', label:'[name] 을 [n] 만큼 바꾸기',       params:[{name:'name',type:'text',default:'점수'},{name:'n',type:'num',default:'1'}] },
    { type:'var_show',   label:'[name] 변수 보이기',               params:[{name:'name',type:'text',default:'점수'}] },
    { type:'var_hide',   label:'[name] 변수 숨기기',               params:[{name:'name',type:'text',default:'점수'}] },
  ]},
];

// backward-compat alias
const BC_CATS = SCRATCH_CATS;

const KEY_MAP = { '오른쪽':'ArrowRight','왼쪽':'ArrowLeft','위':'ArrowUp','아래':'ArrowDown','스페이스':' ','A':'a','S':'s','D':'d','W':'w' };
const COND_MAP = { right_key:'오른쪽 키',left_key:'왼쪽 키',up_key:'위 키',down_key:'아래 키',space_key:'스페이스',a_key:'A 키',s_key:'S 키',d_key:'D 키',w_key:'W 키',edge:'벽에 닿음',mouse_down:'마우스 클릭' };

let bcScript = [];
// New drag-drop workspace: array of stacks {id, x, y, blocks:[...]}
let bcWorkspace = [];
let bcSprite  = { x:240, y:180, w:50, h:50, color:'#f5a623', shape:'cat', emoji:'🐱', visible:true, velX:0, velY:0, label:'', dir:90, say:null, baseSize:50 };
let bcBgColor = '#87ceeb';
let bcBgScene = 'color'; // 'color' | scene_id | 'custom'
let bcCustomBgImg = null;
let bcCustomSpriteImg = null;
let bcRuntime = null;
let bcVars = {}, bcShownVars = new Set();
let _bcIdCounter = 0;
let bcCurrentCat = 'motion';
let _bcBroadcastBus = {};
let _bcVolume = 1.0;
const bcId = () => 'blk' + (++_bcIdCounter);

// Drag state for workspace
let _bcDrag = null;
// { type:'palette'|'stack', ghost, offsetX, offsetY, blockType?, stackId? }

// ---- Scratch-style editor init ----

function scInitEditor() {
  const catsEl = $('scratchCats');
  if (catsEl) {
    catsEl.innerHTML = SCRATCH_CATS.map(cat => `
      <div class="scratch-cat-item${cat.id===bcCurrentCat?' active':''}" id="scCatTab-${cat.id}"
           style="${cat.id===bcCurrentCat?'border-left-color:'+cat.color+';':''}"
           onclick="scShowCat('${cat.id}')">
        <div class="scratch-cat-dot" style="background:${cat.color}"></div>
        <div class="scratch-cat-label">${cat.label}</div>
      </div>`).join('');
  }
  scShowCat(bcCurrentCat);
  bcRenderWorkspace();
  bcRenderSpriteFloor();
  bcUpdateMiniStage();
  bcInitAddSpriteGrid();
}

function scShowCat(catId) {
  bcCurrentCat = catId;
  const cat = SCRATCH_CATS.find(c => c.id === catId);
  if (!cat) return;
  SCRATCH_CATS.forEach(c => {
    const tab = $('scCatTab-'+c.id);
    if (!tab) return;
    tab.classList.toggle('active', c.id === catId);
    tab.style.borderLeftColor = c.id === catId ? c.color : 'transparent';
  });
  const pal = $('scratchPal');
  if (!pal) return;
  pal.innerHTML = `<div class="bce-pal-title" style="color:${cat.color}">${cat.label}</div>`;
  cat.blocks.forEach(b => {
    const div = document.createElement('div');
    div.className = 'bce-pal-block' + (b.isHat ? ' bce-hat' : '');
    div.style.background = cat.color;
    div.style.boxShadow = `0 2px 0 ${cat.dark}`;
    div.innerHTML = _bcPalHtml(b);
    div.addEventListener('mousedown', e => { if (e.button !== 0) return; bcPalDragStart(e, b.type, cat.color, cat.dark, div); });
    pal.appendChild(div);
  });
}

function _bcPalHtml(def) {
  return def.label.replace(/\[[^\]]+\]/g, m => {
    const pname = m.slice(1,-1);
    const pDef = def.params.find(p => p.name === pname);
    if (!pDef) return m;
    if (pDef.type==='color') return `<span class="bce-pal-param" style="display:inline-block;width:16px;height:12px;background:${pDef.default};border-radius:2px;vertical-align:middle"></span>`;
    const label = pDef.type==='keysel' ? pDef.default : pDef.type==='cond' ? (COND_MAP[pDef.default]||pDef.default) : pDef.type==='stopsel' ? '모두' : pDef.default;
    return `<span class="bce-pal-param">${label}</span>`;
  });
}

// ============================================
// 드래그앤드롭 블록 워크스페이스
// ============================================

function bcFindBlockDef(type) {
  for (const cat of SCRATCH_CATS) {
    const def = cat.blocks.find(b => b.type === type);
    if (def) return { def, cat };
  }
  return null;
}

function bcMakeBlock(type) {
  const found = bcFindBlockDef(type);
  if (!found) return { id: bcId(), type, params: {} };
  const { def } = found;
  const params = {};
  def.params.forEach(p => params[p.name] = p.default);
  return {
    id: bcId(), type, params,
    children: def.hasChildren ? [] : undefined,
    elseChildren: def.hasElse ? [] : undefined,
  };
}

// Compile bcWorkspace → bcScript for the run engine
function bcCompileScript() {
  bcScript = [];
  for (const stack of bcWorkspace) {
    if (!stack.blocks.length) continue;
    const first = stack.blocks[0];
    const found = bcFindBlockDef(first.type);
    if (found?.def.isHat) {
      bcScript.push({
        ...first,
        children: [...(first.children || []), ...stack.blocks.slice(1)],
      });
    } else {
      stack.blocks.forEach(b => bcScript.push(b));
    }
  }
}

function bcClearWorkspace() {
  if (!confirm('워크스페이스를 모두 초기화할까요?')) return;
  bcWorkspace = [];
  bcRenderWorkspace();
  if (!bcRuntime) bcDrawPreview();
}

// Legacy alias used in some places
function bcClearScript() { bcClearWorkspace(); }

// ---- Workspace rendering ----

function bcRenderWorkspace() {
  const ws = $('bcCodeWorkspace');
  if (!ws) return;
  ws.querySelectorAll('.bw-stack').forEach(el => el.remove());
  for (const stack of bcWorkspace) {
    ws.appendChild(_bcCreateStackEl(stack));
  }
}

function _bcCreateStackEl(stack) {
  const div = document.createElement('div');
  div.className = 'bw-stack';
  div.dataset.stackId = stack.id;
  div.style.left = stack.x + 'px';
  div.style.top = stack.y + 'px';

  stack.blocks.forEach((block, idx) => {
    const el = _bcCreateBlockEl(block, stack, idx);
    div.appendChild(el);
  });

  // Drag entire stack
  div.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.closest('.bw-del')) return;
    e.preventDefault();
    bcStackDragStart(e, stack.id, div);
  });

  return div;
}

function _bcCreateBlockEl(block, stack, idx) {
  const found = bcFindBlockDef(block.type);
  if (!found) {
    const unk = document.createElement('div');
    unk.className = 'bw-block'; unk.style.background = '#888';
    unk.textContent = block.type; return unk;
  }
  const { def, cat } = found;
  const color = cat.color, dark = cat.dark || color;

  if (def.hasChildren) {
    return _bcCreateCBlock(block, def, color, dark, stack);
  }

  const div = document.createElement('div');
  div.className = 'bw-block' + (def.isHat ? ' bw-hat' : '') + (def.isCap ? ' bw-no-bump' : '');
  div.style.background = color;
  div.style.boxShadow = `0 3px 0 ${dark}`;
  div.dataset.blockId = block.id;

  _bcBuildBlockBody(def, block, div);
  _bcAddDelBtn(div, () => _bcDeleteFromStack(stack, block.id));
  return div;
}

function _bcCreateCBlock(block, def, color, dark, stack) {
  const wrap = document.createElement('div');
  wrap.className = 'bw-c-wrap';
  wrap.dataset.blockId = block.id;

  const top = document.createElement('div');
  top.className = 'bw-block bw-c-top' + (def.isHat ? ' bw-hat' : '') + ' bw-no-bump';
  top.style.background = color;
  top.style.boxShadow = `0 3px 0 ${dark}`;
  _bcBuildBlockBody(def, block, top);
  _bcAddDelBtn(top, () => _bcDeleteFromStack(stack, block.id));
  wrap.appendChild(top);

  const inner = document.createElement('div');
  inner.className = 'bw-c-inner';
  inner.style.borderLeftColor = dark;
  (block.children || []).forEach(ch => inner.appendChild(_bcCreateBlockEl(ch, stack, -1)));
  if (!(block.children || []).length) {
    const hint = document.createElement('div');
    hint.className = 'bw-c-inner-hint'; hint.textContent = '블록을 안으로 드래그';
    inner.appendChild(hint);
  }
  wrap.appendChild(inner);

  if (def.hasElse) {
    const elseLabel = document.createElement('div');
    elseLabel.className = 'bw-c-else-label'; elseLabel.style.background = dark;
    elseLabel.textContent = '아니면';
    wrap.appendChild(elseLabel);
    const elseInner = document.createElement('div');
    elseInner.className = 'bw-c-inner';
    elseInner.style.borderLeftColor = dark;
    (block.elseChildren || []).forEach(ch => elseInner.appendChild(_bcCreateBlockEl(ch, stack, -1)));
    if (!(block.elseChildren || []).length) {
      const hint2 = document.createElement('div');
      hint2.className = 'bw-c-inner-hint'; hint2.textContent = '블록을 안으로 드래그';
      elseInner.appendChild(hint2);
    }
    wrap.appendChild(elseInner);
  }

  const cap = document.createElement('div');
  cap.className = 'bw-c-cap'; cap.style.background = color;
  cap.style.boxShadow = `0 3px 0 ${dark}`;
  wrap.appendChild(cap);
  return wrap;
}

function _bcBuildBlockBody(def, block, container) {
  def.label.split(/(\[[^\]]+\])/).forEach(part => {
    const match = part.match(/^\[(\w+)\]$/);
    if (match) {
      const pname = match[1];
      const pDef = def.params.find(p => p.name === pname);
      if (!pDef) return;
      if (pDef.type === 'color') {
        const inp = document.createElement('input');
        inp.type = 'color'; inp.value = block.params[pname] || pDef.default;
        inp.className = 'bw-inp-color';
        inp.addEventListener('change', e => { block.params[pname] = e.target.value; bcDrawPreview(); });
        container.appendChild(inp);
      } else if (pDef.type === 'keysel') {
        const sel = document.createElement('select'); sel.className = 'bw-sel';
        ['오른쪽','왼쪽','위','아래','스페이스','A','S','D','W'].forEach(k => {
          const o = document.createElement('option'); o.value = k; o.textContent = k;
          if ((block.params[pname] || pDef.default) === k) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', e => block.params[pname] = e.target.value);
        container.appendChild(sel);
      } else if (pDef.type === 'cond') {
        const sel = document.createElement('select'); sel.className = 'bw-sel';
        Object.keys(COND_MAP).forEach(k => {
          const o = document.createElement('option'); o.value = k; o.textContent = COND_MAP[k];
          if ((block.params[pname] || pDef.default) === k) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', e => block.params[pname] = e.target.value);
        container.appendChild(sel);
      } else if (pDef.type === 'stopsel') {
        const sel = document.createElement('select'); sel.className = 'bw-sel';
        [['all','모두'],['this','이 스크립트'],['other','다른 스크립트']].forEach(([v,t]) => {
          const o = document.createElement('option'); o.value = v; o.textContent = t;
          if ((block.params[pname] || pDef.default) === v) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', e => block.params[pname] = e.target.value);
        container.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.className = 'bw-inp' + (pDef.type === 'text' ? ' bw-inp-text' : '');
        inp.type = pDef.type === 'num' ? 'number' : 'text';
        inp.value = block.params[pname] !== undefined ? block.params[pname] : (pDef.default || '');
        inp.addEventListener('input', e => { block.params[pname] = e.target.value; bcDrawPreview(); });
        container.appendChild(inp);
      }
    } else if (part.trim()) {
      const s = document.createElement('span'); s.textContent = part;
      container.appendChild(s);
    }
  });
}

function _bcAddDelBtn(container, onClick) {
  const btn = document.createElement('button');
  btn.className = 'bw-del'; btn.innerHTML = '×'; btn.title = '삭제';
  btn.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  container.appendChild(btn);
}

function _bcDeleteFromStack(stack, blockId) {
  function removeFrom(arr) {
    const i = arr.findIndex(b => b.id === blockId);
    if (i !== -1) { arr.splice(i, 1); return true; }
    for (const b of arr) {
      if (b.children && removeFrom(b.children)) return true;
      if (b.elseChildren && removeFrom(b.elseChildren)) return true;
    }
    return false;
  }
  removeFrom(stack.blocks);
  if (stack.blocks.length === 0) bcWorkspace = bcWorkspace.filter(s => s.id !== stack.id);
  bcRenderWorkspace();
  if (!bcRuntime) bcDrawPreview();
}

// ---- Drag-drop ----

function bcPalDragStart(e, blockType, color, dark, palEl) {
  e.preventDefault();
  // Ghost = mini block visual
  const ghost = document.createElement('div');
  ghost.className = 'bw-ghost bw-block';
  ghost.style.cssText = `background:${color};box-shadow:0 3px 0 ${dark};min-width:120px;`;
  const found = bcFindBlockDef(blockType);
  if (found) {
    ghost.innerHTML = found.def.label
      .replace(/\[[^\]]+\]/g, m => {
        const pname = m.slice(1,-1);
        const pDef = found.def.params.find(p => p.name === pname);
        if (!pDef) return m;
        return `<span class="bw-inp" style="display:inline-block;min-width:28px;">${pDef.default}</span>`;
      });
  }
  document.body.appendChild(ghost);
  const gw = ghost.offsetWidth || 120, gh = ghost.offsetHeight || 36;
  ghost.style.left = (e.clientX - gw/2) + 'px';
  ghost.style.top = (e.clientY - gh/2) + 'px';

  _bcDrag = { type: 'palette', ghost, blockType, offsetX: gw/2, offsetY: gh/2 };
}

function bcStackDragStart(e, stackId, stackEl) {
  e.preventDefault();
  const rect = stackEl.getBoundingClientRect();
  const ghost = stackEl.cloneNode(true);
  ghost.className = 'bw-ghost bw-stack';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  ghost.style.width = rect.width + 'px';
  ghost.style.pointerEvents = 'none';
  document.body.appendChild(ghost);
  stackEl.classList.add('bw-dragging');

  _bcDrag = {
    type: 'stack', ghost, stackId, stackEl,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
  };
}

// Global mouse handlers for drag-drop
document.addEventListener('mousemove', e => {
  if (!_bcDrag) return;
  const { ghost, offsetX, offsetY } = _bcDrag;
  ghost.style.left = (e.clientX - offsetX) + 'px';
  ghost.style.top = (e.clientY - offsetY) + 'px';

  // Highlight drop target
  document.querySelectorAll('.bw-stack.drop-target').forEach(el => el.classList.remove('drop-target'));
  const snap = _bcFindSnapTarget(e.clientX, e.clientY, _bcDrag.stackId);
  if (snap) {
    const el = document.querySelector(`[data-stack-id="${snap.id}"]`);
    if (el) el.classList.add('drop-target');
  }
});

document.addEventListener('mouseup', e => {
  if (!_bcDrag) return;
  const drag = _bcDrag;
  _bcDrag = null;
  drag.ghost.remove();
  document.querySelectorAll('.bw-stack.drop-target,.bw-stack.bw-dragging').forEach(el => {
    el.classList.remove('drop-target', 'bw-dragging');
  });

  const ws = $('bcCodeWorkspace');
  if (!ws) return;
  const wsRect = ws.getBoundingClientRect();
  const inWS = e.clientX >= wsRect.left && e.clientX <= wsRect.right &&
                e.clientY >= wsRect.top && e.clientY <= wsRect.bottom;

  if (inWS) {
    const dropX = e.clientX - wsRect.left + ws.scrollLeft - drag.offsetX;
    const dropY = e.clientY - wsRect.top + ws.scrollTop - drag.offsetY;

    if (drag.type === 'palette') {
      const newBlock = bcMakeBlock(drag.blockType);
      const snap = _bcFindSnapTarget(e.clientX, e.clientY, null);
      if (snap) {
        snap.blocks.push(newBlock);
      } else {
        bcWorkspace.push({ id: 'st' + bcId(), x: Math.max(0, dropX), y: Math.max(0, dropY), blocks: [newBlock] });
      }
    } else if (drag.type === 'stack') {
      const stack = bcWorkspace.find(s => s.id === drag.stackId);
      if (stack) {
        const snap = _bcFindSnapTarget(e.clientX, e.clientY, drag.stackId);
        if (snap) {
          snap.blocks.push(...stack.blocks);
          bcWorkspace = bcWorkspace.filter(s => s.id !== drag.stackId);
        } else {
          stack.x = Math.max(0, dropX);
          stack.y = Math.max(0, dropY);
        }
      }
    }
  } else if (drag.type === 'stack') {
    // Dropped outside → delete stack
    bcWorkspace = bcWorkspace.filter(s => s.id !== drag.stackId);
  }

  bcRenderWorkspace();
  if (!bcRuntime) bcDrawPreview();
});

function _bcFindSnapTarget(clientX, clientY, excludeId) {
  const ws = $('bcCodeWorkspace');
  if (!ws) return null;
  for (const stack of bcWorkspace) {
    if (stack.id === excludeId) continue;
    const el = ws.querySelector(`[data-stack-id="${stack.id}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (clientX >= rect.left - 16 && clientX <= rect.right + 16 &&
        clientY >= rect.bottom - 16 && clientY <= rect.bottom + 32) {
      return stack;
    }
  }
  return null;
}

// ---- Sprite floor ----

const BC_SPRITE_LIB = [
  { key:'dog', emoji:'🐶', label:'강아지' }, { key:'duck', emoji:'🦆', label:'오리' },
  { key:'bear', emoji:'🐻', label:'곰' }, { key:'bunny', emoji:'🐰', label:'토끼' },
  { key:'tiger', emoji:'🐯', label:'호랑이' }, { key:'fox', emoji:'🦊', label:'여우' },
  { key:'lion', emoji:'🦁', label:'사자' }, { key:'person', emoji:'🧍', label:'사람' },
  { key:'robot', emoji:'🤖', label:'로봇' }, { key:'ninja', emoji:'🥷', label:'닌자' },
  { key:'wizard', emoji:'🧙', label:'마법사' }, { key:'alien', emoji:'👾', label:'외계인' },
  { key:'ghost', emoji:'👻', label:'유령' }, { key:'rocket', emoji:'🚀', label:'로켓' },
  { key:'ufo', emoji:'🛸', label:'UFO' }, { key:'star', emoji:'⭐', label:'별' },
  { key:'bolt', emoji:'⚡', label:'번개' }, { key:'ball', emoji:'🔴', label:'공' },
  { key:'bomb', emoji:'💣', label:'폭탄' }, { key:'sword', emoji:'⚔️', label:'검' },
  { key:'car', emoji:'🚗', label:'자동차' }, { key:'arrow', emoji:'➤', label:'화살표' },
];

function bcRenderSpriteFloor() {
  const list = $('bcSpriteFloorList');
  if (!list) return;
  // Cat card (always first)
  list.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'bce-floor-sprite-card active';
  card.title = '고양이 설정';
  const cv = document.createElement('canvas');
  cv.width = 54; cv.height = 54;
  const ctx = cv.getContext('2d');
  ctx.translate(27, 38); bcDrawCat(ctx, 50);
  card.appendChild(cv);
  const nm = document.createElement('div');
  nm.className = 'bce-floor-sprite-name';
  nm.textContent = $('bcSpriteLabel')?.value || '고양이';
  card.appendChild(nm);
  const editBtn = document.createElement('button');
  editBtn.className = 'bce-sprite-edit-btn'; editBtn.innerHTML = '⚙';
  editBtn.title = '설정'; editBtn.onclick = (e) => { e.stopPropagation(); bcOpenSpriteSettings(); };
  card.appendChild(editBtn);
  list.appendChild(card);
}

function bcInitAddSpriteGrid() {
  const grid = $('bcAddSpriteGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="bce-add-grid">' +
    BC_SPRITE_LIB.map(s => `
      <div class="bce-add-item" onclick="bcSelectSprite('${s.key}','${s.emoji}','${s.label}')">
        <span class="bce-add-item-emoji">${s.emoji}</span>
        <span class="bce-add-item-name">${s.label}</span>
      </div>`).join('') +
    `<label class="bce-add-item" title="파일에서 불러오기" style="cursor:pointer">
       <span class="bce-add-item-emoji">📁</span>
       <span class="bce-add-item-name">업로드</span>
       <input type="file" accept="image/*" onchange="bcUploadSprite(event);bcCloseAddSprite();" style="display:none">
     </label></div>`;
}

function bcOpenAddSprite() { $('bcAddSpritePopup')?.classList.remove('hidden'); }
function bcCloseAddSprite() { $('bcAddSpritePopup')?.classList.add('hidden'); }

function bcSelectSprite(key, emoji, label) {
  bcSprite.shape = 'emoji'; bcSprite.emoji = emoji;
  $('bcSpriteLabel').value = label;
  bcUpdateSprite();
  bcRenderSpriteFloor();
  bcCloseAddSprite();
}

function bcOpenSpriteSettings() { $('bcSpriteSettingsPopup')?.classList.remove('hidden'); }

function bcOpenBgPopup() {
  bcInitSceneGrid();
  $('bcBgPopup')?.classList.remove('hidden');
}
function bcCloseBgPopup() { $('bcBgPopup')?.classList.add('hidden'); }

function bcUpdateMiniStage() {
  const cv = $('bcStageMiniCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  bcDrawBg(ctx, 66, 50);
}

// (bcSetBgColor / bcSetBgScene defined below)

// ---- Open / Close ----

function openBlockCoder() {
  $('bcModal').classList.remove('hidden');
  bcSwitchMode('beginner');
}

function closeBlockCoder() {
  bcStop();
  bcBegStop();
  bcStageExpanded = false;
  document.querySelector('.scratch-ide')?.classList.remove('stage-fullscreen');
  $('bcModal').classList.add('hidden');
}

// =============================================
// 블록코딩 모드 전환
// =============================================
let bcMode = 'beginner';
let bcStageExpanded = false;

function bcSwitchMode(mode) {
  bcMode = mode;
  bcBegStop();
  if (mode !== 'expert') bcStop();

  const begEl = $('bc-beginner'), expEl = $('bc-expert');
  const tabBeg = $('bcModeTabBeg'), tabExp = $('bcModeTabExp');
  const runBtn = $('bcRunBtn'), stopBtn = $('bcStopBtn');
  const submitBtn = $('bcSubmitBtn'), clearBtn = $('bcClearBtn');

  if (mode === 'beginner') {
    begEl.classList.remove('hidden'); expEl.classList.add('hidden');
    tabBeg.classList.add('active'); tabExp.classList.remove('active');
    if (runBtn) runBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    bcRenderBegZone();
  } else {
    begEl.classList.add('hidden'); expEl.classList.remove('hidden');
    tabBeg.classList.remove('active'); tabExp.classList.add('active');
    if (runBtn) runBtn.style.display = '';
    if (submitBtn) submitBtn.style.display = '';
    if (clearBtn) clearBtn.style.display = '';
    scInitEditor();
    bcDrawPreview();
  }
}

function bcToggleStage() {
  bcStageExpanded = !bcStageExpanded;
  const ide = document.querySelector('.scratch-ide');
  const btn = $('bcExpandBtn');
  ide.classList.toggle('stage-fullscreen', bcStageExpanded);
  if (btn) { btn.textContent = bcStageExpanded ? '⤡' : '⤢'; btn.title = bcStageExpanded ? '스테이지 축소' : '스테이지 확대'; }
  bcDrawPreview();
}

// =============================================
// 초보코딩존
// =============================================
const BC_TEMPLATES = [
  { id:'runner',  name:'달리기 게임',    emoji:'🏃', bg:'#87ceeb', desc:'스페이스/클릭으로 점프! 장애물을 피해요.' },
  { id:'catch',   name:'별 먹기',        emoji:'⭐', bg:'#0a0a2e', desc:'방향키로 이동해 떨어지는 별을 잡아요!' },
  { id:'dodge',   name:'운석 피하기',    emoji:'🚀', bg:'#0a0a2e', desc:'방향키로 움직여 날아오는 운석을 피해요!' },
  { id:'fish',    name:'물고기 잡기',    emoji:'🐟', bg:'#1a6fa0', desc:'클릭해서 지나가는 물고기를 잡아요!' },
  { id:'balloon', name:'풍선 터뜨리기',  emoji:'🎈', bg:'#e8d5f5', desc:'클릭해서 올라오는 풍선을 터뜨려요!' },
  { id:'survive', name:'피하기 게임',    emoji:'😎', bg:'#1a1a2e', desc:'방향키로 움직여 떨어지는 공을 피해요!' },
];
const BC_BEG_CHARS = [
  { id:'cat',emoji:'🐱' },{ id:'dog',emoji:'🐶' },{ id:'duck',emoji:'🦆' },
  { id:'bear',emoji:'🐻' },{ id:'bunny',emoji:'🐰' },{ id:'tiger',emoji:'🐯' },
  { id:'person',emoji:'🧍' },{ id:'robot',emoji:'🤖' },{ id:'rocket',emoji:'🚀' },
  { id:'star',emoji:'⭐' },
];
const BC_BEG_BGS = [
  ['#87ceeb','하늘'],['#0a0a2e','우주'],['#1a6fa0','바다'],
  ['#1a3a1a','숲'],['#f4e4a1','사막'],['#e8d5f5','분홍'],
];

let bcBegTemplate = 'runner';
let bcBegRunning = false;
let bcBegRAF = null;
let bcBegKeyState = {};
let bcBegKeydownH = null;
let bcBegKeyupH = null;
let bcBegClickH = null;
let bcBegSettings = { char: 'cat', speed: 5, bg: '#87ceeb' };

function bcRenderBegZone() {
  const zone = $('bc-beginner');
  if (!zone) return;
  const tpl = BC_TEMPLATES.find(t => t.id === bcBegTemplate) || BC_TEMPLATES[0];
  const charEmoji = BC_BEG_CHARS.find(c => c.id === bcBegSettings.char)?.emoji || '🐱';

  zone.innerHTML = `
  <div class="bc-beg-layout">
    <div class="bc-tpl-grid">
      ${BC_TEMPLATES.map(t => `
        <div class="bc-tpl-card${t.id===bcBegTemplate?' active':''}" onclick="bcBegSelectTpl('${t.id}')">
          <div class="bc-tpl-emoji">${t.emoji}</div>
          <div class="bc-tpl-name">${t.name}</div>
        </div>
      `).join('')}
    </div>
    <div class="bc-beg-right">
      <div class="bc-beg-info">
        <div class="bc-beg-info-emoji">${tpl.emoji}</div>
        <div>
          <div class="bc-beg-info-name">${tpl.name}</div>
          <div class="bc-beg-info-desc">${tpl.desc}</div>
        </div>
      </div>
      <div class="bc-beg-settings">
        <div class="bc-beg-setting-row">
          <label>캐릭터</label>
          <div class="bc-beg-char-grid">
            ${BC_BEG_CHARS.map(c=>`<div class="bc-beg-char${c.id===bcBegSettings.char?' active':''}" onclick="bcBegSetChar('${c.id}')" title="${c.id}">${c.emoji}</div>`).join('')}
          </div>
        </div>
        <div class="bc-beg-setting-row">
          <label>속도</label>
          <input type="range" min="1" max="10" value="${bcBegSettings.speed}" oninput="bcBegSetSpeed(this.value)" class="bc-beg-slider">
          <span class="bc-beg-speed-val" id="bcBegSpeedVal">${bcBegSettings.speed}</span>
        </div>
        <div class="bc-beg-setting-row">
          <label>배경</label>
          <div class="bc-beg-bg-list">
            ${BC_BEG_BGS.map(([c,n])=>`<div class="bc-beg-bg${bcBegSettings.bg===c?' active':''}" style="background:${c}" onclick="bcBegSetBg('${c}')" title="${n}"></div>`).join('')}
            <label class="bc-beg-bg" style="background:#555;font-size:14px;position:relative" title="직접 선택">🎨<input type="color" value="${bcBegSettings.bg}" onchange="bcBegSetBg(this.value)" style="opacity:0;width:0;height:0;position:absolute"></label>
          </div>
        </div>
      </div>
      <div class="bc-beg-canvas-wrap">
        <canvas id="bcBegCanvas" width="400" height="260" class="bc-beg-canvas" onclick="bcBegCanvasClick(event)"></canvas>
        <div class="bc-beg-ctrl">
          <button class="bc-beg-run-btn" id="bcBegRunBtn" onclick="bcBegRun()">▶ 실행</button>
          <button class="bc-beg-stop-btn" id="bcBegStopBtn" onclick="bcBegStop()" style="display:none">■ 정지</button>
          <span class="bc-beg-score-el" id="bcBegScoreEl">점수: 0</span>
        </div>
      </div>
    </div>
  </div>`;
  bcBegPreview();
}

function bcBegSelectTpl(id) {
  bcBegTemplate = id;
  const tpl = BC_TEMPLATES.find(t=>t.id===id);
  if (tpl) bcBegSettings.bg = tpl.bg;
  bcBegStop();
  bcRenderBegZone();
}
function bcBegSetChar(id) { bcBegSettings.char = id; bcBegStop(); bcRenderBegZone(); }
function bcBegSetSpeed(v) {
  bcBegSettings.speed = parseInt(v);
  const el = $('bcBegSpeedVal'); if (el) el.textContent = v;
}
function bcBegSetBg(c) { bcBegSettings.bg = c; bcBegStop(); bcRenderBegZone(); }
function bcBegGetEmoji() { return BC_BEG_CHARS.find(c=>c.id===bcBegSettings.char)?.emoji || '🐱'; }

function bcBegCanvasClick(e) {
  if (!bcBegRunning) bcBegRun();
}

function bcBegPreview() {
  const cv = $('bcBegCanvas'); if (!cv) return;
  const ctx = cv.getContext('2d');
  const W=cv.width, H=cv.height;
  ctx.fillStyle = bcBegSettings.bg; ctx.fillRect(0,0,W,H);
  const emoji = bcBegGetEmoji();
  const tpl = BC_TEMPLATES.find(t=>t.id===bcBegTemplate);
  ctx.textAlign='center'; ctx.textBaseline='middle';

  if (bcBegTemplate==='runner') {
    ctx.fillStyle='#5d4037'; ctx.fillRect(0,H-36,W,36);
    ctx.fillStyle='#4caf50'; ctx.fillRect(0,H-38,W,4);
    ctx.font='38px serif'; ctx.fillText(emoji,80,H-58);
    ctx.fillStyle='#e53935'; ctx.fillRect(290,H-38-36,24,36);
    ctx.fillStyle='#e53935'; ctx.fillRect(330,H-38-22,20,22);
  } else if (bcBegTemplate==='catch') {
    ctx.font='36px serif'; ctx.fillText(emoji,W/2,H-34);
    ctx.font='28px serif'; ctx.fillText('⭐',W/2-80,60); ctx.fillText('🌟',W/2,40); ctx.fillText('✨',W/2+80,80);
  } else if (bcBegTemplate==='dodge') {
    ctx.font='36px serif'; ctx.fillText(emoji,60,H/2);
    ctx.font='28px serif'; ctx.fillText('🪨',280,H/2-40); ctx.fillText('☄️',340,H/2+20); ctx.fillText('💥',300,H/2+70);
  } else if (bcBegTemplate==='fish') {
    ctx.fillStyle='rgba(255,255,255,0.1)';
    for(let i=0;i<4;i++) ctx.fillRect(0,50+i*55,W,3);
    ctx.font='36px serif'; ctx.fillText('🐟',120,90); ctx.fillText('🐠',280,140); ctx.fillText('🐡',160,200);
  } else if (bcBegTemplate==='balloon') {
    ctx.font='40px serif'; ctx.fillText('🎈',140,130); ctx.fillText('🎈',260,90); ctx.fillText('🎃',200,170);
  } else if (bcBegTemplate==='survive') {
    ctx.font='36px serif'; ctx.fillText(emoji,W/2,H-34);
    ctx.font='30px serif'; ctx.fillText('💣',W/2-60,70); ctx.fillText('🪨',W/2+40,110); ctx.fillText('💥',W/2-20,40);
  }
  ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(W/2-110,H/2-20,220,40);
  ctx.fillStyle='#fff'; ctx.font='bold 14px sans-serif'; ctx.fillText('▶ 실행 버튼을 눌러 시작!',W/2,H/2);
}

function bcBegRun() {
  if (bcBegRunning) return;
  bcBegRunning = true;
  bcBegKeyState = {};
  const runBtn=$('bcBegRunBtn'), stopBtn=$('bcBegStopBtn');
  if (runBtn) runBtn.style.display='none';
  if (stopBtn) stopBtn.style.display='';
  bcBegUpdateScore(0);
  bcBegKeydownH = e => { bcBegKeyState[e.code]=true; if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); };
  bcBegKeyupH = e => { bcBegKeyState[e.code]=false; };
  document.addEventListener('keydown', bcBegKeydownH);
  document.addEventListener('keyup', bcBegKeyupH);
  switch(bcBegTemplate) {
    case 'runner':  bcBegGameRunner(); break;
    case 'catch':   bcBegGameCatch(); break;
    case 'dodge':   bcBegGameDodge(); break;
    case 'fish':    bcBegGameFish(); break;
    case 'balloon': bcBegGameBalloon(); break;
    case 'survive': bcBegGameSurvive(); break;
  }
}

function bcBegStop() {
  bcBegRunning = false;
  if (bcBegRAF) { cancelAnimationFrame(bcBegRAF); bcBegRAF = null; }
  if (bcBegKeydownH) { document.removeEventListener('keydown', bcBegKeydownH); bcBegKeydownH=null; }
  if (bcBegKeyupH) { document.removeEventListener('keyup', bcBegKeyupH); bcBegKeyupH=null; }
  const cv=$('bcBegCanvas');
  if (cv && bcBegClickH) { cv.removeEventListener('click', bcBegClickH); bcBegClickH=null; }
  const runBtn=$('bcBegRunBtn'), stopBtn=$('bcBegStopBtn');
  if (runBtn) runBtn.style.display='';
  if (stopBtn) stopBtn.style.display='none';
}

function bcBegUpdateScore(s) {
  const el=$('bcBegScoreEl'); if(el) el.textContent=`점수: ${s}`;
}

function bcBegGameOver(score) {
  bcBegRunning = false;
  if (bcBegRAF) { cancelAnimationFrame(bcBegRAF); bcBegRAF=null; }
  if (bcBegKeydownH) { document.removeEventListener('keydown', bcBegKeydownH); bcBegKeydownH=null; }
  if (bcBegKeyupH) { document.removeEventListener('keyup', bcBegKeyupH); bcBegKeyupH=null; }
  const cv=$('bcBegCanvas'); if(!cv) return;
  const ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
  ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,H);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#fff'; ctx.font='bold 30px sans-serif'; ctx.fillText('게임 오버!',W/2,H/2-22);
  ctx.font='18px sans-serif'; ctx.fillText(`최종 점수: ${score}`,W/2,H/2+14);
  ctx.font='12px sans-serif'; ctx.fillStyle='rgba(255,255,255,.7)'; ctx.fillText('▶ 실행 버튼으로 재시작',W/2,H/2+44);
  const runBtn=$('bcBegRunBtn'), stopBtn=$('bcBegStopBtn');
  if (runBtn) runBtn.style.display='';
  if (stopBtn) stopBtn.style.display='none';
}

// ─── 달리기 게임 ────────────────────────────────
function bcBegGameRunner() {
  const cv=$('bcBegCanvas'); if(!cv) return;
  const ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
  const sp=bcBegSettings.speed, emoji=bcBegGetEmoji();
  const GROUND=H-44;
  let cy=GROUND, vy=0, onGnd=true;
  let obs=[], frame=0, score=0;
  let ospd=2.5+sp*0.5, ospawn=Math.max(35,110-sp*6);
  const jump=()=>{ if(onGnd){vy=-13;onGnd=false;} };
  bcBegClickH=jump; cv.addEventListener('click',bcBegClickH);
  function loop(){
    if(!bcBegRunning)return;
    frame++;
    if(bcBegKeyState['Space']||bcBegKeyState['ArrowUp']||bcBegKeyState['KeyW']) jump();
    vy+=0.7; cy+=vy;
    if(cy>=GROUND){cy=GROUND;vy=0;onGnd=true;}
    if(frame%ospawn===0) obs.push({x:W,h:18+Math.random()*36});
    obs.forEach(o=>o.x-=ospd);
    obs=obs.filter(o=>o.x>-30);
    for(const o of obs){
      if(o.x<105&&o.x+22>52&&cy>GROUND-o.h-8){bcBegGameOver(score);return;}
    }
    if(frame%300===0) ospd+=0.25;
    score=Math.floor(frame/10); bcBegUpdateScore(score);
    // draw
    ctx.fillStyle=bcBegSettings.bg; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#5d4037'; ctx.fillRect(0,GROUND+30,W,14);
    ctx.fillStyle='#4caf50'; ctx.fillRect(0,GROUND+28,W,4);
    ctx.fillStyle='#e53935';
    obs.forEach(o=>{ ctx.beginPath(); ctx.roundRect(o.x,GROUND+28-o.h,22,o.h,3); ctx.fill(); });
    ctx.font='38px serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(emoji,78,cy+32);
    _bcBegHud(ctx,score,W);
    bcBegRAF=requestAnimationFrame(loop);
  }
  loop();
}

// ─── 별 먹기 ────────────────────────────────────
function bcBegGameCatch() {
  const cv=$('bcBegCanvas'); if(!cv) return;
  const ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
  const sp=bcBegSettings.speed, emoji=bcBegGetEmoji();
  let cx=W/2, stars=[], frame=0, score=0;
  const cspd=3.5+sp*0.45, fspd=1.2+sp*0.28;
  function loop(){
    if(!bcBegRunning)return;
    frame++;
    if(bcBegKeyState['ArrowLeft']||bcBegKeyState['KeyA']) cx=Math.max(20,cx-cspd);
    if(bcBegKeyState['ArrowRight']||bcBegKeyState['KeyD']) cx=Math.min(W-20,cx+cspd);
    if(frame%38===0) stars.push({x:20+Math.random()*(W-40),y:-20,e:['⭐','🌟','✨'][frame%3]});
    stars.forEach(s=>s.y+=fspd);
    stars=stars.filter(s=>{
      if(s.y>H) return false;
      if(Math.abs(s.x-cx)<28&&Math.abs(s.y-(H-36))<28){score++;bcBegUpdateScore(score);return false;}
      return true;
    });
    ctx.fillStyle=bcBegSettings.bg; ctx.fillRect(0,0,W,H);
    // stars bg
    ctx.fillStyle='rgba(255,255,255,0.15)';
    for(let i=0;i<20;i++) ctx.fillRect((i*61+frame*0.3)%W,(i*47)%H,1.5,1.5);
    ctx.font='28px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    stars.forEach(s=>ctx.fillText(s.e,s.x,s.y));
    ctx.font='38px serif'; ctx.fillText(emoji,cx,H-36);
    _bcBegHud(ctx,score,W);
    bcBegRAF=requestAnimationFrame(loop);
  }
  loop();
}

// ─── 운석 피하기 ────────────────────────────────
function bcBegGameDodge() {
  const cv=$('bcBegCanvas'); if(!cv) return;
  const ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
  const sp=bcBegSettings.speed, emoji=bcBegGetEmoji();
  let cx=70, cy=H/2, meteors=[], frame=0, score=0;
  const cspd=3+sp*0.4, mspd=1.8+sp*0.5;
  const msp=Math.max(18,65-sp*4);
  function loop(){
    if(!bcBegRunning)return;
    frame++;
    if(bcBegKeyState['ArrowUp']||bcBegKeyState['KeyW']) cy=Math.max(22,cy-cspd);
    if(bcBegKeyState['ArrowDown']||bcBegKeyState['KeyS']) cy=Math.min(H-22,cy+cspd);
    if(bcBegKeyState['ArrowRight']||bcBegKeyState['KeyD']) cx=Math.min(W/2,cx+cspd);
    if(bcBegKeyState['ArrowLeft']||bcBegKeyState['KeyA']) cx=Math.max(22,cx-cspd);
    if(frame%msp===0) meteors.push({x:W+20,y:20+Math.random()*(H-40),e:['🪨','☄️','💥'][frame%3]});
    meteors.forEach(m=>m.x-=mspd);
    meteors=meteors.filter(m=>m.x>-40);
    for(const m of meteors){if(Math.abs(m.x-cx)<26&&Math.abs(m.y-cy)<26){bcBegGameOver(score);return;}}
    score=Math.floor(frame/10); bcBegUpdateScore(score);
    if(frame%300===0) mspd;
    ctx.fillStyle=bcBegSettings.bg; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,0.18)';
    for(let i=0;i<25;i++) ctx.fillRect((i*79+frame*0.4)%W,(i*53)%H,1.5,1.5);
    ctx.font='28px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    meteors.forEach(m=>ctx.fillText(m.e,m.x,m.y));
    ctx.font='38px serif'; ctx.fillText(emoji,cx,cy);
    _bcBegHud(ctx,score,W);
    bcBegRAF=requestAnimationFrame(loop);
  }
  loop();
}

// ─── 물고기 잡기 ────────────────────────────────
function bcBegGameFish() {
  const cv=$('bcBegCanvas'); if(!cv) return;
  const ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
  const sp=bcBegSettings.speed;
  let fish=[], frame=0, score=0, fid=0;
  const fspd=0.6+sp*0.22;
  const spawnI=Math.max(30,100-sp*7);
  bcBegClickH=(e)=>{
    const r=cv.getBoundingClientRect();
    const mx=(e.clientX-r.left)*(W/r.width), my=(e.clientY-r.top)*(H/r.height);
    fish=fish.filter(f=>{
      if(Math.abs(f.x-mx)<28&&Math.abs(f.y-my)<28){score++;bcBegUpdateScore(score);return false;}
      return true;
    });
  };
  cv.addEventListener('click',bcBegClickH);
  function spawn(){
    const fromL=Math.random()>0.5;
    fish.push({id:fid++,x:fromL?-30:W+30,y:30+Math.random()*(H-60),dx:fromL?fspd:-fspd,e:['🐟','🐠','🐡','🐙','🦑'][fid%5],life:160+Math.random()*80});
  }
  function loop(){
    if(!bcBegRunning)return;
    frame++;
    if(frame%spawnI===0) spawn();
    fish.forEach(f=>{f.x+=f.dx;f.life--;});
    fish=fish.filter(f=>f.life>0&&f.x>-60&&f.x<W+60);
    ctx.fillStyle=bcBegSettings.bg; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,0.1)';
    for(let i=0;i<5;i++) ctx.fillRect(0,30+i*48+Math.sin(frame*0.04+i)*6,W,3);
    ctx.font='34px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    fish.forEach(f=>{
      ctx.save();
      if(f.dx<0){ctx.scale(-1,1);ctx.translate(-W,0);ctx.fillText(f.e,W-f.x,f.y);}
      else ctx.fillText(f.e,f.x,f.y);
      ctx.restore();
    });
    _bcBegHud(ctx,score,W);
    bcBegRAF=requestAnimationFrame(loop);
  }
  loop();
}

// ─── 풍선 터뜨리기 ──────────────────────────────
function bcBegGameBalloon() {
  const cv=$('bcBegCanvas'); if(!cv) return;
  const ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
  const sp=bcBegSettings.speed;
  let balls=[], frame=0, score=0;
  const rspd=0.5+sp*0.22;
  const spawnI=Math.max(30,90-sp*7);
  bcBegClickH=(e)=>{
    const r=cv.getBoundingClientRect();
    const mx=(e.clientX-r.left)*(W/r.width), my=(e.clientY-r.top)*(H/r.height);
    balls=balls.filter(b=>{
      if(Math.abs(b.x-mx)<30&&Math.abs(b.y-my)<34){score++;bcBegUpdateScore(score);return false;}
      return true;
    });
  };
  cv.addEventListener('click',bcBegClickH);
  function loop(){
    if(!bcBegRunning)return;
    frame++;
    if(frame%spawnI===0) balls.push({x:30+Math.random()*(W-60),y:H+30,dx:(Math.random()-0.5)*1.5,e:['🎈','🎃','🎄','🎊','🎆'][frame%5]});
    balls.forEach(b=>{b.y-=rspd;b.x+=b.dx;});
    balls=balls.filter(b=>b.y>-50);
    ctx.fillStyle=bcBegSettings.bg; ctx.fillRect(0,0,W,H);
    ctx.font='38px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    balls.forEach(b=>ctx.fillText(b.e,b.x,b.y));
    _bcBegHud(ctx,score,W);
    bcBegRAF=requestAnimationFrame(loop);
  }
  loop();
}

// ─── 피하기 게임 ────────────────────────────────
function bcBegGameSurvive() {
  const cv=$('bcBegCanvas'); if(!cv) return;
  const ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
  const sp=bcBegSettings.speed, emoji=bcBegGetEmoji();
  let cx=W/2, bombs=[], frame=0, score=0;
  const cspd=4+sp*0.5, bspd=1.8+sp*0.4;
  const spawnI=Math.max(25,70-sp*5);
  function loop(){
    if(!bcBegRunning)return;
    frame++;
    if(bcBegKeyState['ArrowLeft']||bcBegKeyState['KeyA']) cx=Math.max(22,cx-cspd);
    if(bcBegKeyState['ArrowRight']||bcBegKeyState['KeyD']) cx=Math.min(W-22,cx+cspd);
    if(frame%spawnI===0) bombs.push({x:20+Math.random()*(W-40),y:-20,e:['💣','🪨','💥'][frame%3]});
    bombs.forEach(b=>b.y+=bspd);
    for(const b of bombs){if(Math.abs(b.x-cx)<26&&Math.abs(b.y-(H-34))<26){bcBegGameOver(score);return;}}
    bombs=bombs.filter(b=>b.y<H+40);
    score=Math.floor(frame/10); bcBegUpdateScore(score);
    ctx.fillStyle=bcBegSettings.bg; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,0.1)';
    for(let i=0;i<20;i++) ctx.fillRect((i*83+frame*0.3)%W,(i*57)%H,1.5,1.5);
    ctx.font='30px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    bombs.forEach(b=>ctx.fillText(b.e,b.x,b.y));
    ctx.font='38px serif'; ctx.fillText(emoji,cx,H-34);
    _bcBegHud(ctx,score,W);
    bcBegRAF=requestAnimationFrame(loop);
  }
  loop();
}

function _bcBegHud(ctx,score,W) {
  ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(4,4,86,24);
  ctx.fillStyle='#fff'; ctx.font='bold 12px sans-serif';
  ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillText(`점수: ${score}`,10,9);
}

// ---- Background ----

function bcSetBg(color) { bcSetBgColor(color); } // backward-compat alias

function bcSetBgColor(color) {
  bcBgColor = color; bcBgScene = 'color';
  bcCustomBgImg = null;
  const el = $('bcBgColor'); if (el) el.value = color;
  const badge = $('bcCustomBgBadge'), clearBtn = $('bcClearBgImg');
  if (badge) badge.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
  document.querySelectorAll('.bc-scene-item').forEach(el=>el.classList.remove('active'));
  bcDrawPreview(); bcUpdateMiniStage();
}

function bcSetBgScene(sceneId) {
  bcBgScene = sceneId; bcCustomBgImg = null;
  const badge = $('bcCustomBgBadge'), clearBtn = $('bcClearBgImg');
  if (badge) badge.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
  document.querySelectorAll('.bc-scene-item').forEach(el=>el.classList.toggle('active', el.dataset.scene===sceneId));
  bcDrawPreview(); bcUpdateMiniStage();
  bcCloseBgPopup();
}

function bcUploadBg(event) {
  const file = event.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image(); img.src = e.target.result;
    img.onload = () => {
      bcCustomBgImg = img; bcBgScene = 'custom';
      document.querySelectorAll('.bc-scene-item').forEach(el=>el.classList.remove('active'));
      const badge = $('bcCustomBgBadge'), clearBtn = $('bcClearBgImg');
      if (badge) badge.style.display = '';
      if (clearBtn) clearBtn.style.display = '';
      bcDrawPreview(); bcUpdateMiniStage(); bcCloseBgPopup();
    };
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function bcClearCustomBg() {
  bcCustomBgImg = null; bcBgScene = 'color';
  const badge = $('bcCustomBgBadge'), clearBtn = $('bcClearBgImg');
  if (badge) badge.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
  bcDrawPreview(); bcUpdateMiniStage();
}

function bcUploadSprite(event) {
  const file = event.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image(); img.src = e.target.result;
    img.onload = () => {
      bcCustomSpriteImg = img;
      bcSprite.shape = 'custom'; bcSprite.emoji = null;
      const badge = $('bcCustomSpriteBadge'), clearBtn = $('bcClearSpriteImg');
      if (badge) badge.style.display = '';
      if (clearBtn) clearBtn.style.display = '';
      bcDrawPreview(); bcRenderSpriteFloor();
    };
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function bcClearCustomSprite() {
  bcCustomSpriteImg = null;
  bcSprite.shape = 'cat'; bcSprite.emoji = '🐱';
  const badge = $('bcCustomSpriteBadge'), clearBtn = $('bcClearSpriteImg');
  if (badge) badge.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
  bcDrawPreview(); bcRenderSpriteFloor();
}

function bcPanelTab(tab) {
  // Legacy no-op – panels now use popup system
  if (tab === 'bg') bcOpenBgPopup();
}

// 배경 씬 그리드 초기화 (배경 탭 처음 열 때)
const BC_SCENES_DEF = [
  { id:'sky',    label:'하늘' },
  { id:'space',  label:'우주' },
  { id:'ocean',  label:'바다' },
  { id:'sunset', label:'노을' },
  { id:'forest', label:'숲'   },
  { id:'city',   label:'도시' },
  { id:'snow',   label:'설원' },
  { id:'beach',  label:'해변' },
];
let _bcScenesInited = false;
function bcInitSceneGrid() {
  const grid = $('bcSceneGrid'); if (!grid) return;
  if (grid.children.length > 0) return; // already inited
  BC_SCENES_DEF.forEach(({ id, label }) => {
    const item = document.createElement('div');
    item.className = 'bc-scene-item'; item.dataset.scene = id;
    item.onclick = () => bcSetBgScene(id);
    const cv = document.createElement('canvas'); cv.width=80; cv.height=60;
    drawBgScene(cv.getContext('2d'), 80, 60, id);
    const lbl = document.createElement('div'); lbl.className = 'bc-scene-label'; lbl.textContent = label;
    item.appendChild(cv); item.appendChild(lbl);
    grid.appendChild(item);
  });
}

// 배경 씬 드로잉
function drawBgScene(ctx, W, H, scene) {
  switch(scene) {
    case 'sky': {
      const g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#1e90ff'); g.addColorStop(0.55,'#87ceeb'); g.addColorStop(1,'#c5e8f5');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#4caf50'; ctx.fillRect(0,H*.72,W,H*.28);
      ctx.fillStyle='#388e3c'; ctx.fillRect(0,H*.75,W,H*.25);
      ctx.fillStyle='#FFD700'; ctx.beginPath(); ctx.arc(W*.82,H*.18,W*.09,0,Math.PI*2); ctx.fill();
      const cloud=(cx,cy,s)=>{
        ctx.fillStyle='rgba(255,255,255,.9)';
        [[0,0,.5],[-.3,-.15,.35],[.3,-.15,.35],[-.15,.05,.3],[.15,.05,.3]].forEach(([dx,dy,r])=>{
          ctx.beginPath(); ctx.arc(cx+dx*s,cy+dy*s,r*s,0,Math.PI*2); ctx.fill();
        });
      };
      cloud(W*.22,H*.2,W*.09); cloud(W*.6,H*.14,W*.08);
      break;
    }
    case 'space': {
      ctx.fillStyle='#050510'; ctx.fillRect(0,0,W,H);
      const rng=n=>{let x=Math.sin(n)*43758.5;return x-Math.floor(x);};
      for(let i=0;i<60;i++){
        ctx.fillStyle=`rgba(255,255,255,${.3+rng(i*3)*.7})`;
        ctx.beginPath(); ctx.arc(rng(i)*W,rng(i*2)*H,rng(i*4)*1.2+.3,0,Math.PI*2); ctx.fill();
      }
      const ng=ctx.createRadialGradient(W*.3,H*.45,0,W*.3,H*.45,W*.2);
      ng.addColorStop(0,'rgba(90,0,140,.35)'); ng.addColorStop(1,'transparent');
      ctx.fillStyle=ng; ctx.fillRect(0,0,W,H);
      const pg=ctx.createRadialGradient(W*.78,H*.22,0,W*.78,H*.22,W*.12);
      pg.addColorStop(0,'#ff7040'); pg.addColorStop(1,'#aa2000');
      ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(W*.78,H*.22,W*.12,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'ocean': {
      const sg=ctx.createLinearGradient(0,0,0,H*.5);
      sg.addColorStop(0,'#1a6fa0'); sg.addColorStop(1,'#87ceeb');
      ctx.fillStyle=sg; ctx.fillRect(0,0,W,H*.5);
      const wg=ctx.createLinearGradient(0,H*.5,0,H);
      wg.addColorStop(0,'#0077b6'); wg.addColorStop(1,'#03045e');
      ctx.fillStyle=wg; ctx.fillRect(0,H*.5,W,H*.5);
      ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.5;
      for(let i=0;i<5;i++){
        ctx.beginPath();
        const wy=H*.5+i*H/12;
        for(let x=0;x<=W;x+=10) i===0&&x===0?ctx.moveTo(x,wy+Math.sin(x/18+i)*4):ctx.lineTo(x,wy+Math.sin(x/18+i)*4);
        ctx.stroke();
      }
      break;
    }
    case 'sunset': {
      const g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#0f0035'); g.addColorStop(.3,'#7b2d8b');
      g.addColorStop(.5,'#e84393'); g.addColorStop(.7,'#ff6b35');
      g.addColorStop(.85,'#ffa500'); g.addColorStop(1,'#1a1a3e');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      const sg=ctx.createRadialGradient(W/2,H*.62,0,W/2,H*.62,W*.18);
      sg.addColorStop(0,'rgba(255,250,160,.9)'); sg.addColorStop(.5,'rgba(255,200,0,.5)'); sg.addColorStop(1,'transparent');
      ctx.fillStyle=sg; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#08000f'; ctx.beginPath(); ctx.moveTo(0,H);
      for(let x=0;x<=W;x+=W/16) ctx.lineTo(x, H*.68+Math.sin(x/W*6)*H*.05+Math.cos(x/W*10)*H*.03);
      ctx.lineTo(W,H); ctx.fill();
      break;
    }
    case 'forest': {
      const g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#1e5800'); g.addColorStop(.6,'#2d7a00'); g.addColorStop(1,'#1a3a00');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      const tree=(x,h)=>{
        ctx.fillStyle='#3d1c00'; ctx.fillRect(x-W*.012,H-h*.35,W*.024,h*.35);
        ctx.fillStyle='#1a5e00'; ctx.beginPath(); ctx.moveTo(x,H-h*.35-h*.42); ctx.lineTo(x-h*.3,H-h*.35); ctx.lineTo(x+h*.3,H-h*.35); ctx.fill();
        ctx.fillStyle='#2d8000'; ctx.beginPath(); ctx.moveTo(x,H-h*.35-h*.62); ctx.lineTo(x-h*.22,H-h*.35-h*.22); ctx.lineTo(x+h*.22,H-h*.35-h*.22); ctx.fill();
        ctx.fillStyle='#3d9a00'; ctx.beginPath(); ctx.moveTo(x,H-h*.35-h*.78); ctx.lineTo(x-h*.13,H-h*.35-h*.42); ctx.lineTo(x+h*.13,H-h*.35-h*.42); ctx.fill();
      };
      [[.07,80],[.22,100],[.4,90],[.57,105],[.72,95],[.87,88],[.96,75]].forEach(([xr,h])=>tree(W*xr,h));
      ctx.fillStyle='#0d2200'; ctx.fillRect(0,H*.8,W,H*.2);
      ctx.fillStyle='#1a4000'; ctx.fillRect(0,H*.8,W,6);
      break;
    }
    case 'city': {
      const sg=ctx.createLinearGradient(0,0,0,H);
      sg.addColorStop(0,'#0a0a1e'); sg.addColorStop(1,'#1a1a3e');
      ctx.fillStyle=sg; ctx.fillRect(0,0,W,H);
      const r=n=>{let x=Math.sin(n*17.3)*43758;return x-Math.floor(x);};
      for(let i=0;i<35;i++){ctx.fillStyle=`rgba(255,255,255,${.4+r(i)*.6})`;ctx.fillRect(r(i)*W,r(i*2)*H*.5,1.5,1.5);}
      // 문 타워형 빌딩
      const blgData=[[0,H*.48,W*.12],[W*.1,H*.55,W*.1],[W*.19,H*.52,W*.09],[W*.27,H*.6,W*.11],[W*.36,H*.5,W*.12],[W*.46,H*.56,W*.1],[W*.54,H*.47,W*.11],[W*.63,H*.58,W*.1],[W*.71,H*.5,W*.13],[W*.82,H*.54,W*.1],[W*.88,H*.45,W*.12]];
      blgData.forEach(([x,y,w])=>{
        ctx.fillStyle='#1a1a40'; ctx.fillRect(x,y,w,H-y);
        for(let wy=y+8;wy<H-4;wy+=16) for(let wx=x+5;wx<x+w-5;wx+=11){
          if(r(wx*wy*.001)>.35){ctx.fillStyle=`rgba(255,220,80,${.4+r(wx*wy*.002)*.6})`;ctx.fillRect(wx,wy,6,9);}
        }
      });
      ctx.fillStyle='#151520'; ctx.fillRect(0,H-.08*H,W,.08*H);
      break;
    }
    case 'snow': {
      const g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#a0c8e0'); g.addColorStop(1,'#d8eef8');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#eef5ff'; ctx.fillRect(0,H*.68,W,H*.32);
      ctx.fillStyle='#ddeeff'; ctx.fillRect(0,H*.68,W,8);
      for(let i=0;i<25;i++){ctx.fillStyle='rgba(255,255,255,.85)';ctx.beginPath();ctx.arc((i*73+20)%W,(i*53+10)%H,1+i%3,0,Math.PI*2);ctx.fill();}
      // 눈사람
      [[W*.75,H*.85,H*.08],[W*.75,H*.72,H*.055],[W*.75,H*.61,H*.038]].forEach(([x,y,r])=>{
        ctx.fillStyle='#fff'; ctx.strokeStyle='#aac'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
      });
      ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(W*.75,H*.6,3,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'beach': {
      const sg=ctx.createLinearGradient(0,0,0,H*.52);
      sg.addColorStop(0,'#87ceeb'); sg.addColorStop(1,'#c5e8f5');
      ctx.fillStyle=sg; ctx.fillRect(0,0,W,H*.52);
      const wg=ctx.createLinearGradient(0,H*.52,0,H*.74);
      wg.addColorStop(0,'#0077b6'); wg.addColorStop(1,'#48cae4');
      ctx.fillStyle=wg; ctx.fillRect(0,H*.52,W,H*.22);
      const bg=ctx.createLinearGradient(0,H*.74,0,H);
      bg.addColorStop(0,'#f4d03f'); bg.addColorStop(1,'#e8b84b');
      ctx.fillStyle=bg; ctx.fillRect(0,H*.74,W,H*.26);
      ctx.fillStyle='#FFD700'; ctx.beginPath(); ctx.arc(W*.86,H*.13,W*.09,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(0,H*.72);
      for(let x=0;x<W;x+=8) ctx.lineTo(x,H*.72+Math.sin(x/20)*3);
      ctx.stroke();
      break;
    }
    default: ctx.fillStyle='#87ceeb'; ctx.fillRect(0,0,W,H);
  }
}

// 배경 그리기 (컬러/씬/커스텀 통합)
function bcDrawBg(ctx, W, H) {
  if (bcBgScene==='custom' && bcCustomBgImg) {
    ctx.drawImage(bcCustomBgImg, 0, 0, W, H); return;
  }
  if (bcBgScene!=='color') { drawBgScene(ctx, W, H, bcBgScene); return; }
  ctx.fillStyle=bcBgColor; ctx.fillRect(0,0,W,H);
}

// ---- Sprite chars ----

const BC_CHARS = {
  cat:    { shape:'emoji', emoji:'🐱' },
  dog:    { shape:'emoji', emoji:'🐶' },
  duck:   { shape:'emoji', emoji:'🦆' },
  bear:   { shape:'emoji', emoji:'🐻' },
  bunny:  { shape:'emoji', emoji:'🐰' },
  tiger:  { shape:'emoji', emoji:'🐯' },
  fox:    { shape:'emoji', emoji:'🦊' },
  lion:   { shape:'emoji', emoji:'🦁' },
  person: { shape:'emoji', emoji:'🧍' },
  robot:  { shape:'emoji', emoji:'🤖' },
  ninja:  { shape:'emoji', emoji:'🥷' },
  wizard: { shape:'emoji', emoji:'🧙' },
  alien:  { shape:'emoji', emoji:'👾' },
  ghost:  { shape:'emoji', emoji:'👻' },
  rocket: { shape:'emoji', emoji:'🚀' },
  ufo:    { shape:'emoji', emoji:'🛸' },
  star:   { shape:'emoji', emoji:'⭐' },
  bolt:   { shape:'emoji', emoji:'⚡' },
  ball:   { shape:'emoji', emoji:'🔴' },
  bomb:   { shape:'emoji', emoji:'💣' },
  sword:  { shape:'emoji', emoji:'⚔️' },
  shield: { shape:'emoji', emoji:'🛡️' },
  car:    { shape:'emoji', emoji:'🚗' },
  arrow:  { shape:'emoji', emoji:'➤' },
  circle:   { shape:'circle' },
  rect:     { shape:'rect' },
  triangle: { shape:'triangle' },
};

function bcSetChar(charKey) {
  const ch = BC_CHARS[charKey];
  if (!ch) return;
  bcSprite.shape = ch.shape;
  bcSprite.emoji = ch.emoji || null;
  bcDrawPreview();
  bcRenderSpriteFloor();
}

function bcUpdateSprite() {
  bcSprite.color   = $('bcSpriteColor')?.value || '#f5a623';
  const sizeEl = $('bcSpriteSize');
  if (sizeEl) { bcSprite.w = bcSprite.h = Math.max(5, parseInt(sizeEl.value)||50); bcSprite.baseSize = bcSprite.w; }
  bcSprite.label   = $('bcSpriteLabel')?.value || '';
  bcSprite.dir     = parseFloat($('bcSpriteDir')?.value || 90);
  bcSprite.visible = $('bcSpriteVisible')?.checked !== false;
  bcDrawPreview();
  bcRenderSpriteFloor();
}

window.bcMoveSprite = function() {
  bcSprite.x = parseInt($('bcSpritePropX')?.value || 240);
  bcSprite.y = parseInt($('bcSpritePropY')?.value || 180);
  bcDrawPreview();
};

window.selectSprite = function() {};

// ---- Drawing ----

function bcDrawCat(ctx, size) {
  const s = size / 50;
  ctx.save();
  // Tail
  ctx.strokeStyle = '#e08c20'; ctx.lineWidth = 5*s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(12*s, 12*s);
  ctx.bezierCurveTo(34*s, 22*s, 40*s, -4*s, 26*s, -20*s); ctx.stroke();
  // Legs
  ctx.fillStyle = '#f5a623';
  ctx.beginPath(); ctx.ellipse(-9*s, 30*s, 7*s, 11*s, 0.3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(9*s, 30*s, 7*s, 11*s, -0.3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ffd896';
  ctx.beginPath(); ctx.ellipse(-10*s, 40*s, 7*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10*s, 40*s, 7*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
  // Body
  ctx.fillStyle = '#f5a623';
  ctx.beginPath(); ctx.ellipse(0, 13*s, 16*s, 20*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fde9c3';
  ctx.beginPath(); ctx.ellipse(0, 15*s, 9*s, 13*s, 0, 0, Math.PI*2); ctx.fill();
  // Arms
  ctx.fillStyle = '#f5a623';
  ctx.beginPath(); ctx.ellipse(-19*s, 8*s, 7*s, 5*s, 0.9, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(19*s, 8*s, 7*s, 5*s, -0.9, 0, Math.PI*2); ctx.fill();
  // Head
  ctx.fillStyle = '#f5a623';
  ctx.beginPath(); ctx.ellipse(0, -13*s, 19*s, 17*s, 0, 0, Math.PI*2); ctx.fill();
  // Ears (outer)
  ctx.fillStyle = '#f5a623';
  ctx.beginPath(); ctx.moveTo(-16*s,-22*s); ctx.lineTo(-26*s,-40*s); ctx.lineTo(-5*s,-28*s); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(16*s,-22*s); ctx.lineTo(26*s,-40*s); ctx.lineTo(5*s,-28*s); ctx.closePath(); ctx.fill();
  // Ears (inner)
  ctx.fillStyle = '#ffb3bb';
  ctx.beginPath(); ctx.moveTo(-14*s,-24*s); ctx.lineTo(-21*s,-36*s); ctx.lineTo(-7*s,-28*s); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(14*s,-24*s); ctx.lineTo(21*s,-36*s); ctx.lineTo(7*s,-28*s); ctx.closePath(); ctx.fill();
  // Eyes (white)
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(-7*s,-16*s, 5.5*s,6.5*s, 0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(7*s,-16*s, 5.5*s,6.5*s, 0,0,Math.PI*2); ctx.fill();
  // Pupils
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(-7*s,-15*s, 3*s, 0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(7*s,-15*s, 3*s, 0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-5.5*s,-17*s, 1.2*s, 0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(8.5*s,-17*s, 1.2*s, 0,Math.PI*2); ctx.fill();
  // Nose
  ctx.fillStyle = '#ff99aa';
  ctx.beginPath(); ctx.moveTo(0,-9*s); ctx.lineTo(-2.5*s,-13*s); ctx.lineTo(2.5*s,-13*s); ctx.closePath(); ctx.fill();
  // Mouth
  ctx.strokeStyle = '#c07830'; ctx.lineWidth = 1.4*s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0,-9*s); ctx.quadraticCurveTo(-4*s,-5*s,-8*s,-7*s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-9*s); ctx.quadraticCurveTo(4*s,-5*s,8*s,-7*s); ctx.stroke();
  // Whiskers
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.9*s;
  [[-18,-11,-3,-10],[-18,-8,-3,-8],[-18,-5,-3,-6],[18,-11,3,-10],[18,-8,3,-8],[18,-5,3,-6]].forEach(([x1,y1,x2,y2]) => {
    ctx.beginPath(); ctx.moveTo(x1*s,y1*s); ctx.lineTo(x2*s,y2*s); ctx.stroke();
  });
  ctx.restore();
}

function bcDrawSprite(ctx, sp) {
  if (!sp.visible) return;
  const {x,y,w,h,shape,color,label,emoji,dir} = sp;
  ctx.save();
  ctx.translate(x, y);
  const angle = dir !== undefined ? (dir - 90) * Math.PI / 180 : 0;
  ctx.rotate(angle);
  if (shape==='custom' && bcCustomSpriteImg) {
    ctx.drawImage(bcCustomSpriteImg, -w/2, -h/2, w, h);
  } else if (shape==='cat' || emoji==='🐱') {
    bcDrawCat(ctx, w);
  } else if (shape==='emoji' && emoji) {
    ctx.font = `${w}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(emoji, 0, 0);
  } else {
    ctx.fillStyle = color;
    if (shape==='circle') { ctx.beginPath(); ctx.arc(0,0,w/2,0,Math.PI*2); ctx.fill(); }
    else if (shape==='triangle') { ctx.beginPath(); ctx.moveTo(0,-h/2); ctx.lineTo(w/2,h/2); ctx.lineTo(-w/2,h/2); ctx.closePath(); ctx.fill(); }
    else { ctx.fillRect(-w/2,-h/2,w,h); }
  }
  ctx.restore();
  if (label) {
    ctx.fillStyle='#222'; ctx.font='bold 11px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillText(label, x, y+w/2+12);
  }
}

function bcDrawPreview() {
  const canvas=$('bcCanvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  bcDrawBg(ctx, W, H);
  bcDrawSprite(ctx, bcSprite);
  // Speech bubble
  if (bcSprite.say) {
    const sp=bcSprite;
    const bx=sp.x+sp.w/2+5, by=sp.y-sp.w/2-10;
    const text=sp.say.text||'';
    ctx.font='bold 13px sans-serif';
    const tw=ctx.measureText(text).width;
    const bw=tw+16, bh=28;
    const rx=Math.min(bx, W-bw-4), ry=Math.max(4, by-bh);
    ctx.fillStyle='white'; ctx.strokeStyle='#333'; ctx.lineWidth=1.5;
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(rx, ry, bw, bh, 8); } else {
      ctx.rect(rx, ry, bw, bh);
    }
    ctx.fill(); ctx.stroke();
    if (sp.say.style==='think') {
      [0,1,2].forEach(i => {
        ctx.beginPath(); ctx.arc(sp.x+sp.w/2+4+i*6, sp.y-sp.w/2-4-i*3, 2+i, 0, Math.PI*2);
        ctx.fillStyle='white'; ctx.fill(); ctx.stroke();
      });
    } else {
      ctx.beginPath();
      ctx.moveTo(sp.x+sp.w/2, sp.y-sp.w/2-2);
      ctx.lineTo(rx+12, ry+bh);
      ctx.lineTo(rx+20, ry+bh);
      ctx.fillStyle='white'; ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle='#333'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(text, rx+8, ry+bh/2);
    ctx.textAlign='center'; ctx.textBaseline='middle';
  }
  // Shown variables
  let varY=14;
  bcShownVars.forEach(name=>{
    ctx.fillStyle='rgba(0,0,0,.65)'; ctx.fillRect(4,varY-11,110,16);
    ctx.fillStyle='#fff'; ctx.font='11px sans-serif'; ctx.textAlign='left';
    ctx.fillText(`${name}: ${bcVars[name]??0}`, 8, varY); varY+=19;
  });
}

// ---- Runtime ----

function bcRun() {
  if (bcRuntime) bcStop();
  bcCompileScript(); // compile workspace → bcScript
  bcVars={}; bcShownVars=new Set(); _bcBroadcastBus={};
  const sp=bcSprite;
  sp.x=240; sp.y=180; sp.velX=0; sp.velY=0; sp.visible=true; sp.say=null;
  sp.dir=parseFloat($('bcSpriteDir')?.value||90);
  const canvas=$('bcCanvas'), W=canvas?canvas.width:480, H=canvas?canvas.height:360;
  const keyState={}, mouseState={down:false};
  const onKD=e=>{keyState[e.key]=true;};
  const onKU=e=>{keyState[e.key]=false;};
  const onMD=()=>{mouseState.down=true;};
  const onMU=()=>{mouseState.down=false;};
  document.addEventListener('keydown',onKD); document.addEventListener('keyup',onKU);
  document.addEventListener('mousedown',onMD); document.addEventListener('mouseup',onMU);
  let running=true;

  // Canvas click for event_click
  let _canvasClickCb = null;
  if (canvas) {
    _canvasClickCb = () => {
      const clickBlocks=bcScript.filter(b=>b.type==='event_click');
      clickBlocks.forEach(b=>exec(b.children||[]));
    };
    canvas.addEventListener('click', _canvasClickCb);
  }

  function evalCond(cond){
    const m={right_key:'ArrowRight',left_key:'ArrowLeft',up_key:'ArrowUp',down_key:'ArrowDown',space_key:' ',a_key:'a',s_key:'s',d_key:'d',w_key:'w'};
    if(cond==='edge'||cond==='sensing_touchedge'){return sp.x<=sp.w/2||sp.x>=W-sp.w/2||sp.y<=sp.h/2||sp.y>=H-sp.h/2;}
    if(cond==='mouse_down'){return mouseState.down;}
    return !!(keyState[m[cond]]||keyState[KEY_MAP[cond]]||keyState[cond]);
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function playNote(note, duration) {
    try {
      const ac=new AudioContext();
      const gain=ac.createGain(); gain.gain.value=_bcVolume;
      const o=ac.createOscillator();
      const freq=440*Math.pow(2,(note-69)/12);
      o.frequency.value=freq; o.type='sine';
      o.connect(gain); gain.connect(ac.destination);
      o.start(); o.stop(ac.currentTime+duration);
    } catch(e){}
  }

  async function exec(blocks){
    for(const b of blocks){
      if(!running) return;
      const p=b.params;
      switch(b.type){
        // Motion
        case 'motion_move': { const rad=(sp.dir-90)*Math.PI/180; sp.x+=Math.cos(rad)*(parseFloat(p.n)||0); sp.y+=Math.sin(rad)*(parseFloat(p.n)||0); break; }
        case 'motion_turnr': sp.dir=(sp.dir+(parseFloat(p.n)||0))%360; break;
        case 'motion_turnl': sp.dir=(sp.dir-(parseFloat(p.n)||0)+360)%360; break;
        case 'motion_goto': sp.x=parseFloat(p.x)||0; sp.y=parseFloat(p.y)||0; break;
        case 'motion_glide': {
          const dur=(parseFloat(p.t)||1)*1000, tx=parseFloat(p.x)||0, ty=parseFloat(p.y)||0;
          const sx=sp.x, sy=sp.y, t0=Date.now();
          while(running){ const prog=Math.min(1,(Date.now()-t0)/dur); sp.x=sx+(tx-sx)*prog; sp.y=sy+(ty-sy)*prog; if(prog>=1)break; await sleep(16); }
          break;
        }
        case 'motion_x': sp.x=Math.max(sp.w/2,Math.min(W-sp.w/2,sp.x+(parseFloat(p.n)||0))); break;
        case 'motion_y': sp.y=Math.max(sp.h/2,Math.min(H-sp.h/2,sp.y+(parseFloat(p.n)||0))); break;
        case 'motion_setx': sp.x=parseFloat(p.x)||0; break;
        case 'motion_sety': sp.y=parseFloat(p.y)||0; break;
        case 'motion_dir': sp.dir=parseFloat(p.deg)||90; break;
        case 'motion_bounce':
          if(sp.x-sp.w/2<=0||sp.x+sp.w/2>=W)sp.velX=-sp.velX;
          if(sp.y-sp.h/2<=0||sp.y+sp.h/2>=H)sp.velY=-sp.velY; break;
        case 'motion_velx': sp.velX=parseFloat(p.vx)||0; break;
        case 'motion_vely': sp.velY=parseFloat(p.vy)||0; break;
        case 'motion_applyvel':
          sp.x=Math.max(sp.w/2,Math.min(W-sp.w/2,sp.x+sp.velX));
          sp.y=Math.max(sp.h/2,Math.min(H-sp.h/2,sp.y+sp.velY)); break;
        // Looks
        case 'looks_say': sp.say={text:p.text||'',style:'say'}; await sleep((parseFloat(p.t)||2)*1000); sp.say=null; break;
        case 'looks_sayperm': sp.say={text:p.text||'',style:'say'}; break;
        case 'looks_think': sp.say={text:p.text||'',style:'think'}; await sleep((parseFloat(p.t)||2)*1000); sp.say=null; break;
        case 'looks_stopsay': sp.say=null; break;
        case 'looks_size': sp.w=sp.h=Math.max(5,(sp.baseSize||40)*(parseFloat(p.size)||100)/100); break;
        case 'looks_changesize': sp.w=sp.h=Math.max(5,sp.w+(sp.baseSize||40)*(parseFloat(p.n)||0)/100); break;
        case 'looks_color': sp.color=p.color; break;
        case 'looks_show': sp.visible=true; break;
        case 'looks_hide': sp.visible=false; break;
        case 'looks_label': sp.label=p.text||''; break;
        // Sound
        case 'sound_beep': try{const ac=new AudioContext();const o=ac.createOscillator();o.connect(ac.destination);o.start();o.stop(ac.currentTime+.1);}catch(e){} break;
        case 'sound_note': { const note=parseInt(p.note)||60; const dur=(parseFloat(p.t)||0.5)*0.5; playNote(note,dur); await sleep(dur*1000); break; }
        case 'sound_drum': try{const ac=new AudioContext();const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=80;const g=ac.createGain();g.gain.setValueAtTime(1,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.2);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+0.2);}catch(e){} break;
        case 'sound_vol': _bcVolume=Math.max(0,Math.min(1,(parseFloat(p.vol)||100)/100)); break;
        // Events
        case 'event_start': await exec(b.children||[]); break;
        case 'event_broadcast': {
          const msg=p.msg||'메시지1';
          (_bcBroadcastBus[msg]||[]).forEach(fn=>fn());
          break;
        }
        case 'event_receive': await exec(b.children||[]); break;
        // Control
        case 'control_wait': await sleep((parseFloat(p.n)||1)*1000); break;
        case 'control_repeat': for(let i=0;i<(parseInt(p.n)||10)&&running;i++){await exec(b.children||[]);await sleep(16);} break;
        case 'control_forever': while(running){await exec(b.children||[]);await sleep(16);} break;
        case 'control_if': if(evalCond(p.cond))await exec(b.children||[]); break;
        case 'control_ifelse':
          if(evalCond(p.cond)) await exec(b.children||[]);
          else await exec(b.elseChildren||[]);
          break;
        case 'control_stop': running=false; return;
        // Sensing
        case 'sensing_keypressed':
        case 'sense_key': { const k=KEY_MAP[p.key||'오른쪽']||p.key; if(!keyState[k]) return; break; }
        case 'sensing_mousedown': if(!mouseState.down) return; break;
        case 'sensing_touchedge':
        case 'sense_edge': if(!(sp.x<=sp.w/2||sp.x>=W-sp.w/2||sp.y<=sp.h/2||sp.y>=H-sp.h/2)) return; break;
        // Operators (show result as say bubble briefly)
        case 'op_add': { const r=(parseFloat(p.a)||0)+(parseFloat(p.b)||0); bcVars._result=r; sp.say={text:String(r),style:'say'}; await sleep(1000); sp.say=null; break; }
        case 'op_sub': { const r=(parseFloat(p.a)||0)-(parseFloat(p.b)||0); bcVars._result=r; sp.say={text:String(r),style:'say'}; await sleep(1000); sp.say=null; break; }
        case 'op_mul': { const r=(parseFloat(p.a)||0)*(parseFloat(p.b)||0); bcVars._result=r; sp.say={text:String(r),style:'say'}; await sleep(1000); sp.say=null; break; }
        case 'op_div': { const b2=parseFloat(p.b)||1; const r=(parseFloat(p.a)||0)/b2; bcVars._result=r; sp.say={text:String(Math.round(r*1000)/1000),style:'say'}; await sleep(1000); sp.say=null; break; }
        case 'op_random': { const a=parseFloat(p.a)||1, bv=parseFloat(p.b)||10; const r=Math.floor(Math.random()*(bv-a+1))+a; bcVars._result=r; sp.say={text:String(r),style:'say'}; await sleep(1000); sp.say=null; break; }
        case 'op_lt': { const r=(parseFloat(p.a)||0)<(parseFloat(p.b)||0); bcVars._result=r; sp.say={text:r?'참':'거짓',style:'say'}; await sleep(1000); sp.say=null; break; }
        case 'op_gt': { const r=(parseFloat(p.a)||0)>(parseFloat(p.b)||0); bcVars._result=r; sp.say={text:r?'참':'거짓',style:'say'}; await sleep(1000); sp.say=null; break; }
        case 'op_eq': { const r=String(p.a||'')===String(p.b||''); bcVars._result=r; sp.say={text:r?'참':'거짓',style:'say'}; await sleep(1000); sp.say=null; break; }
        case 'op_join': { const r=String(p.a||'')+String(p.b||''); bcVars._result=r; sp.say={text:r,style:'say'}; await sleep(1000); sp.say=null; break; }
        // Variables
        case 'var_set': bcVars[p.name||'변수']=parseFloat(p.val)||0; break;
        case 'var_change': bcVars[p.name||'변수']=(bcVars[p.name||'변수']||0)+(parseFloat(p.n)||0); break;
        case 'var_show': bcShownVars.add(p.name||'변수'); break;
        case 'var_hide': bcShownVars.delete(p.name||'변수'); break;
      }
    }
  }

  // Register broadcast receivers
  bcScript.filter(b=>b.type==='event_receive').forEach(b=>{
    const msg=b.params.msg||'메시지1';
    if(!_bcBroadcastBus[msg]) _bcBroadcastBus[msg]=[];
    _bcBroadcastBus[msg].push(()=>exec(b.children||[]));
  });

  let rafId;
  function loop(){if(!running)return;bcDrawPreview();rafId=requestAnimationFrame(loop);}
  loop();
  bcScript.filter(b=>b.type==='event_start').forEach(b=>exec(b.children||[]));
  const kbBlocks=bcScript.filter(b=>b.type==='event_keydown');
  const kbTrigger=e=>kbBlocks.forEach(b=>{const k=KEY_MAP[b.params.key||'오른쪽']||b.params.key;if(e.key===k)exec(b.children||[]);});
  document.addEventListener('keydown',kbTrigger);

  bcRuntime={stop:()=>{
    running=false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown',onKD);
    document.removeEventListener('keyup',onKU);
    document.removeEventListener('mousedown',onMD);
    document.removeEventListener('mouseup',onMU);
    document.removeEventListener('keydown',kbTrigger);
    if(canvas&&_canvasClickCb) canvas.removeEventListener('click',_canvasClickCb);
  }};
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
  bcCompileScript();
  if(bcScript.length===0){showToast('블록을 추가해주세요!','error');return;}
  bcStop();
  const program={script:bcScript,sprite:bcSprite,bgColor:bcBgColor,bgScene:bcBgScene};
  try{
    const res=await fetch('/api/block-games',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:USER.id,nickname:USER.nickname,title,program})});
    const data=await res.json();
    if(data.success){showToast('제출 완료! 관리자 승인을 기다리세요','success');$('bcGameTitle').value='';}
    else showToast(data.error||'제출 실패','error');
  }catch(e){showToast('제출 중 오류 발생','error');}
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
  const script=prog.script||[],bgColor=prog.bgColor||'#87ceeb',bgScene=prog.bgScene||'color';
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
    if(bgScene!=='color'){drawBgScene(ctx,W,H,bgScene);}else{ctx.fillStyle=bgColor;ctx.fillRect(0,0,W,H);}
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

// =============================================
// 전역 함수 노출 (onclick에서 확실하게 사용 가능하도록)
// =============================================
window.openGame       = openGame;
window.closeGame      = closeGame;
window.startGame      = startGame;
window.restartGame    = restartGame;
window.setDifficulty  = setDifficulty;
window.showMultiLobby = showMultiLobby;
window.refreshGameRooms = refreshGameRooms;
window.createMultiGame  = createMultiGame;
window.joinGameRoom     = joinGameRoom;
window.leaveGameRoom    = leaveGameRoom;
window.switchView       = switchView;
window.openBlockCoder   = openBlockCoder;
window.closeBlockCoder  = closeBlockCoder;
window.bcSwitchMode     = bcSwitchMode;
window.bcToggleStage    = bcToggleStage;
window.bcRun            = bcRun;
window.bcStop           = bcStop;
window.bcSubmit         = bcSubmit;
window.bcUpdateSprite   = bcUpdateSprite;
window.bcSetChar        = bcSetChar;
window.scShowCat        = scShowCat;
window.bcBegSelectTpl   = bcBegSelectTpl;
window.bcBegSetChar     = bcBegSetChar;
window.bcBegSetSpeed    = bcBegSetSpeed;
window.bcBegSetBg       = bcBegSetBg;
window.bcBegRun         = bcBegRun;
window.bcBegStop        = bcBegStop;
window.bcBegCanvasClick = bcBegCanvasClick;
window.bcSetBgColor     = bcSetBgColor;
window.bcSetBgScene     = bcSetBgScene;
window.bcUploadBg       = bcUploadBg;
window.bcClearCustomBg  = bcClearCustomBg;
window.bcUploadSprite   = bcUploadSprite;
window.bcClearCustomSprite = bcClearCustomSprite;
window.bcPanelTab       = bcPanelTab;
window.bcOpenAddSprite  = bcOpenAddSprite;
window.bcCloseAddSprite = bcCloseAddSprite;
window.bcSelectSprite   = bcSelectSprite;
window.bcOpenBgPopup    = bcOpenBgPopup;
window.bcCloseBgPopup   = bcCloseBgPopup;
window.bcOpenSpriteSettings = bcOpenSpriteSettings;
window.bcClearWorkspace = bcClearWorkspace;
window.loadUserGames    = loadUserGames;
window.openUserGame     = openUserGame;
window.closeUserGame    = closeUserGame;
window.snakeSetDir      = (dx,dy) => window._snakeDir && window._snakeDir(dx,dy);
// 인증 함수
window.switchAuthTab  = switchAuthTab;
window.doLogin        = doLogin;
window.doRegister     = doRegister;
window.doLogout       = doLogout;
// AI 코딩
window.aiSend         = aiSend;
window.aiSetPrompt    = aiSetPrompt;
window.aiSwitchTab    = aiSwitchTab;
window.aiCopyCode     = aiCopyCode;
window.aiDownload     = aiDownload;
window.aiUpdatePreview = aiUpdatePreview;
console.log('%c게임/인증/AI 함수 등록 완료 ✅', 'color:#22c55e;font-size:12px');

// =============================================
// AI 코딩 어시스턴트
// =============================================
let aiHistory = [];       // [{ role, content }]
let aiCurrentCode = '';
let aiCurrentTab = 'preview';

function aiSetPrompt(text) {
  const inp = $('aiPromptInput');
  if (inp) { inp.value = text; inp.focus(); }
}

function aiSwitchTab(tab) {
  aiCurrentTab = tab;
  const isPreview = tab === 'preview';
  $('aiTabPreview').classList.toggle('active', isPreview);
  $('aiTabCode').classList.toggle('active', !isPreview);
  $('aiPreviewFrame').classList.toggle('hidden', !isPreview);
  $('aiCodeArea').classList.toggle('hidden', isPreview);
  if (!isPreview && $('aiCodeEditor') && aiCurrentCode) {
    $('aiCodeEditor').value = aiCurrentCode;
  }
}

function aiUpdatePreview() {
  const code = $('aiCodeEditor')?.value || '';
  aiCurrentCode = code;
  aiShowPreview(code);
}

function aiShowPreview(code) {
  if (!code) return;
  $('aiEmptyState').classList.add('hidden');
  $('aiPreviewFrame').classList.remove('hidden');

  const frame = $('aiPreviewFrame');
  const blob = new Blob([code], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  frame.src = url;
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  if ($('aiCodeEditor')) $('aiCodeEditor').value = code;
}

function aiAppendMsg(role, content) {
  const container = $('aiMessages');
  if (!container) return;

  const welcome = container.querySelector('.ai-welcome');
  if (welcome) welcome.remove();

  const wrap = document.createElement('div');
  wrap.className = role === 'user' ? 'ai-msg ai-msg-user' : 'ai-msg ai-msg-ai';

  const bubble = document.createElement('div');
  bubble.className = role === 'user' ? 'ai-bubble-user' : 'ai-bubble-ai';
  bubble.textContent = content;

  const time = document.createElement('div');
  time.className = 'ai-msg-time';
  time.textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  wrap.appendChild(bubble);
  wrap.appendChild(time);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return wrap;
}

function aiShowLoading() {
  const container = $('aiMessages');
  if (!container) return null;

  const wrap = document.createElement('div');
  wrap.className = 'ai-msg ai-msg-ai';
  wrap.innerHTML = `
    <div class="ai-bubble-loading">
      <div class="ai-dots"><span></span><span></span><span></span></div>
      코드 생성 중...
    </div>`;
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return wrap;
}

async function aiSend() {
  const inp = $('aiPromptInput');
  const prompt = inp?.value.trim();
  if (!prompt) return;

  const btn = $('aiSendBtn');
  btn.disabled = true;
  inp.value = '';

  aiAppendMsg('user', prompt);
  aiHistory.push({ role: 'user', content: prompt });

  const loadingEl = aiShowLoading();

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ messages: aiHistory }),
    });
    const data = await res.json();

    if (loadingEl) loadingEl.remove();

    if (data.error) {
      aiAppendMsg('ai', '❌ ' + data.error);
      aiHistory.push({ role: 'assistant', content: data.error });
      return;
    }

    const reply = (data.explanation || '코드를 생성했어요! 오른쪽에서 확인하세요 ✨');
    aiAppendMsg('ai', reply);
    aiHistory.push({ role: 'assistant', content: reply + '\n\n```html\n' + data.code + '\n```' });

    if (data.code) {
      aiCurrentCode = data.code;
      aiShowPreview(data.code);
      if (aiCurrentTab === 'code') $('aiCodeEditor').value = data.code;
    }
  } catch(e) {
    if (loadingEl) loadingEl.remove();
    aiAppendMsg('ai', '❌ 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  } finally {
    btn.disabled = false;
    inp.focus();
  }
}

function aiCopyCode() {
  if (!aiCurrentCode) { showToast('생성된 코드가 없습니다', 'error'); return; }
  navigator.clipboard.writeText(aiCurrentCode).then(() => showToast('코드가 복사됐습니다!', 'success'));
}

function aiDownload() {
  if (!aiCurrentCode) { showToast('생성된 코드가 없습니다', 'error'); return; }
  const a = document.createElement('a');
  const blob = new Blob([aiCurrentCode], { type: 'text/html' });
  a.href = URL.createObjectURL(blob);
  a.download = 'ai-code.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  showToast('HTML 파일 저장됨!', 'success');
}
