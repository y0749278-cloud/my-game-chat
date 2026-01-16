const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 1e8,
    cors: { origin: "*" } 
});

// ПУТЬ К БАЗЕ ДАННЫХ (ФАЙЛ)
const DB_FILE = './database.json';
let db = { accounts: {}, chats: {}, history: [] };

// Загрузка данных при старте сервера
if (fs.existsSync(DB_FILE)) {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        db = JSON.parse(data);
        console.log("База данных загружена успешно");
    } catch (e) {
        console.log("Ошибка загрузки базы, создаем новую");
    }
}

// Функция сохранения
function saveDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error("Ошибка сохранения файла:", e);
    }
}

io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);

    // ВХОД И РЕГИСТРАЦИЯ
    socket.on('server_auth', (data) => {
        const { name, pass, type } = data;
        
        if (type === 'reg') {
            if (db.accounts[name]) {
                return socket.emit('auth_error', 'Это имя уже занято!');
            }
            const newUser = { 
                name, 
                pass, 
                id: Math.floor(1000 + Math.random() * 8999) 
            };
            db.accounts[name] = newUser;
            db.chats[newUser.id] = [];
            saveDB();
            socket.emit('auth_success', { name: newUser.name, id: newUser.id });
        } else {
            const acc = db.accounts[name];
            if (acc && acc.pass === pass) {
                socket.emit('auth_success', { name: acc.name, id: acc.id });
                socket.emit('sync_chats', db.chats[acc.id] || []);
            } else {
                socket.emit('auth_error', 'Неверный логин или пароль!');
            }
        }
    });

    socket.on('register_me', (id) => { 
        socket.myId = id; 
        socket.join("user-" + id); 
    });

    socket.on('join_room', (room) => { 
        socket.join(room); 
        const roomHistory = db.history.filter(m => m.room === room).slice(-50);
        socket.emit('load_history', roomHistory);
    });

    socket.on('send_msg', (data) => {
        const msg = { 
            id: Date.now() + Math.random(), 
            date: new Date(),
            ...data 
        };
        
        db.history.push(msg);
        if (db.history.length > 1000) db.history.shift(); // Ограничение истории
        
        io.to(data.room).emit('new_msg', msg);
        
        // Логика для Личных Сообщений (ЛС)
        if(data.isPrivate) {
            const room = data.room;
            [data.userId, data.toId].forEach(uid => {
                if(!db.chats[uid]) db.chats[uid] = [];
                if(!db.chats[uid].find(c => c.room === room)) {
                    db.chats[uid].push({ 
                        name: data.userName, 
                        room, 
                        type: 'private', 
                        tid: data.userId 
                    });
                }
            });
            saveDB();
            io.to("user-" + data.toId).emit('private_request', { 
                fromName: data.userName, 
                fromId: data.userId, 
                room: data.room 
            });
        }
    });

    socket.on('save_chat_to_server', (data) => {
        if(!db.chats[data.uid]) db.chats[data.uid] = [];
        if(!db.chats[data.uid].find(c => c.room === data.chat.room)) {
            db.chats[data.uid].push(data.chat);
            saveDB();
        }
    });
});

// КЛИЕНТСКИЙ ИНТЕРФЕЙС (ФРОНТЕНД)
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-CHAT ULTRA</title>
    <style>
        :root { --bg: #0b0e14; --panel: #151921; --accent: #7c3aed; --text: #ffffff; }
        * { box-sizing: border-box; outline: none; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        html, body { overscroll-behavior-y: contain; background: var(--bg); color: var(--text); height: 100%; font-family: sans-serif; overflow: hidden; }
        body { display: flex; }
        #auth-screen, .modal-overlay { position: fixed; inset: 0; background: rgba(7, 8, 12, 0.98); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(15px); padding: 20px; }
        .glass-box { background: var(--panel); padding: 30px; border-radius: 28px; width: 100%; max-width: 320px; border: 1px solid rgba(255,255,255,0.1); text-align: center; }
        input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 15px; border-radius: 15px; margin-bottom: 12px; }
        #sidebar { width: 260px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; border-bottom: 2px solid var(--accent); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border-radius: 18px; cursor: pointer; }
        .room-btn.active { background: rgba(124, 58, 237, 0.2); border: 1px solid var(--accent); }
        #chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #07080c; }
        .top-bar { height: 65px; padding: 0 20px; background: var(--panel); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; overscroll-behavior: contain; }
        .msg { max-width: 85%; padding: 12px 18px; border-radius: 22px; font-size: 14px; position: relative; }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 4px; }
        .msg.them { align-self: flex-start; background: #1e293b; border-bottom-left-radius: 4px; }
        #input-zone { padding: 15px; background: var(--panel); display: flex; gap: 10px; align-items: center; border-top: 1px solid #1e293b; }
        #msg-in { flex: 1; border-radius: 30px; height: 45px; padding: 0 15px; background: #000; border: 1px solid #333; color: #fff; }
        .btn { background: var(--accent); border: none; color: white; padding: 12px 20px; border-radius: 15px; font-weight: bold; cursor: pointer; }
        .icon-btn { font-size: 24px; cursor: pointer; color: #a1a1aa; user-select: none; }
        .rec-active { display: none; background: #ee4444; color: white; padding: 8px 15px; border-radius: 20px; font-weight: bold; }
        @media (max-width: 768px) { #sidebar { position: fixed; left: -260px; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>
    <div id="auth-screen">
        <div class="glass-box">
            <h2 style="color:var(--accent); margin-bottom:20px;">G-CHAT</h2>
            <input type="text" id="a-name" placeholder="Логин">
            <input type="password" id="a-pass" placeholder="Пароль">
            <button onclick="auth('login')" class="btn" style="width:100%; margin-bottom:12px;">ВОЙТИ</button>
            <button onclick="auth('reg')" class="btn" style="width:100%; background:#222;">РЕГИСТРАЦИЯ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <b id="u-name">...</b><br>
            <span id="u-id" style="font-size:12px; color:var(--accent)"></span>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:15px; display:flex; gap:8px;">
            <button onclick="openM('Группа', 1)" class="btn" style="flex:1;">+ ГРУППА</button>
            <button onclick="openM('Личка', 2)" class="btn" style="flex:1; background:#222;">+ ЛС</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="document.getElementById('sidebar').classList.toggle('open')" style="background:none; border:none; color:white; font-size:28px;">☰</button>
            <b id="c-title">Выберите чат</b>
            <div id="rec-status" class="rec-active">ЗАПИСЬ...</div>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <span class="icon-btn" onclick="document.getElementById('file-in').click()">📎</span>
            <input type="file" id="file-in" hidden onchange="upFile()">
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <span id="mic-btn" class="icon-btn">🎤</span>
            <button onclick="sendMsg()" class="btn">➤</button>
        </div>
    </div>

    <div id="modal-overlay" class="modal-overlay" style="display:none;">
        <div class="glass-box">
            <b id="m-title" style="display:block; margin-bottom:15px;"></b>
            <input type="text" id="m-i1" placeholder="Имя">
            <input type="text" id="m-i2" placeholder="ID друга" style="display:none;">
            <button id="m-ok" class="btn" style="width:100%;">ОК</button>
            <button onclick="closeM()" class="btn" style="width:100%; background:#222; margin-top:10px;">ОТМЕНА</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let user = JSON.parse(localStorage.getItem('g_u_v12'));
        let chats = JSON.parse(localStorage.getItem('g_c_v12')) || [];
        let curRoom = null;
        let recorder, chunks = [];

        function auth(type) {
            const name = document.getElementById('a-name').value.trim();
            const pass = document.getElementById('a-pass').value.trim();
            if(!name || !pass) return;
            socket.emit('server_auth', { name, pass, type });
        }

        socket.on('auth_success', acc => {
            user = acc;
            localStorage.setItem('g_u_v12', JSON.stringify(user));
            document.getElementById('auth-screen').style.display='none';
            socket.emit('register_me', user.id);
            upd();
        });

        socket.on('sync_chats', sChats => {
            chats = sChats;
            localStorage.setItem('g_c_v12', JSON.stringify(chats));
            upd();
        });

        socket.on('auth_error', msg => alert(msg));

        if(user) {
            document.getElementById('auth-screen').style.display='none';
            socket.emit('register_me', user.id);
            upd();
        }

        // МИКРОФОН
        const micBtn = document.getElementById('mic-btn');
        micBtn.addEventListener('touchstart', e => { e.preventDefault(); startV(); });
        micBtn.addEventListener('touchend', e => { e.preventDefault(); stopV(); });
        micBtn.addEventListener('mousedown', startV);
        micBtn.addEventListener('mouseup', stopV);

        async function startV() {
            try {
                const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                recorder = new MediaRecorder(s, { mimeType: 'audio/webm' });
                chunks = [];
                recorder.ondataavailable = e => chunks.push(e.data);
                recorder.start();
                document.getElementById('rec-status').style.display = 'block';
            } catch(e) { alert("Включи микрофон!"); }
        }

        function stopV() {
            if(!recorder) return;
            recorder.stop();
            document.getElementById('rec-status').style.display = 'none';
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const r = new FileReader();
                r.onload = () => {
                    const c = chats.find(x => x.room === curRoom);
                    socket.emit('send_msg', {
                        room: curRoom, userId: user.id, userName: user.name, 
                        content: r.result, type: 'voice', isPrivate: c?.type==='private', toId: c?.tid
                    });
                };
                r.readAsDataURL(blob);
                recorder = null;
            };
        }

        function openM(t, f) {
            document.getElementById('modal-overlay').style.display='flex';
            document.getElementById('m-title').innerText = t;
            document.getElementById('m-i2').style.display = f===2?'block':'none';
            document.getElementById('m-ok').onclick = () => {
                const n1 = document.getElementById('m-i1').value;
                const n2 = document.getElementById('m-i2').value;
                if(f===1 && n1) {
                    const r = 'grp_'+Date.now();
                    const chat = {name:n1, room:r, type:'group', admin:user.id};
                    chats.push(chat);
                    socket.emit('save_chat_to_server', {uid: user.id, chat});
                    switchR(r);
                } else if(f===2 && n1 && n2) {
                    const r = [user.id, parseInt(n2)].sort().join('_');
                    const chat = {name:n1, room:r, type:'private', tid:parseInt(n2)};
                    if(!chats.find(x=>x.room===r)) {
                        chats.push(chat);
                        socket.emit('save_chat_to_server', {uid: user.id, chat});
                    }
                    switchR(r);
                }
                closeM();
            };
        }
        function closeM() { document.getElementById('modal-overlay').style.display='none'; }

        function switchR(r) {
            curRoom = r;
            const c = chats.find(x=>x.room===r);
            document.getElementById('c-title').innerText = c ? c.name : "Чат";
            document.getElementById('messages').innerHTML = '';
            socket.emit('join_room', r);
            upd();
            document.getElementById('sidebar').classList.remove('open');
        }

        function sendMsg() {
            const i = document.getElementById('msg-in');
            const c = chats.find(x=>x.room===curRoom);
            if(i.value && curRoom) {
                socket.emit('send_msg', { 
                    room:curRoom, userId:user.id, userName:user.name, 
                    content:i.value, type:'text', isPrivate: c?.type==='private', toId: c?.tid 
                });
                i.value = '';
            }
        }

        function upFile() {
            const f = document.getElementById('file-in').files[0];
            const r = new FileReader();
            r.onload = () => {
                const c = chats.find(x=>x.room===curRoom);
                socket.emit('send_msg', {
                    room:curRoom, userId:user.id, userName:user.name, 
                    content:r.result, type:'file', fileName:f.name, isPrivate: c?.type==='private', toId: c?.tid
                });
            };
            r.readAsDataURL(f);
        }

        function render(m) {
            if(document.getElementById('m-'+m.id)) return;
            const b = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId==user.id?'me':'them');
            d.id = 'm-'+m.id;
            let html = m.content;
            if(m.type==='voice') html = '<audio src="'+m.content+'" controls style="max-width:200px; height:40px; filter:invert(1)"></audio>';
            if(m.type==='file') {
                if(m.content.startsWith('data:image')) html = '<img src="'+m.content+'" style="max-width:100%; border-radius:12px;">';
                else html = '<a href="'+m.content+'" download="'+m.fileName+'" style="color:#fff;">📄 '+m.fileName+'</a>';
            }
            d.innerHTML = '<div style="font-size:10px; opacity:0.5;"><b>'+m.userName+'</b></div>' + html;
            b.appendChild(d);
            b.scrollTop = b.scrollHeight;
        }

        socket.on('new_msg', render);
        socket.on('load_history', h => h.forEach(render));
        socket.on('private_request', d => {
            if(!chats.find(c => c.room === d.room)) {
                chats.push({ name: d.fromName, room: d.room, type: 'private', tid: d.fromId });
                upd();
            }
        });

        function upd() {
            if(!user) return;
            document.getElementById('u-name').innerText = user.name;
            document.getElementById('u-id').innerText = "ID: " + user.id;
            const l = document.getElementById('rooms-list');
            l.innerHTML = '';
            chats.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (curRoom===c.room?' active':'');
                d.onclick = () => switchR(c.room);
                d.innerHTML = '<b>' + c.name + '</b>';
                l.appendChild(d);
            });
        }
    </script>
</body>
</html>
    `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Сервер запущен на порту ' + PORT));
