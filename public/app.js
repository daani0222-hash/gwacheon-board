/**
 * app.js - 클라이언트 사이드 메인 스크립트
 * Socket.io + Vanilla JS 기반 소셜 커뮤니티
 */

// =============================================
// 사용자 세션 관리
// =============================================
const USER = {
  id:       localStorage.getItem('userId')    || generateId(),
  nickname: localStorage.getItem('nickname')  || '',
  color:    localStorage.getItem('color')     || randomColor(),
};

// userId가 없으면 새로 생성하여 저장
if (!localStorage.getItem('userId')) localStorage.setItem('userId', USER.id);

function generateId() {
  return 'u_' + Math.random().toString(36).slice(2, 11);
}

function randomColor() {
  const colors = ['#667eea','#f093fb','#4facfe','#43e97b','#fa709a','#f6d365','#a18cd1','#fd7043'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// =============================================
// Socket.io 연결
// =============================================
const socket = io({ transports: ['websocket', 'polling'] });

// =============================================
// 앱 상태
// =============================================
const state = {
  currentView:    'home',
  currentChannel: 'global',  // global | dm | group
  activeDMSocket: null,       // 현재 열린 DM 상대방 socketId
  activeGroupId:  null,       // 현재 열린 그룹 방 ID
  onlineUsers:    [],
  groupRooms:     [],
  pendingFiles:   [],         // 게시글 첨부 대기 파일
  chatFile:       null,       // 채팅 첨부 파일
  postPage:       1,
  hasMorePosts:   true,
  isLoadingPosts: false,
  searchQuery:    '',
  unreadDM:       {},         // { socketId: count }
  unreadGroup:    {},         // { roomId: count }
  typingTimers:   {},
  likedPosts:     JSON.parse(localStorage.getItem('likedPosts') || '{}'),
  myPendingRoom:  null,
};

// =============================================
// DOM 요소 참조
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
  toastContainer:  $('toastContainer'),
};

// =============================================
// 이모지 목록
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

  // 게시글 작성
  dom.postContent.addEventListener('input', () => {
    const len = dom.postContent.value.length;
    dom.charCount.textContent = len;
    dom.charCount.style.color = len > 1800 ? 'var(--danger)' : '';
  });

  dom.fileInput.addEventListener('change', handleFileSelect);
  dom.chatFileInput.addEventListener('change', handleChatFileSelect);

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

  // 타이핑 감지 (채팅)
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
}

// =============================================
// 닉네임 설정
// =============================================
function handleSetNickname() {
  const nickname = dom.nicknameInput.value.trim();
  if (nickname.length < 2 || nickname.length > 20) {
    showToast('닉네임은 2~20자 이내여야 합니다.', 'error');
    dom.nicknameInput.focus();
    return;
  }
  USER.nickname = nickname;
  localStorage.setItem('nickname', nickname);
  startApp();
  showToast(`환영합니다, ${nickname}님! 🎉`, 'success');
}

// =============================================
// Socket.io 연결 및 이벤트
// =============================================
function connectSocket() {
  socket.emit('userJoin', {
    nickname: USER.nickname,
    userId: USER.id,
    color: USER.color,
  });

  // 온라인 사용자 목록
  socket.on('onlineUsers', (users) => {
    state.onlineUsers = users;
    renderOnlineUsers();
  });

  // 시스템 메시지
  socket.on('systemMessage', (msg) => {
    appendSystemMessage(msg.message);
  });

  // 새 게시글
  socket.on('newPost', (post) => {
    if (state.currentView === 'home' && !state.searchQuery) {
      prependPost(post);
    }
  });

  // 게시글 삭제
  socket.on('deletePost', (postId) => {
    const el = document.querySelector(`[data-post-id="${postId}"]`);
    if (el) {
      el.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }
  });

  // 새 댓글
  socket.on('newComment', (comment) => {
    const section = document.querySelector(`[data-comments-id="${comment.postId}"]`);
    if (section) {
      appendComment(section.querySelector('.comments-list'), comment);
      const countEl = document.querySelector(`[data-post-id="${comment.postId}"] .comment-count`);
      if (countEl) countEl.textContent = parseInt(countEl.textContent || 0) + 1;
    }
  });

  // 좋아요 업데이트
  socket.on('likeUpdate', ({ postId, likeCount, userId, liked }) => {
    updateLikeUI(postId, likeCount, userId, liked);
  });

  // 전체 채팅 히스토리
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

  // 전체 채팅 메시지
  socket.on('globalMessage', (msg) => {
    if (state.currentChannel !== 'global' || state.activeDMSocket || state.activeGroupId) {
      // 다른 채팅 중이면 배지 증가
      incrementChatBadge();
    } else {
      appendMessage(msg, 'global');
      scrollToBottom();
    }
    if (state.currentChannel === 'global') appendMessage(msg, 'global');
  });

  // DM 메시지
  socket.on('directMessage', (msg) => {
    const isActiveDM = state.activeDMSocket === msg.fromSocketId ||
                       state.activeDMSocket === msg.toSocketId;

    if (isActiveDM) {
      appendMessage(msg, 'dm');
      scrollToBottom();
    } else {
      // 다른 쪽에서 온 DM → 읽지 않음 증가
      const otherId = msg.fromSocketId === socket.id ? msg.toSocketId : msg.fromSocketId;
      state.unreadDM[otherId] = (state.unreadDM[otherId] || 0) + 1;
      updateDMList();
      incrementChatBadge();
      showToast(`💬 ${msg.fromNickname}: ${msg.content.slice(0,30)}`, 'info');
    }
  });

  // DM 히스토리
  socket.on('dmHistory', ({ otherSocketId, messages }) => {
    if (state.activeDMSocket !== otherSocketId) return;
    dom.messageArea.innerHTML = '';
    messages.forEach(msg => appendMessage(msg, 'dm'));
    scrollToBottom();
  });

  // 그룹 방 목록
  socket.on('groupRooms', (rooms) => {
    state.groupRooms = rooms;
    renderGroupRooms();
  });

  // 새 그룹 방 생성
  socket.on('groupRoomCreated', (room) => {
    state.groupRooms.push(room);
    renderGroupRooms();
    showToast(`"${room.name}" 채팅방이 만들어졌습니다!`, 'success');
  });

  // 그룹 히스토리
  socket.on('groupRoomHistory', ({ roomId, messages }) => {
    if (state.activeGroupId !== roomId) return;
    dom.messageArea.innerHTML = '';
    messages.forEach(msg => appendMessage(msg, 'group'));
    scrollToBottom();
  });

  // 그룹 메시지
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

  // 타이핑
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

  socket.on('userStopTyping', ({ socketId }) => {
    dom.typingIndicator.classList.add('hidden');
  });

  socket.on('connect_error', () => {
    showToast('서버 연결에 실패했습니다. 재연결 중...', 'warning');
  });

  socket.on('reconnect', () => {
    showToast('서버에 재연결되었습니다!', 'success');
    socket.emit('userJoin', { nickname: USER.nickname, userId: USER.id, color: USER.color });
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

    if (!append) dom.postFeed.innerHTML = '';

    if (data.posts.length === 0 && !append) {
      dom.postFeed.innerHTML = `
        <div class="empty-feed">
          <div class="empty-feed-icon"><i class="fa-solid fa-wind"></i></div>
          <h3>${state.searchQuery ? '검색 결과가 없습니다' : '아직 게시글이 없습니다'}</h3>
          <p>${state.searchQuery ? '다른 키워드로 검색해보세요' : '첫 번째 게시글을 작성해보세요!'}</p>
        </div>`;
    } else {
      data.posts.forEach(post => {
        dom.postFeed.appendChild(createPostElement(post));
      });
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
// 게시글 요소 생성
// =============================================
function createPostElement(post) {
  const isOwner = post.authorId === USER.id;
  const isLiked = state.likedPosts[post.id];
  const timeAgo = formatTime(post.createdAt);

  const el = document.createElement('div');
  el.className = 'post-card';
  el.setAttribute('data-post-id', post.id);

  const imagesHtml = buildImagesHtml(post.files);
  const filesHtml  = buildFilesHtml(post.files);

  el.innerHTML = `
    <div class="post-header">
      <div class="avatar sm no-status" style="background:${post.authorColor || '#667eea'}">
        ${getInitials(post.author)}
      </div>
      <div class="post-author-info">
        <div class="post-author-name">${escHtml(post.author)}</div>
        <div class="post-time">${timeAgo}</div>
      </div>
      ${isOwner ? `
        <div class="post-menu">
          <button class="icon-btn btn-danger" onclick="deletePost('${post.id}')" title="삭제">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>` : ''}
    </div>

    ${post.content ? `<div class="post-content">${escHtml(post.content)}</div>` : ''}
    ${imagesHtml}
    ${filesHtml}

    <div class="post-actions">
      <button class="action-btn like-btn ${isLiked ? 'liked' : ''}"
              onclick="toggleLike('${post.id}')">
        <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
        <span class="like-count">${post.likeCount || 0}</span>
      </button>
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
        <div class="avatar sm no-status" style="background:${USER.color}">${getInitials(USER.nickname)}</div>
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

  const countClass = images.length === 1 ? 'single'
    : images.length === 2 ? 'double' : 'triple';

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
        <span style="color:var(--text-muted)">(${formatFileSize(f.size)})</span>
      </a>`).join('')}
  </div>`;
}

// 피드 맨 앞에 추가
function prependPost(post) {
  const existing = document.querySelector(`[data-post-id="${post.id}"]`);
  if (existing) return;
  const el = createPostElement(post);
  dom.postFeed.insertBefore(el, dom.postFeed.firstChild);
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
    state.pendingFiles.forEach(f => formData.append('files', f));

    const res = await fetch('/api/posts', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('작성 실패');

    dom.postContent.value = '';
    dom.charCount.textContent = '0';
    clearFilePreview();
    showToast('게시글이 작성되었습니다! ✨', 'success');

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
// 좋아요
// =============================================
async function toggleLike(postId) {
  try {
    const res = await fetch(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER.id }),
    });
    const data = await res.json();
    state.likedPosts[postId] = data.liked;
    localStorage.setItem('likedPosts', JSON.stringify(state.likedPosts));
  } catch {
    showToast('좋아요 처리에 실패했습니다.', 'error');
  }
}

function updateLikeUI(postId, likeCount, userId, liked) {
  const card = document.querySelector(`[data-post-id="${postId}"]`);
  if (!card) return;

  const btn   = card.querySelector('.like-btn');
  const icon  = btn.querySelector('i');
  const count = btn.querySelector('.like-count');

  const isMe = userId === USER.id;
  const currentLiked = isMe ? liked : btn.classList.contains('liked');

  btn.classList.toggle('liked', currentLiked);
  icon.className = currentLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  count.textContent = likeCount;
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
    <div class="avatar sm no-status" style="background:${comment.authorColor || '#667eea'}">
      ${getInitials(comment.author)}
    </div>
    <div class="comment-body">
      <div class="comment-author" style="color:${comment.authorColor || '#667eea'}">${escHtml(comment.author)}</div>
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
  const files = Array.from(e.target.files);
  addFilesToPreview(files);
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

// 드래그 앤 드롭
function setupDropZone() {
  const postCreator = document.querySelector('.post-creator');

  postCreator.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('hidden');
  });

  postCreator.addEventListener('dragleave', (e) => {
    if (!postCreator.contains(e.relatedTarget)) {
      dom.dropZone.classList.add('hidden');
    }
  });

  postCreator.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.add('hidden');
    const files = Array.from(e.dataTransfer.files);
    addFilesToPreview(files);
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
// 채팅
// =============================================
function openGlobalChat() {
  state.activeDMSocket = null;
  state.activeGroupId  = null;

  updateChatHeader('전체 채팅', '모든 사용자와 대화', 'fa-earth-asia');
  setActiveChannelItem('chatList-global', 0);
  socket.emit('getGlobalHistory');
  dom.messageInput.placeholder = '전체 채팅에 메시지를 입력하세요...';
  dom.messageInput.focus();
}

function openDM(targetSocketId, targetNickname, targetColor) {
  state.activeDMSocket = targetSocketId;
  state.activeGroupId  = null;

  // 읽지 않은 메시지 초기화
  delete state.unreadDM[targetSocketId];
  updateDMList();
  updateChatBadge();

  updateChatHeader(targetNickname, '1:1 다이렉트 메시지', 'fa-user',
    `background:${targetColor || '#667eea'}`);
  dom.messageInput.placeholder = `${targetNickname}에게 메시지...`;

  dom.messageArea.innerHTML = '';
  socket.emit('getDMHistory', { otherSocketId: targetSocketId });

  // 채팅 뷰로 전환
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

  const payload = {
    content,
    file: state.chatFile,
  };

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
  // 중복 방지
  if (document.querySelector(`[data-msg-id="${msg.id}"]`)) return;

  if (msg.type === 'system' || (!msg.content && !msg.file && msg.message)) {
    appendSystemMessage(msg.message || msg.content);
    return;
  }

  const isMe = (type === 'dm')
    ? msg.fromSocketId === socket.id
    : (msg.authorId === USER.id || msg.socketId === socket.id);

  const author    = msg.author || msg.fromNickname || msg.authorNickname || '알 수 없음';
  const color     = msg.authorColor || msg.fromColor || '#667eea';
  const content   = msg.content || '';
  const timeStr   = formatTime(msg.createdAt);

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
    <div class="msg-avatar avatar sm no-status" style="background:${color}">
      ${getInitials(author)}
    </div>
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
  if (iconStyle) dom.chatHeaderIcon.style.cssText = iconStyle;
  else dom.chatHeaderIcon.style.cssText = '';
}

function setActiveChannelItem(listId, index) {
  document.querySelectorAll('.chat-channel-item').forEach(i => i.classList.remove('active'));
  const list = $(listId);
  if (list) {
    const items = list.querySelectorAll('.chat-channel-item, .dm-item, .group-item');
    if (items[index]) items[index].classList.add('active');
  }
}

// 채팅 파일 첨부
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
// 채팅 탭 전환
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
// 배지 관련
// =============================================
function incrementChatBadge() {
  if (state.currentView === 'chat') return;
  const current = parseInt(dom.chatBadge.textContent || '0');
  const next = current + 1;
  dom.chatBadge.textContent = next;
  dom.chatBadge.classList.remove('hidden');
}

function updateChatBadge() {
  const total = Object.values(state.unreadDM).reduce((a, b) => a + b, 0)
              + Object.values(state.unreadGroup).reduce((a, b) => a + b, 0);
  dom.chatBadge.textContent = total;
  dom.chatBadge.classList.toggle('hidden', total === 0);
}

// =============================================
// 그룹 방 관련
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

// 엔터로 방 생성
dom.roomNameInput && dom.roomNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmCreateRoom();
});

// =============================================
// 온라인 사용자 렌더링
// =============================================
function renderOnlineUsers() {
  const others = state.onlineUsers.filter(u => u.socketId !== socket.id);
  dom.onlineCount.textContent = state.onlineUsers.length;

  // 사이드바 목록
  dom.onlineUsersList.innerHTML = others.length === 0
    ? '<div style="padding:6px 8px;font-size:0.75rem;color:var(--text-muted)">혼자 접속 중...</div>'
    : others.map(u => `
        <div class="online-user-item" onclick="openDM('${u.socketId}','${escHtml(u.nickname)}','${u.color}')">
          <div class="avatar sm" style="background:${u.color}">${getInitials(u.nickname)}</div>
          <span class="online-user-name">${escHtml(u.nickname)}</span>
        </div>`).join('');

  // 오른쪽 사이드바 카운트
  const countEl = document.getElementById('onlineCountRight');
  if (countEl) countEl.textContent = state.onlineUsers.length;

  // 오른쪽 사이드바
  dom.rightOnlineList.innerHTML = state.onlineUsers.map(u => `
    <div class="right-online-item" onclick="openDM('${u.socketId}','${escHtml(u.nickname)}','${u.color}')">
      <div class="avatar sm" style="background:${u.color}">${getInitials(u.nickname)}</div>
      <span class="right-online-item-name">${escHtml(u.nickname)}${u.socketId === socket.id ? ' (나)' : ''}</span>
    </div>`).join('');

  // DM 목록 업데이트
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
        <div class="avatar sm" style="background:${u.color}">${getInitials(u.nickname)}</div>
        <span class="dm-item-name">${escHtml(u.nickname)}</span>
        ${unread > 0 ? `<span class="dm-unread">${unread}</span>` : ''}
      </div>`;
  }).join('');
}

// =============================================
// 그룹 방 렌더링
// =============================================
function renderGroupRooms() {
  // 사이드바
  dom.groupRoomsList.innerHTML = state.groupRooms.length === 0
    ? '<div style="padding:6px 8px;font-size:0.72rem;color:var(--text-muted)">방이 없습니다</div>'
    : state.groupRooms.map(r => `
        <div class="room-item" onclick="openGroupChat('${r.id}','${escHtml(r.name)}')">
          <i class="fa-solid fa-hashtag"></i>
          ${escHtml(r.name)}
        </div>`).join('');

  // 채팅 탭 내 그룹 목록
  if (state.groupRooms.length === 0) {
    dom.groupList.innerHTML = `<div class="empty-state-sm">
      <i class="fa-solid fa-users"></i><p>채팅방이 없습니다</p>
    </div>`;
  } else {
    const items = state.groupRooms.map(r => {
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
    dom.groupList.innerHTML = items;
  }
}

// =============================================
// 뷰 전환
// =============================================
function switchView(viewName) {
  state.currentView = viewName;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add('active');

  const navItem = document.querySelector(`[data-view="${viewName}"]`);
  if (navItem) navItem.classList.add('active');

  // 채팅 배지 초기화
  if (viewName === 'chat') {
    dom.chatBadge.textContent = '0';
    dom.chatBadge.classList.add('hidden');
    if (!state.activeDMSocket && !state.activeGroupId) openGlobalChat();
  }

  // 프로필 뷰
  if (viewName === 'profile') loadProfileView();

  // 탐색 뷰
  if (viewName === 'explore') loadExploreView();

  // 모바일: 사이드바 닫기
  closeSidebar();
}

// =============================================
// 프로필 뷰
// =============================================
function loadProfileView() {
  dom.profileName.textContent = USER.nickname;
  dom.profileAvatarLarge.textContent = getInitials(USER.nickname);
  dom.profileAvatarLarge.style.background = USER.color;

  // 내 게시글 불러오기
  fetch('/api/posts?limit=50')
    .then(r => r.json())
    .then(data => {
      const myPosts = data.posts.filter(p => p.authorId === USER.id);
      dom.myPostCount.textContent = myPosts.length;
      dom.myLikeCount.textContent = myPosts.reduce((sum, p) => sum + (p.likeCount || 0), 0);

      dom.myPostsFeed.innerHTML = '';
      if (myPosts.length === 0) {
        dom.myPostsFeed.innerHTML = `<div class="empty-feed">
          <div class="empty-feed-icon"><i class="fa-solid fa-pen-nib"></i></div>
          <p>아직 작성한 게시글이 없습니다</p>
        </div>`;
      } else {
        myPosts.forEach(p => dom.myPostsFeed.appendChild(createPostElement(p)));
      }
    });
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
      data.posts.forEach(p => {
        dom.exploreGrid.appendChild(createPostElement(p));
      });
    });
}

// =============================================
// UI 업데이트
// =============================================
function updateProfileUI() {
  const initials = getInitials(USER.nickname);

  // 사이드바 프로필
  dom.sidebarNickname.textContent = USER.nickname;
  dom.sidebarAvatar.textContent = initials;
  dom.sidebarAvatar.style.background = USER.color;
  dom.sidebarAvatar.className = 'avatar sm no-status';

  // 게시글 작성 아바타
  dom.creatorAvatar.textContent = initials;
  dom.creatorAvatar.style.background = USER.color;
  dom.creatorAvatar.className = 'avatar sm no-status';

  // 프로필 뷰
  if (dom.profileAvatarLarge) {
    dom.profileAvatarLarge.textContent = initials;
    dom.profileAvatarLarge.style.background = USER.color;
    dom.profileName.textContent = USER.nickname;
  }
}

// =============================================
// 설정 모달
// =============================================
function openSettingsModal() {
  dom.settingsModal.classList.remove('hidden');
  dom.changeNicknameInput.value = USER.nickname;

  // 현재 색상 선택 표시
  document.querySelectorAll('.color-opt').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.color === USER.color);
  });
}

function closeSettingsModal() {
  dom.settingsModal.classList.add('hidden');
}

function saveSettings() {
  const newNickname = dom.changeNicknameInput.value.trim();

  if (newNickname.length < 2 || newNickname.length > 20) {
    showToast('닉네임은 2~20자 이내여야 합니다.', 'error');
    return;
  }

  const oldNickname = USER.nickname;
  USER.nickname = newNickname;
  localStorage.setItem('nickname', newNickname);
  localStorage.setItem('color', USER.color);

  if (oldNickname !== newNickname) {
    socket.emit('updateNickname', { oldNickname, newNickname });
  }

  updateProfileUI();
  closeSettingsModal();
  showToast('설정이 저장되었습니다! ✅', 'success');
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
  const picker = $('emojiPicker');
  picker.classList.toggle('hidden');
  $('emojiPickerChat').classList.add('hidden');
}

function toggleEmojiPickerChat() {
  const picker = $('emojiPickerChat');
  picker.classList.toggle('hidden');
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

// 이모지 피커 외부 클릭 시 닫기
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
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
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
    // ESC: 모달/이모지 닫기
    if (e.key === 'Escape') {
      closeImageModal();
      closeCreateRoomModal();
      closeSettingsModal();
      $('emojiPicker')?.classList.add('hidden');
      $('emojiPickerChat')?.classList.add('hidden');
    }

    // Ctrl+/ : 검색 포커스
    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      dom.searchInput.focus();
    }

    // Ctrl+Enter : 게시글 제출 (게시글 작성 중일 때)
    if (e.ctrlKey && e.key === 'Enter') {
      if (document.activeElement === dom.postContent) {
        submitPost();
      }
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

  if (diff < 60)  return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
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

// CSS fadeOut 애니메이션 추가
const style = document.createElement('style');
style.textContent = `@keyframes fadeOut { to { opacity:0; transform:scale(0.95); } }`;
document.head.appendChild(style);
