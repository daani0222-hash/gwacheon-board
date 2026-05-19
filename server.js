/**
 * server.js - 메인 서버 파일
 * Express + Socket.io 기반의 실시간 소셜 커뮤니티 서버
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Socket.io 초기화 (CORS 허용)
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e7 // 10MB
});

// =============================================
// 인메모리 데이터 저장소
// =============================================
let posts = [];            // 게시글 목록
let comments = {};         // { postId: [댓글 배열] }
let likes = {};            // { postId: [userId 배열] }
let onlineUsers = {};      // { socketId: 유저 정보 }
let globalMessages = [];   // 전체 채팅 메시지
let directMessages = {};   // { roomKey: [메시지 배열] }
let groupRooms = {};       // { roomId: 방 정보 }

// =============================================
// 미들웨어 설정
// =============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// uploads 폴더 없으면 생성
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// =============================================
// Multer 파일 업로드 설정
// =============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_가-힣]/g, '_');
    cb(null, `${Date.now()}-${uuidv4().slice(0,8)}-${safeName}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|mp4|pdf|txt|zip|doc|docx|mp3/;
  if (allowed.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('허용되지 않는 파일 형식입니다.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB 제한
});

// =============================================
// API 라우트 - 게시글
// =============================================

// 게시글 목록 조회 (페이지네이션 + 검색)
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

// 게시글 작성
app.post('/api/posts', upload.array('files', 5), (req, res) => {
  try {
    const { content, author, authorId, authorColor } = req.body;

    if (!content?.trim() && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: '내용 또는 파일이 필요합니다.' });
    }

    const sanitizedContent = (content || '').slice(0, 2000);

    const post = {
      id: uuidv4(),
      content: sanitizedContent,
      author: (author || '익명').slice(0, 30),
      authorId: authorId || 'unknown',
      authorColor: authorColor || '#667eea',
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

    const postData = { ...post, likeCount: 0, commentCount: 0 };
    io.emit('newPost', postData);

    res.json(postData);
  } catch (err) {
    res.status(500).json({ error: '게시글 작성 실패: ' + err.message });
  }
});

// 게시글 삭제
app.delete('/api/posts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { authorId } = req.body;

    const idx = posts.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    const post = posts[idx];
    if (post.authorId !== authorId) return res.status(403).json({ error: '권한이 없습니다.' });

    // 업로드된 파일 삭제
    post.files.forEach(f => {
      const fp = path.join('uploads', f.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });

    posts.splice(idx, 1);
    delete likes[id];
    delete comments[id];

    io.emit('deletePost', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '삭제 실패' });
  }
});

// =============================================
// API 라우트 - 댓글
// =============================================

// 댓글 조회
app.get('/api/posts/:id/comments', (req, res) => {
  res.json(comments[req.params.id] || []);
});

// 댓글 작성
app.post('/api/posts/:id/comments', (req, res) => {
  try {
    const { id } = req.params;
    const { content, author, authorId, authorColor } = req.body;

    if (!content?.trim()) return res.status(400).json({ error: '댓글 내용이 필요합니다.' });
    if (!posts.find(p => p.id === id)) return res.status(404).json({ error: '게시글 없음' });

    if (!comments[id]) comments[id] = [];

    const comment = {
      id: uuidv4(),
      postId: id,
      content: content.slice(0, 500),
      author: (author || '익명').slice(0, 30),
      authorId: authorId || 'unknown',
      authorColor: authorColor || '#667eea',
      createdAt: new Date().toISOString()
    };

    comments[id].push(comment);

    io.emit('newComment', comment);
    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: '댓글 작성 실패' });
  }
});

// =============================================
// API 라우트 - 좋아요
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

    const update = { postId: id, likeCount: likes[id].length, userId, liked };
    io.emit('likeUpdate', update);
    res.json(update);
  } catch (err) {
    res.status(500).json({ error: '좋아요 처리 실패' });
  }
});

// =============================================
// API 라우트 - 파일 업로드 (채팅용)
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

// =============================================
// Socket.io 이벤트 처리
// =============================================
io.on('connection', (socket) => {
  console.log(`[연결] ${socket.id}`);

  // 사용자 입장
  socket.on('userJoin', (userData) => {
    onlineUsers[socket.id] = {
      socketId: socket.id,
      nickname: userData.nickname || '익명',
      userId: userData.userId || socket.id,
      color: userData.color || '#667eea',
      joinedAt: new Date().toISOString()
    };

    // 전체 채팅방 입장
    socket.join('global');

    // 현재 온라인 유저 목록 전송
    io.emit('onlineUsers', Object.values(onlineUsers));

    // 입장 알림
    io.emit('systemMessage', {
      type: 'join',
      nickname: onlineUsers[socket.id].nickname,
      message: `${onlineUsers[socket.id].nickname}님이 입장하셨습니다.`,
      createdAt: new Date().toISOString()
    });

    // 그룹 방 목록 전송
    socket.emit('groupRooms', Object.values(groupRooms));

    // 전체 채팅 히스토리 전송 (최근 50개)
    socket.emit('globalHistory', globalMessages.slice(-50));
  });

  // 닉네임 변경
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

  // ─── 전체 채팅 ───────────────────────────────
  socket.on('globalMessage', (data) => {
    const user = onlineUsers[socket.id];
    if (!user) return;

    const msg = {
      id: uuidv4(),
      content: (data.content || '').slice(0, 1000),
      author: user.nickname,
      authorId: user.userId,
      authorColor: user.color,
      socketId: socket.id,
      file: data.file || null,
      createdAt: new Date().toISOString()
    };

    globalMessages.push(msg);
    if (globalMessages.length > 200) globalMessages.shift();

    io.emit('globalMessage', msg);
  });

  // ─── 1:1 다이렉트 메시지 ──────────────────────
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
      content: (content || '').slice(0, 1000),
      file: file || null,
      createdAt: new Date().toISOString()
    };

    const roomKey = [socket.id, toSocketId].sort().join('__');
    if (!directMessages[roomKey]) directMessages[roomKey] = [];
    directMessages[roomKey].push(msg);
    if (directMessages[roomKey].length > 200) directMessages[roomKey].shift();

    socket.emit('directMessage', msg);
    const targetSocket = io.sockets.sockets.get(toSocketId);
    if (targetSocket) io.to(toSocketId).emit('directMessage', msg);
  });

  // DM 히스토리 요청
  socket.on('getDMHistory', ({ otherSocketId }) => {
    const roomKey = [socket.id, otherSocketId].sort().join('__');
    socket.emit('dmHistory', {
      otherSocketId,
      messages: directMessages[roomKey] || []
    });
  });

  // ─── 그룹 채팅방 ────────────────────────────────
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

    socket.emit('groupRoomHistory', {
      roomId,
      messages: room.messages.slice(-50)
    });

    io.to(roomId).emit('groupRoomMemberUpdate', {
      roomId,
      memberCount: room.members.length
    });
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
      socketId: socket.id,
      file: file || null,
      createdAt: new Date().toISOString()
    };

    room.messages.push(msg);
    if (room.messages.length > 200) room.messages.shift();

    io.to(roomId).emit('groupMessage', msg);
  });

  // ─── 타이핑 인디케이터 ────────────────────────
  socket.on('typing', ({ channel, roomId }) => {
    const user = onlineUsers[socket.id];
    if (!user) return;
    socket.broadcast.emit('userTyping', {
      socketId: socket.id,
      nickname: user.nickname,
      channel,
      roomId
    });
  });

  socket.on('stopTyping', ({ channel, roomId }) => {
    socket.broadcast.emit('userStopTyping', {
      socketId: socket.id,
      channel,
      roomId
    });
  });

  // ─── 연결 해제 ───────────────────────────────
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
// 서버 시작
// =============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✨ MySocialSite 서버 시작!`);
  console.log(`📡 로컬 접속: http://localhost:${PORT}`);
  console.log(`🌐 네트워크 접속: http://<내 IP>:${PORT}\n`);
});

// 오류 처리
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
