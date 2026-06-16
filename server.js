/**
 * server.js - 과천중 비밀게시판
 * 랭킹·명예의전당·관리자·다중좋아요 완전판
 */

const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// =============================================
// MongoDB 지원 (MONGODB_URI 환경변수 필요)
// =============================================
let mongoose = null, useDB = false;
async function initMongo() {
  if (!process.env.MONGODB_URI) {
    console.log('[DB] MONGODB_URI 없음 → JSON 파일 사용 (Render 재시작 시 데이터 초기화됨)');
    console.log('[DB] MongoDB Atlas URI를 Render 환경변수에 MONGODB_URI로 추가하면 영구저장됩니다.');
    return;
  }
  try {
    mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('[DB] MongoDB 연결 성공! 데이터 영구저장 활성화');
    useDB = true;
    await syncFromDB();
  } catch(e) {
    console.error('[DB] MongoDB 연결 실패, JSON 파일로 폴백:', e.message);
  }
}

// Key-Value 컬렉션 (단순 구조)
function getKVModel() {
  if (!mongoose) return null;
  if (mongoose.models.KV) return mongoose.models.KV;
  const s = new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed, updatedAt: Date });
  return mongoose.model('KV', s);
}

async function dbGet(key, fallback) {
  try {
    const KV = getKVModel();
    if (!KV) return fallback;
    const doc = await KV.findOne({ key });
    return doc ? doc.value : fallback;
  } catch { return fallback; }
}

async function dbSet(key, value) {
  try {
    const KV = getKVModel();
    if (!KV) return;
    await KV.findOneAndUpdate({ key }, { value, updatedAt: new Date() }, { upsert: true, new: true });
  } catch(e) { console.error(`[DB set ${key}]`, e.message); }
}

async function syncFromDB() {
  posts        = await dbGet('posts',      posts);
  comments     = await dbGet('comments',   comments);
  likes        = await dbGet('likes',      likes);
  rankingsData = await dbGet('rankings',   rankingsData);
  members      = await dbGet('members',    members);
  blockGames   = await dbGet('blockGames', blockGames);
  migrateLikes();
  console.log(`[DB] 로드 완료 - 게시글 ${posts.length}개, 멤버 ${Object.keys(members).length}명`);
}

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
    if (fs.existsSync(filepath)) return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (e) { console.error(`[로드 오류] ${filename}:`, e.message); }
  return fallback;
}

function saveJSON(filename, data) {
  try {
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data), 'utf-8');
  } catch (e) { console.error(`[저장 오류] ${filename}:`, e.message); }
}

// =============================================
// 데이터 로드
// =============================================
let posts    = loadJSON('posts.json',    []);
let comments = loadJSON('comments.json', {});
let likes    = loadJSON('likes.json',    {});  // { postId: { "👍":[], "😂":[], "🧠":[], "💀":[] } }

// 랭킹·명예의전당
let rankingsData = loadJSON('rankings.json', {
  lastWeek:         '',
  top10:            [],
  hallOfFame:       null,
  rankHistory:      {},   // { userId: { consecutiveWins, lastWinWeek, totalWins } }
  pinnedPostId:     null,
  recommendedPostId: null,
});

// 멤버 (방문자 기록)
let members = loadJSON('members.json', {}); // { userId: { nickname, color, avatarUrl, bio, firstSeen, lastSeen } }
const saveMembers = () => { saveJSON('members.json', members); if (useDB) dbSet('members', members); };

// 블록 게임 (유저 제작)
let blockGames = loadJSON('block-games.json', []);
const saveBlockGames = () => { saveJSON('block-games.json', blockGames); if (useDB) dbSet('blockGames', blockGames); };

// 인메모리
let onlineUsers    = {};
let globalMessages = [];
let directMessages = {};
let groupRooms     = {};
let gameRooms      = {}; // { roomId: { id, gameType, players, createdAt } }

// =============================================
// 좋아요 형식 마이그레이션 (배열 → 객체)
// =============================================
const LIKE_TYPES = ['👍', '😂', '🧠', '💀'];

function migrateLikes() {
  let changed = false;
  for (const postId in likes) {
    if (Array.isArray(likes[postId])) {
      likes[postId] = { '👍': likes[postId], '😂': [], '🧠': [], '💀': [] };
      changed = true;
    }
    for (const t of LIKE_TYPES) {
      if (!Array.isArray(likes[postId][t])) likes[postId][t] = [];
    }
  }
  // 게시글마다 likes 초기화 보장
  for (const post of posts) {
    if (!likes[post.id]) {
      likes[post.id] = { '👍': [], '😂': [], '🧠': [], '💀': [] };
      changed = true;
    }
  }
  if (changed) saveJSON('likes.json', likes);
}
migrateLikes();

// =============================================
// 저장 헬퍼
// =============================================
const savePosts    = () => { saveJSON('posts.json',    posts);        if (useDB) dbSet('posts',    posts); };
const saveComments = () => { saveJSON('comments.json', comments);     if (useDB) dbSet('comments', comments); };
const saveLikes    = () => { saveJSON('likes.json',    likes);         if (useDB) dbSet('likes',    likes); };
const saveRankings = () => { saveJSON('rankings.json', rankingsData);  if (useDB) dbSet('rankings', rankingsData); };

// =============================================
// 좋아요 유틸
// =============================================
function getTotalLikes(postId) {
  const pl = likes[postId] || {};
  return LIKE_TYPES.reduce((s, t) => s + (pl[t]?.length || 0), 0);
}

function getLikeBreakdown(postId) {
  const pl = likes[postId] || {};
  const bd = {};
  for (const t of LIKE_TYPES) bd[t] = pl[t]?.length || 0;
  return bd;
}

// =============================================
// 랭킹 계산
// =============================================
function getCurrentWeek() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getDominantLike(breakdown) {
  return LIKE_TYPES.reduce((a, b) => (breakdown[a] || 0) >= (breakdown[b] || 0) ? a : b);
}

function getTitle(rank, dominant, consecutiveWins) {
  if (rank === 1) {
    if (consecutiveWins >= 3) return '🏆 전설의 인기인';
    if (consecutiveWins >= 2) return '💎 다이아 인기인';
    const map = { '👍': '💪 추천왕', '😂': '😂 개그왕', '🧠': '🧠 지식인', '💀': '👑 레전드' };
    return map[dominant] || '🔥 이번달 인기인';
  }
  if (rank <= 3) {
    const map = { '👍': '👍 추천러', '😂': '🤣 웃김왕', '🧠': '📚 정보통', '💀': '🔥 레전드후보' };
    return map[dominant] || '🥈 TOP3';
  }
  return '✨ TOP10 인기인';
}

function getBadge(rank, dominant, consecutiveWins) {
  if (rank === 1) {
    if (consecutiveWins >= 3) return '👑';
    if (consecutiveWins >= 2) return '💎';
    const map = { '👍': '💪', '😂': '😂', '🧠': '🧠', '💀': '💀' };
    return '🥇' + (map[dominant] || '');
  }
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '⭐';
}

function calculateWeeklyRankings() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentPosts = posts.filter(p => new Date(p.createdAt) >= sevenDaysAgo && p.authorId !== 'admin');
  const userStats = {};

  for (const post of recentPosts) {
    const aid = post.authorId;
    if (!userStats[aid]) {
      userStats[aid] = {
        userId: aid,
        nickname: post.author,
        color: post.authorColor || '#2563eb',
        avatarUrl: post.authorAvatar || null,
        bio: '',
        likeBreakdown: { '👍': 0, '😂': 0, '🧠': 0, '💀': 0 },
        totalLikes: 0,
        postCount: 0
      };
    }
    userStats[aid].postCount++;
    userStats[aid].nickname = post.author;
    userStats[aid].color = post.authorColor || '#2563eb';
    userStats[aid].avatarUrl = post.authorAvatar || null;
    for (const t of LIKE_TYPES) {
      const cnt = likes[post.id]?.[t]?.length || 0;
      userStats[aid].likeBreakdown[t] += cnt;
      userStats[aid].totalLikes += cnt;
    }
  }

  // 온라인 유저 bio/avatar 최신화
  for (const sid in onlineUsers) {
    const u = onlineUsers[sid];
    if (userStats[u.userId]) {
      userStats[u.userId].bio = u.bio || '';
      if (u.avatarUrl) userStats[u.userId].avatarUrl = u.avatarUrl;
    }
  }

  return Object.values(userStats)
    .sort((a, b) => b.totalLikes - a.totalLikes)
    .slice(0, 10)
    .map((u, i) => ({ ...u, rank: i + 1, dominant: getDominantLike(u.likeBreakdown) }));
}

function refreshRankings() {
  const week = getCurrentWeek();
  if (rankingsData.lastWeek === week) return; // 이번주 이미 계산됨

  const top10 = calculateWeeklyRankings();

  if (top10.length > 0) {
    const winner = top10[0];
    const prevHistory = rankingsData.rankHistory[winner.userId] || {};
    const prevWinWeek = prevHistory.lastWinWeek || '';

    // 연속 우승 확인 (이전 주 우승자인지)
    let consecutive = 1;
    const prevWeekNum = rankingsData.lastWeek;
    if (prevWinWeek === prevWeekNum) {
      consecutive = (prevHistory.consecutiveWins || 0) + 1;
    }

    rankingsData.rankHistory[winner.userId] = {
      consecutiveWins: consecutive,
      lastWinWeek: week,
      totalWins: (prevHistory.totalWins || 0) + 1
    };

    const prevHoF = rankingsData.hallOfFame;
    rankingsData.hallOfFame = {
      ...winner,
      consecutiveWins: consecutive,
      sinceDate: (prevHoF?.userId === winner.userId) ? prevHoF.sinceDate : new Date().toISOString()
    };
  }

  rankingsData.lastWeek = week;
  rankingsData.top10 = top10;
  saveRankings();
}

function enrichTop10(top10) {
  return top10.map(u => {
    const hist = rankingsData.rankHistory[u.userId] || {};
    const cons = hist.consecutiveWins || 0;
    return {
      ...u,
      consecutiveWins: cons,
      title: getTitle(u.rank, u.dominant, cons),
      badge: getBadge(u.rank, u.dominant, cons)
    };
  });
}

// =============================================
// 관리자 설정
// =============================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

function isAdmin(pw) { return (pw || '').trim() === (ADMIN_PASSWORD || '').trim(); }
function isHoFWinner(userId) {
  return rankingsData.hallOfFame && rankingsData.hallOfFame.userId === userId;
}

// =============================================
// 미들웨어
// =============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public', { etag: false, maxAge: 0, setHeaders: (res) => { res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); } }));
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('uploads/avatars')) fs.mkdirSync('uploads/avatars');

// =============================================
// Multer
// =============================================
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_가-힣]/g, '_');
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}-${safe}`);
  }
});
const avatarStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/avatars/'),
  filename: (_, file, cb) => {
    cb(null, `avatar-${Date.now()}-${uuidv4().slice(0, 8)}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const fileFilter  = (_, f, cb) => /jpeg|jpg|png|gif|webp|mp4|pdf|txt|zip|doc|docx|mp3/.test(path.extname(f.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('허용되지 않는 파일'));
const imageFilter = (_, f, cb) => /jpeg|jpg|png|gif|webp/.test(path.extname(f.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('이미지만 가능'));

const upload       = multer({ storage,       fileFilter,  limits: { fileSize: 10 * 1024 * 1024 } });
const uploadAvatar = multer({ storage: avatarStorage, fileFilter: imageFilter, limits: { fileSize: 3 * 1024 * 1024 } });

// =============================================
// 공통 게시글 응답 빌더
// =============================================
function postResponse(p) {
  return {
    ...p,
    likeCount: getTotalLikes(p.id),
    likeBreakdown: getLikeBreakdown(p.id),
    commentCount: (comments[p.id] || []).length,
    isPinned: rankingsData.pinnedPostId === p.id,
    isRecommended: rankingsData.recommendedPostId === p.id,
  };
}

// =============================================
// API - 게시글
// =============================================
app.get('/api/posts', (req, res) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    let filtered = [...posts].reverse();
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p => p.content.toLowerCase().includes(q) || p.author.toLowerCase().includes(q));
    }
    const start = (parseInt(page) - 1) * parseInt(limit);
    const paginated = filtered.slice(start, start + parseInt(limit));
    res.json({
      posts: paginated.map(postResponse),
      hasMore: filtered.length > start + parseInt(limit),
      total: filtered.length,
      pinnedPostId: rankingsData.pinnedPostId,
      recommendedPostId: rankingsData.recommendedPostId,
    });
  } catch (err) { res.status(500).json({ error: '서버 오류' }); }
});

app.post('/api/posts', upload.array('files', 5), (req, res) => {
  try {
    const { content, author, authorId, authorColor, authorAvatar } = req.body;
    if (!content?.trim() && (!req.files || req.files.length === 0))
      return res.status(400).json({ error: '내용 또는 파일이 필요합니다.' });

    const post = {
      id: uuidv4(),
      content: (content || '').slice(0, 2000),
      author: (author || '익명').slice(0, 30),
      authorId: authorId || 'unknown',
      authorColor: authorColor || '#2563eb',
      authorAvatar: authorAvatar || null,
      files: (req.files || []).map(f => ({
        filename: f.filename, originalname: f.originalname,
        mimetype: f.mimetype, size: f.size, url: `/uploads/${f.filename}`
      })),
      createdAt: new Date().toISOString()
    };

    posts.push(post);
    likes[post.id] = { '👍': [], '😂': [], '🧠': [], '💀': [] };
    comments[post.id] = [];
    savePosts(); saveLikes(); saveComments();

    const resp = postResponse(post);
    io.emit('newPost', resp);
    res.json(resp);
  } catch (err) { res.status(500).json({ error: '게시글 작성 실패: ' + err.message }); }
});

app.delete('/api/posts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { authorId } = req.body;
    const idx = posts.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: '게시글 없음' });
    if (posts[idx].authorId !== authorId) return res.status(403).json({ error: '권한 없음' });

    posts[idx].files.forEach(f => {
      const fp = path.join('uploads', f.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    posts.splice(idx, 1);
    delete likes[id]; delete comments[id];
    if (rankingsData.pinnedPostId === id) { rankingsData.pinnedPostId = null; saveRankings(); }
    if (rankingsData.recommendedPostId === id) { rankingsData.recommendedPostId = null; saveRankings(); }
    savePosts(); saveLikes(); saveComments();
    io.emit('deletePost', id);
    res.json({ success: true });
  } catch { res.status(500).json({ error: '삭제 실패' }); }
});

// =============================================
// API - 댓글
// =============================================
app.get('/api/posts/:id/comments', (req, res) => res.json(comments[req.params.id] || []));

app.post('/api/posts/:id/comments', (req, res) => {
  try {
    const { id } = req.params;
    const { content, author, authorId, authorColor, authorAvatar } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '내용 필요' });
    if (!posts.find(p => p.id === id)) return res.status(404).json({ error: '게시글 없음' });
    if (!comments[id]) comments[id] = [];
    const comment = {
      id: uuidv4(), postId: id,
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
  } catch { res.status(500).json({ error: '댓글 작성 실패' }); }
});

// =============================================
// API - 좋아요 (다중 타입)
// =============================================
app.post('/api/posts/:id/like', (req, res) => {
  try {
    const { id } = req.params;
    const { userId, type = '👍' } = req.body;
    if (!LIKE_TYPES.includes(type)) return res.status(400).json({ error: '잘못된 좋아요 타입' });
    if (!posts.find(p => p.id === id)) return res.status(404).json({ error: '게시글 없음' });

    if (!likes[id]) likes[id] = { '👍': [], '😂': [], '🧠': [], '💀': [] };

    // 기존 좋아요 타입 제거
    let prevType = null;
    for (const t of LIKE_TYPES) {
      const idx = likes[id][t].indexOf(userId);
      if (idx !== -1) { likes[id][t].splice(idx, 1); prevType = t; }
    }

    // 같은 타입 = 좋아요 취소, 다른 타입 = 변경
    let liked = false;
    if (prevType !== type) { likes[id][type].push(userId); liked = true; }

    saveLikes();
    const breakdown = getLikeBreakdown(id);
    const update = { postId: id, breakdown, totalLikes: getTotalLikes(id), userId, liked, type };
    io.emit('likeUpdate', update);
    res.json(update);
  } catch { res.status(500).json({ error: '좋아요 실패' }); }
});

// =============================================
// API - 파일 업로드
// =============================================
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일 없음' });
  res.json({ filename: req.file.filename, originalname: req.file.originalname,
             mimetype: req.file.mimetype, size: req.file.size, url: `/uploads/${req.file.filename}` });
});

app.post('/api/upload/avatar', uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '이미지 없음' });
  res.json({ url: `/uploads/avatars/${req.file.filename}` });
});

// =============================================
// API - 멤버 목록
// =============================================
app.get('/api/members', (req, res) => {
  const onlineUserIds = new Set(Object.values(onlineUsers).map(u => u.userId));
  const list = Object.values(members).map(m => ({
    ...m,
    isOnline: onlineUserIds.has(m.userId),
  })).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  res.json(list);
});

// 유저 프로필 상세
app.get('/api/users/:userId/profile', (req, res) => {
  const { userId } = req.params;
  const member = members[userId];
  if (!member) return res.status(404).json({ error: '사용자 없음' });
  const myPosts = posts.filter(p => p.authorId === userId);
  const breakdown = { '👍': 0, '😂': 0, '🧠': 0, '💀': 0 };
  let total = 0;
  for (const p of myPosts) {
    for (const t of LIKE_TYPES) {
      const cnt = likes[p.id]?.[t]?.length || 0;
      breakdown[t] += cnt; total += cnt;
    }
  }
  const ranked = enrichTop10(rankingsData.top10).find(u => u.userId === userId);
  const isOnline = Object.values(onlineUsers).some(u => u.userId === userId);
  res.json({
    ...member,
    isOnline,
    totalLikes: total,
    likeBreakdown: breakdown,
    postCount: myPosts.length,
    recentPosts: myPosts.reverse().slice(0, 5).map(postResponse),
    rank: ranked || null,
  });
});

// =============================================
// API - 랭킹
// =============================================
app.get('/api/rankings', (req, res) => {
  refreshRankings(); // 새 주면 재계산
  const top10 = enrichTop10(rankingsData.top10);
  const hof = rankingsData.hallOfFame ? {
    ...rankingsData.hallOfFame,
    consecutiveWins: rankingsData.rankHistory[rankingsData.hallOfFame.userId]?.consecutiveWins || 1,
    title: getTitle(1, rankingsData.hallOfFame.dominant,
      rankingsData.rankHistory[rankingsData.hallOfFame.userId]?.consecutiveWins || 1),
    badge: getBadge(1, rankingsData.hallOfFame.dominant,
      rankingsData.rankHistory[rankingsData.hallOfFame.userId]?.consecutiveWins || 1),
  } : null;
  res.json({ week: rankingsData.lastWeek, top10, hallOfFame: hof,
             pinnedPostId: rankingsData.pinnedPostId,
             recommendedPostId: rankingsData.recommendedPostId });
});

// 유저별 총 좋아요 합계 (프로필용)
app.get('/api/users/:userId/likes', (req, res) => {
  const { userId } = req.params;
  const myPosts = posts.filter(p => p.authorId === userId);
  const breakdown = { '👍': 0, '😂': 0, '🧠': 0, '💀': 0 };
  let total = 0;
  for (const p of myPosts) {
    for (const t of LIKE_TYPES) {
      const cnt = likes[p.id]?.[t]?.length || 0;
      breakdown[t] += cnt;
      total += cnt;
    }
  }
  res.json({ total, breakdown });
});

// =============================================
// API - 게시글 고정 (관리자 또는 명예의전당 1위)
// =============================================
app.post('/api/posts/:id/pin', (req, res) => {
  const { id } = req.params;
  const { userId, adminPassword } = req.body;
  if (!isAdmin(adminPassword) && !isHoFWinner(userId))
    return res.status(403).json({ error: '권한 없음' });
  if (!posts.find(p => p.id === id)) return res.status(404).json({ error: '게시글 없음' });

  rankingsData.pinnedPostId = rankingsData.pinnedPostId === id ? null : id;
  saveRankings();
  io.emit('pinnedPost', { postId: rankingsData.pinnedPostId });
  res.json({ success: true, postId: rankingsData.pinnedPostId });
});

// 오늘의 추천글 선정 (관리자 또는 명예의전당 1위)
app.post('/api/posts/:id/recommend', (req, res) => {
  const { id } = req.params;
  const { userId, adminPassword } = req.body;
  if (!isAdmin(adminPassword) && !isHoFWinner(userId))
    return res.status(403).json({ error: '권한 없음' });
  if (!posts.find(p => p.id === id)) return res.status(404).json({ error: '게시글 없음' });

  rankingsData.recommendedPostId = rankingsData.recommendedPostId === id ? null : id;
  saveRankings();
  io.emit('recommendedPost', { postId: rankingsData.recommendedPostId });
  res.json({ success: true, postId: rankingsData.recommendedPostId });
});

// =============================================
// API - 관리자
// =============================================
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  console.log(`[Admin] 입력 길이:${(password||'').length} / 서버 길이:${ADMIN_PASSWORD.length} / 일치:${isAdmin(password)}`);
  if (isAdmin(password)) res.json({ success: true });
  else res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
});

// 전체 공지 (익명 시스템 게시글로 올라감)
app.post('/api/admin/announce', (req, res) => {
  const { password, message } = req.body;
  if (!isAdmin(password)) return res.status(401).json({ error: '권한 없음' });
  if (!message?.trim()) return res.status(400).json({ error: '내용 없음' });

  const sysPost = {
    id: uuidv4(),
    content: message.trim().slice(0, 500),
    author: '운영진',
    authorId: 'admin',
    authorColor: '#dc2626',
    authorAvatar: null,
    isAnnouncement: true,
    files: [],
    createdAt: new Date().toISOString()
  };

  posts.push(sysPost);
  likes[sysPost.id] = { '👍': [], '😂': [], '🧠': [], '💀': [] };
  comments[sysPost.id] = [];
  savePosts(); saveLikes(); saveComments();

  io.emit('newPost', postResponse(sysPost));
  io.emit('announcement', { message: message.trim(), createdAt: sysPost.createdAt });
  res.json({ success: true });
});

// 게시글 강제 삭제
app.delete('/api/admin/posts/:id', (req, res) => {
  const { password } = req.body;
  if (!isAdmin(password)) return res.status(401).json({ error: '권한 없음' });
  const { id } = req.params;
  const idx = posts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: '게시글 없음' });

  posts[idx].files.forEach(f => {
    const fp = path.join('uploads', f.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  posts.splice(idx, 1);
  delete likes[id]; delete comments[id];
  if (rankingsData.pinnedPostId === id) { rankingsData.pinnedPostId = null; saveRankings(); }
  if (rankingsData.recommendedPostId === id) { rankingsData.recommendedPostId = null; saveRankings(); }
  savePosts(); saveLikes(); saveComments();
  io.emit('deletePost', id);
  res.json({ success: true });
});

// 경고 메시지 (소켓으로 특정 유저에게 전송)
app.post('/api/admin/warn', (req, res) => {
  const { password, targetSocketId, message } = req.body;
  if (!isAdmin(password)) return res.status(401).json({ error: '권한 없음' });

  const target = io.sockets.sockets.get(targetSocketId);
  if (!target) return res.status(404).json({ error: '사용자 없음 (오프라인)' });

  target.emit('adminWarning', { message: (message || '커뮤니티 이용 규칙을 위반하셨습니다. 주의해 주세요.').slice(0, 200), createdAt: new Date().toISOString() });
  res.json({ success: true });
});

// =============================================
// API - 블록 코딩 게임
// =============================================
app.get('/api/block-games', (req, res) => {
  res.json(blockGames.filter(g => g.status === 'approved').slice().reverse().slice(0, 50));
});

app.get('/api/block-games/pending', (req, res) => {
  const { password } = req.query;
  if (!isAdmin(password)) return res.status(401).json({ error: '권한 없음' });
  res.json(blockGames.filter(g => g.status === 'pending').slice().reverse());
});

app.get('/api/block-games/:id', (req, res) => {
  const game = blockGames.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: '게임 없음' });
  res.json(game);
});

app.post('/api/block-games', (req, res) => {
  const { userId, nickname, title, program, thumbnail } = req.body;
  if (!title?.trim() || !program) return res.status(400).json({ error: '제목과 프로그램 필요' });
  const pending = blockGames.filter(g => g.userId === userId && g.status === 'pending').length;
  if (pending >= 3) return res.status(429).json({ error: '심사 대기 중인 게임이 3개 이상입니다.' });
  const game = {
    id: uuidv4(),
    userId: userId || 'unknown',
    nickname: (nickname || '익명').slice(0, 20),
    title: title.trim().slice(0, 50),
    program,
    thumbnail: thumbnail || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    approvedAt: null,
    adminComment: '',
    playCount: 0,
  };
  blockGames.push(game);
  saveBlockGames();
  res.json({ success: true, id: game.id });
});

app.post('/api/block-games/:id/approve', (req, res) => {
  const { password, comment } = req.body;
  if (!isAdmin(password)) return res.status(401).json({ error: '권한 없음' });
  const game = blockGames.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: '게임 없음' });
  game.status = 'approved';
  game.adminComment = (comment || '').slice(0, 200);
  game.approvedAt = new Date().toISOString();
  saveBlockGames();
  const tu = Object.values(onlineUsers).find(u => u.userId === game.userId);
  if (tu) io.to(tu.socketId).emit('blockGameApproved', { gameId: game.id, title: game.title });
  res.json({ success: true });
});

app.post('/api/block-games/:id/reject', (req, res) => {
  const { password, comment } = req.body;
  if (!isAdmin(password)) return res.status(401).json({ error: '권한 없음' });
  const game = blockGames.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: '게임 없음' });
  game.status = 'rejected';
  game.adminComment = (comment || '').slice(0, 200);
  saveBlockGames();
  const tu = Object.values(onlineUsers).find(u => u.userId === game.userId);
  if (tu) io.to(tu.socketId).emit('blockGameRejected', { gameId: game.id, title: game.title, comment: game.adminComment });
  res.json({ success: true });
});

app.delete('/api/block-games/:id', (req, res) => {
  const { password } = req.body;
  if (!isAdmin(password)) return res.status(401).json({ error: '권한 없음' });
  const idx = blockGames.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '게임 없음' });
  blockGames.splice(idx, 1);
  saveBlockGames();
  res.json({ success: true });
});

app.post('/api/block-games/:id/play', (req, res) => {
  const game = blockGames.find(g => g.id === req.params.id);
  if (game) { game.playCount = (game.playCount || 0) + 1; saveBlockGames(); }
  res.json({ success: true });
});

// 온라인 유저 목록 (관리자용)
app.get('/api/admin/users', (req, res) => {
  const { password } = req.query;
  if (!isAdmin(password)) return res.status(401).json({ error: '권한 없음' });
  res.json(Object.values(onlineUsers).map(u => ({
    socketId: u.socketId, nickname: u.nickname, userId: u.userId, joinedAt: u.joinedAt
  })));
});

// =============================================
// Socket.io
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
    const taken = Object.values(onlineUsers).some(u => u.nickname === nickname);
    if (taken) { socket.emit('nicknameTaken', { nickname }); return; }

    const userId = userData.userId || socket.id;
    onlineUsers[socket.id] = {
      socketId: socket.id,
      nickname,
      userId,
      color: userData.color || '#2563eb',
      avatarUrl: userData.avatarUrl || null,
      bio: (userData.bio || '').slice(0, 100),
      joinedAt: new Date().toISOString()
    };

    // 멤버 기록
    members[userId] = {
      userId,
      nickname,
      color: userData.color || '#2563eb',
      avatarUrl: userData.avatarUrl || null,
      bio: (userData.bio || '').slice(0, 100),
      firstSeen: members[userId]?.firstSeen || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    saveMembers();

    socket.join('global');
    io.emit('onlineUsers', Object.values(onlineUsers));
    io.emit('membersUpdate', Object.values(members));
    io.emit('systemMessage', { type: 'join', nickname, message: `${nickname}님이 입장하셨습니다.`, createdAt: new Date().toISOString() });
    socket.emit('groupRooms', Object.values(groupRooms));
    socket.emit('globalHistory', globalMessages.slice(-50));
    // 랭킹 정보도 함께 전송
    refreshRankings();
    socket.emit('rankingsUpdate', enrichTop10(rankingsData.top10));
  });

  socket.on('updateNickname', ({ newNickname }) => {
    if (onlineUsers[socket.id]) {
      const old = onlineUsers[socket.id].nickname;
      onlineUsers[socket.id].nickname = newNickname;
      io.emit('onlineUsers', Object.values(onlineUsers));
      io.emit('systemMessage', { type: 'rename', message: `${old}님이 ${newNickname}으로 닉네임을 변경하셨습니다.`, createdAt: new Date().toISOString() });
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
      id: uuidv4(), content: (data.content || '').slice(0, 1000),
      author: user.nickname, authorId: user.userId, authorColor: user.color,
      authorAvatar: user.avatarUrl || null, socketId: socket.id,
      file: data.file || null, createdAt: new Date().toISOString()
    };
    globalMessages.push(msg);
    if (globalMessages.length > 200) globalMessages.shift();
    io.emit('globalMessage', msg);
  });

  // DM
  socket.on('directMessage', (data) => {
    const { toSocketId, content, file } = data;
    const user = onlineUsers[socket.id];
    if (!user) return;
    const msg = {
      id: uuidv4(), fromSocketId: socket.id, toSocketId,
      fromNickname: user.nickname, fromColor: user.color,
      fromAvatar: user.avatarUrl || null,
      content: (content || '').slice(0, 1000), file: file || null,
      createdAt: new Date().toISOString()
    };
    const key = [socket.id, toSocketId].sort().join('__');
    if (!directMessages[key]) directMessages[key] = [];
    directMessages[key].push(msg);
    if (directMessages[key].length > 200) directMessages[key].shift();
    socket.emit('directMessage', msg);
    if (io.sockets.sockets.get(toSocketId)) io.to(toSocketId).emit('directMessage', msg);
  });

  socket.on('getDMHistory', ({ otherSocketId }) => {
    const key = [socket.id, otherSocketId].sort().join('__');
    socket.emit('dmHistory', { otherSocketId, messages: directMessages[key] || [] });
  });

  // 그룹 채팅
  socket.on('createGroupRoom', ({ name }) => {
    const user = onlineUsers[socket.id];
    if (!user) return;
    const room = { id: uuidv4(), name: name.slice(0, 30), creatorSocketId: socket.id,
                   creatorNickname: user.nickname, members: [socket.id], messages: [],
                   createdAt: new Date().toISOString() };
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
    const msg = { id: uuidv4(), roomId, content: (content || '').slice(0, 1000),
                  author: user.nickname, authorId: user.userId, authorColor: user.color,
                  authorAvatar: user.avatarUrl || null, socketId: socket.id,
                  file: file || null, createdAt: new Date().toISOString() };
    room.messages.push(msg);
    if (room.messages.length > 200) room.messages.shift();
    io.to(roomId).emit('groupMessage', msg);
  });

  // 타이핑
  socket.on('typing', ({ channel, roomId }) => {
    const user = onlineUsers[socket.id];
    if (!user) return;
    socket.broadcast.emit('userTyping', { socketId: socket.id, nickname: user.nickname, channel, roomId });
  });
  socket.on('stopTyping', ({ channel, roomId }) => {
    socket.broadcast.emit('userStopTyping', { socketId: socket.id, channel, roomId });
  });

  socket.on('disconnect', () => {
    const user = onlineUsers[socket.id];
    delete onlineUsers[socket.id];
    io.emit('onlineUsers', Object.values(onlineUsers));
    if (user) io.emit('systemMessage', { type: 'leave', nickname: user.nickname, message: `${user.nickname}님이 퇴장하셨습니다.`, createdAt: new Date().toISOString() });
    // 게임방 정리
    for (const roomId in gameRooms) {
      const room = gameRooms[roomId];
      if (room.players.some(p => p.socketId === socket.id)) {
        io.to(`game-${roomId}`).emit('gameOpponentLeft');
        delete gameRooms[roomId];
        io.emit('gameRoomsList', Object.values(gameRooms));
      }
    }
    console.log(`[해제] ${socket.id}`);
  });

  // =============================================
  // 게임 Socket 이벤트
  // =============================================
  socket.on('getGameRooms', () => {
    socket.emit('gameRoomsList', Object.values(gameRooms));
  });

  socket.on('createGameRoom', ({ gameType, nickname }) => {
    const room = {
      id: uuidv4(),
      gameType,
      players: [{ socketId: socket.id, nickname: nickname || onlineUsers[socket.id]?.nickname || '익명' }],
      createdAt: new Date().toISOString(),
    };
    gameRooms[room.id] = room;
    socket.join(`game-${room.id}`);
    socket.emit('gameRoomCreated', room);
    io.emit('gameRoomsList', Object.values(gameRooms));
  });

  socket.on('joinGameRoom', ({ roomId }) => {
    const room = gameRooms[roomId];
    if (!room) { socket.emit('gameRoomError', { message: '방을 찾을 수 없습니다.' }); return; }
    if (room.players.length >= 2) { socket.emit('gameRoomError', { message: '방이 가득 찼습니다.' }); return; }
    room.players.push({ socketId: socket.id, nickname: onlineUsers[socket.id]?.nickname || '익명' });
    socket.join(`game-${room.id}`);
    io.to(`game-${room.id}`).emit('gameRoomReady', room);
    io.emit('gameRoomsList', Object.values(gameRooms));
  });

  socket.on('gameMove', ({ roomId, move }) => {
    socket.to(`game-${roomId}`).emit('gameMove', { move, socketId: socket.id });
  });

  socket.on('gameEnd', ({ roomId, result }) => {
    if (gameRooms[roomId]) {
      io.to(`game-${roomId}`).emit('gameEnd', result);
      delete gameRooms[roomId];
      io.emit('gameRoomsList', Object.values(gameRooms));
    }
  });

  socket.on('leaveGameRoom', ({ roomId }) => {
    if (gameRooms[roomId]) {
      socket.to(`game-${roomId}`).emit('gameOpponentLeft');
      delete gameRooms[roomId];
      io.emit('gameRoomsList', Object.values(gameRooms));
    }
    socket.leave(`game-${roomId}`);
  });
});

// =============================================
// Render Keep-Alive
// =============================================
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    https.get(process.env.RENDER_EXTERNAL_URL, (res) => console.log(`[Keep-Alive] ${res.statusCode}`))
         .on('error', e => console.error('[Keep-Alive]', e.message));
  }, 14 * 60 * 1000);
  console.log('[Keep-Alive] 활성화');
}

// =============================================
// 서버 시작
// =============================================
// MongoDB 초기화 후 서버 시작
const PORT = process.env.PORT || 3000;
initMongo().finally(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n ====================================`);
    console.log(`  과천중 비밀게시판 서버 시작!`);
    console.log(`  http://localhost:${PORT}`);
    console.log(` ====================================\n`);
    console.log(`[데이터] 게시글 ${posts.length}개 / 랭킹: ${rankingsData.lastWeek || '미계산'}`);
  });
});

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
