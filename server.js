/**
 * server.js - 과천중 비밀게시판 메인 서버
 * Express + Socket.io 기반의 실시간 커뮤니티 서버
 */

const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e7
});

// =============================================
// JSON 영구 저장소
// =============================================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function loadJSON(filename, fallback) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (e) {
    console.error(`[데이터 로드 오류] ${filename}:`, e.message);
  }
  return fallback;
}

function saveJSON(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filepath, JSON.stringify(data), 'utf-8');
  } catch (e) {
    console.error(`[데이터 저장 오류] ${filename}:`, e.message);
  }
}

// 서버 시작 시 데이터 로드
let posts = loadJSON('posts.json', []);
let comments = loadJSON('comments.json', {});
let likes = loadJSON('likes.json', {});

// 인메모리 데이터
let onlineUsers = {};
let globalMessages = [];
let directMessages = {};
let groupRooms = {};

function savePosts() { saveJSON('posts.json', posts); }
function saveComments() { saveJSON('comments.json', comments); }
function saveLikes() { saveJSON('likes.json', likes); }

// =============================================
// 미들웨어
// =============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('uploads/avatars')) fs.mkdirSync('uploads/avatars');

// =============================================
// Multer 설정
// =============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_가-힣]/g, '_');
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}-${safeName}`);
  }
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/avatars/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|mp4|pdf|txt|zip|doc|docx|mp3/;
  if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
  else cb(new Error('허용되지 않는 파일 형식입니다.'));
};

const imageFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
  else cb(new Error('이미지 파일만 업로드 가능합니다.'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadAvatar = multer({ storage: avatarStorage, fileFilter: imageFilter, limits: { fileSize: 3 * 1024 * 1024 } });

// =============================================
// API - 게시글
// =============================================
app.get('/api/posts', (req, res) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    let filtered = [...posts].reverse();

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.content.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q)
      );
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const start = (pageNum - 1) * limitNum;
    const paginated = filtered.slice(start, start + limitNum);

    res.json({
      posts: paginated.map(p => ({
        ...p,
        likeCount: (likes[p.id] || []).length,
        commentCount: (comments[p.id] || []).length
      })),
      hasMore: filtered.length > start + limitNum,
      total: filtered.length
    });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

app.post('/api/posts', upload.array('files', 5), (req, res) => {
  try {
    const { content, author, authorId, authorColor, authorAvatar } = req.body;

    if (!content?.trim() && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: '내용 또는 파일이 필요합니다.' });
    }

    const post = {
      id: uuidv4(),
      content: (content || '').slice(0, 2000),
      author: (author || '익명').slice(0, 30),
      authorId: authorId || 'unknown',
      authorColor: authorColor || '#2563eb',
      authorAvatar: authorAvatar || null,
      files: (req.files || []).map(f => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/${f.filename}`
      })),
      createdAt: new Date().toISOString()
    };

    posts.push(post);
    likes[post.id] = [];
    comments[post.id] = [];

    savePosts();
    saveLikes();
    saveComments();

    const postData = { ...post, likeCount: 0, commentCount: 0 };
    io.emit('newPost', postData);
    res.json(postData);
  } catch (err) {
    res.status(500).json({ error: '게시글 작성 실패: ' + err.message });
  }
});

app.delete('/api/posts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { authorId } = req.body;

    const idx = posts.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    const post = posts[idx];
    if (post.authorId !== authorId) return res.status(403).json({ error: '권한이 없습니다.' });

    post.files.forEach(f => {
      const fp = path.join('uploads', f.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });

    posts.splice(idx, 1);
    delete likes[id];
    delete comments[id];

    savePosts();
    saveLikes();
    saveComments();

    io.emit('deletePost', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '삭제 실패' });
  }
});

// =============================================
// API - 댓글
// =============================================
app.get('/api/posts/:id/comments', (req, res) => {
  res.json(comments[req.params.id] || []);
});

app.post('/api/posts/:id/comments', (req, res) => {
  try {
    const { id } = req.params;
    const { content, author, authorId, authorColor, authorAvatar } = req.body;

    if (!content?.trim()) return res.status(400).json({ error: '댓글 내용이 필요합니다.' });
    if (!posts.find(p => p.id === id)) return res.status(404).json({ error: '게시글 없음' });

    if (!comments[id]) comments[id] = [];

    const comment = {
      id: uuidv4(),
      postId: id,
      content: content.slice(0, 500),
      author: (author || '익명').slice(0, 30),
      authorId: authorId || 'unknown',
      authorColor: authorColor || '#2563eb',
      authorAvatar: authorAvatar || null,
      createdAt: new Date().toISOString()
    };

    comments[id].push(comment);
    saveComments();

    io.emit('newComment', comment);
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: '댓글 작성 실패' });
  }
});

// =============================================
// API - 좋아요
// =============================================
app.post('/api/posts/:id/like', (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!likes[id]) likes[id] = [];

    const idx = likes[id].indexOf(userId);
    const liked = idx === -1;
    if (liked) likes[id].push(userId);
    else likes[id].splice(idx, 1);

    saveLikes();

    const update = { postId: id, likeCount: likes[id].length, userId, liked };
    io.emit('likeUpdate', update);
    res.json(update);
  } catch (err) {
    res.status(500).json({ error: '좋아요 처리 실패' });
  }
});

// =============================================
// API - 파일 업로드
// =============================================
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  res.json({
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`
  });
});

// 프로필 사진 업로드
app.post('/api/upload/avatar', uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '이미지 파일이 없습니다.' });
  res.json({
    url: `/uploads/avatars/${req.file.filename}`
  });
});

// =============================================
// Socket.io 이벤트
// =============================================
io.on('connection', (socket) => {
  console.log(`[연결] ${socket.id}`);

  // 닉네임 중복 확인
  socket.on('checkNickname', ({ nickname }) => {
    const taken = Object.values(onlineUsers).some(u => u.nickname === nickname);
    socket.emit('nicknameResult', { available: !taken, nickname });
  });

  // 사용자 입장
  socket.on('userJoin', (userData) => {
    const nickname = userData.nickname || '익명';

    // 닉네임 중복 차단
    const taken = Object.values(onlineUsers).some(u => u.nickname === nickname);
    if (taken) {
      socket.emit('nicknameTaken', { nickname });
      return;
    }

    onlineUsers[socket.id] = {
      socketId: socket.id,
      nickname,
      userId: userData.userId || socket.id,
      color: userData.color || '#2563eb',
      avatarUrl: userData.avatarUrl || null,
      bio: (userData.bio || '').slice(0, 100),
      joinedAt: new Date().toISOString()
    };

    socket.join('global');
    io.emit('onlineUsers', Object.values(onlineUsers));
    io.emit('systemMessage', {
      type: 'join',
      nickname,
      message: `${nickname}님이 입장하셨습니다.`,
      createdAt: new Date().toISOString()
    });

    socket.emit('groupRooms', Object.values(groupRooms));
    socket.emit('globalHistory', globalMessages.slice(-50));
  });

  // 닉네임/프로필 업데이트
  socket.on('updateNickname', ({ newNickname }) => {
    if (onlineUsers[socket.id]) {
      const old = onlineUsers[socket.id].nickname;
      onlineUsers[socket.id].nickname = newNickname;
      io.emit('onlineUsers', Object.values(onlineUsers));
      io.emit('systemMessage', {
        type: 'rename',
        message: `${old}님이 ${newNickname}으로 닉네임을 변경하셨습니다.`,
        createdAt: new Date().toISOString()
      });
    }
  });

  socket.on('updateProfile', ({ avatarUrl, bio }) => {
    if (onlineUsers[socket.id]) {
      if (avatarUrl !== undefined) onlineUsers[socket.id].avatarUrl = avatarUrl;
      if (bio !== undefined) onlineUsers[socket.id].bio = (bio || '').slice(0, 100);
      io.emit('onlineUsers', Object.values(onlineUsers));
    }
  });

  // 전체 채팅
  socket.on('globalMessage', (data) => {
    const user = onlineUsers[socket.id];
    if (!user) return;

    const msg = {
      id: uuidv4(),
      content: (data.content || '').slice(0, 1000),
      author: user.nickname,
      authorId: user.userId,
      authorColor: user.color,
      authorAvatar: user.avatarUrl || null,
      socketId: socket.id,
      file: data.file || null,
      createdAt: new Date().toISOString()
    };

    globalMessages.push(msg);
    if (globalMessages.length > 200) globalMessages.shift();
    io.emit('globalMessage', msg);
  });

  // 1:1 다이렉트 메시지
  socket.on('directMessage', (data) => {
    const { toSocketId, content, file } = data;
    const user = onlineUsers[socket.id];
    if (!user) return;

    const msg = {
      id: uuidv4(),
      fromSocketId: socket.id,
      toSocketId,
      fromNickname: user.nickname,
      fromColor: user.color,
      fromAvatar: user.avatarUrl || null,
      content: (content || '').slice(0, 1000),
      file: file || null,
      createdAt: new Date().toISOString()
    };

    const roomKey = [socket.id, toSocketId].sort().join('__');
    if (!directMessages[roomKey]) directMessages[roomKey] = [];
    directMessages[roomKey].push(msg);
    if (directMessages[roomKey].length > 200) directMessages[roomKey].shift();

    socket.emit('directMessage', msg);
    if (io.sockets.sockets.get(toSocketId)) io.to(toSocketId).emit('directMessage', msg);
  });

  socket.on('getDMHistory', ({ otherSocketId }) => {
    const roomKey = [socket.id, otherSocketId].sort().join('__');
    socket.emit('dmHistory', {
      otherSocketId,
      messages: directMessages[roomKey] || []
    });
  });

  // 그룹 채팅방
  socket.on('createGroupRoom', ({ name }) => {
    const user = onlineUsers[socket.id];
    if (!user) return;

    const room = {
      id: uuidv4(),
      name: name.slice(0, 30),
      creatorSocketId: socket.id,
      creatorNickname: user.nickname,
      members: [socket.id],
      messages: [],
      createdAt: new Date().toISOString()
    };

    groupRooms[room.id] = room;
    socket.join(room.id);
    io.emit('groupRoomCreated', room);
  });

  socket.on('joinGroupRoom', ({ roomId }) => {
    const room = groupRooms[roomId];
    if (!room) return;

    socket.join(roomId);
    if (!room.members.includes(socket.id)) room.members.push(socket.id);

    socket.emit('groupRoomHistory', { roomId, messages: room.messages.slice(-50) });
    io.to(roomId).emit('groupRoomMemberUpdate', { roomId, memberCount: room.members.length });
  });

  socket.on('groupMessage', (data) => {
    const { roomId, content, file } = data;
    const user = onlineUsers[socket.id];
    const room = groupRooms[roomId];
    if (!user || !room) return;

    const msg = {
      id: uuidv4(),
      roomId,
      content: (content || '').slice(0, 1000),
      author: user.nickname,
      authorId: user.userId,
      authorColor: user.color,
      authorAvatar: user.avatarUrl || null,
      socketId: socket.id,
      file: file || null,
      createdAt: new Date().toISOString()
    };

    room.messages.push(msg);
    if (room.messages.length > 200) room.messages.shift();
    io.to(roomId).emit('groupMessage', msg);
  });

  // 타이핑 인디케이터
  socket.on('typing', ({ channel, roomId }) => {
    const user = onlineUsers[socket.id];
    if (!user) return;
    socket.broadcast.emit('userTyping', { socketId: socket.id, nickname: user.nickname, channel, roomId });
  });

  socket.on('stopTyping', ({ channel, roomId }) => {
    socket.broadcast.emit('userStopTyping', { socketId: socket.id, channel, roomId });
  });

  // 연결 해제
  socket.on('disconnect', () => {
    const user = onlineUsers[socket.id];
    delete onlineUsers[socket.id];
    io.emit('onlineUsers', Object.values(onlineUsers));
    if (user) {
      io.emit('systemMessage', {
        type: 'leave',
        nickname: user.nickname,
        message: `${user.nickname}님이 퇴장하셨습니다.`,
        createdAt: new Date().toISOString()
      });
    }
    console.log(`[연결 해제] ${socket.id}`);
  });
});

// =============================================
// Render Keep-Alive (14분마다 자기 자신 핑)
// =============================================
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    https.get(process.env.RENDER_EXTERNAL_URL, (res) => {
      console.log(`[Keep-Alive] 핑 완료 (${res.statusCode})`);
    }).on('error', (e) => {
      console.error('[Keep-Alive] 오류:', e.message);
    });
  }, 14 * 60 * 1000);
  console.log('[Keep-Alive] 14분 간격 자동 핑 활성화');
}

// =============================================
// 서버 시작
// =============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n ====================================`);
  console.log(`  과천중 비밀게시판 서버 시작!`);
  console.log(`  로컬: http://localhost:${PORT}`);
  console.log(` ====================================\n`);
  console.log(`[데이터] 게시글 ${posts.length}개 로드됨`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
