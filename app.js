const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

const DB_FILE = './database.json';
let db = { accounts: {}, chats: {}, history: [] };

// Загрузка базы
if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } 
    catch (e) { console.log("Ошибка чтения базы"); }
}

function saveDB() {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } 
    catch (e) { console.log("Ошибка записи базы"); }
}

io.on('connection', (socket) => {
    // 1. АВТОРИЗАЦИЯ
    socket.on('server_auth', (data) => {
        const { name, pass, type } = data;
        if (type === 'reg') {
            if (db.accounts[name]) return socket.emit('auth_error', 'Имя занято!');
            const newUser = { name, pass, id: Math.floor(10000 + Math.random() * 89999) }; // 5 знаков ID
            db.accounts[name] = newUser;
            db.chats[newUser.id] = [];
            saveDB();
            socket.emit('auth_success', newUser);
        } else {
            const acc = db.accounts[name];
            if (acc && acc.pass === pass) {
                socket.emit('auth_success', acc);
                socket.emit('sync_chats', db.chats[acc.id] || []);
            } else socket.emit('auth_error', 'Неверный пароль!');
        }
    });

    socket.on('register_me', (id) => { 
        socket.myId = id; 
        socket.join("user-" + id); 
    });

    // 2. ВХОД В КОМНАТУ
    socket.on('join_room', (room) => { 
        socket.join(room); 
        // Отправляем только актуальные сообщения (без удаленных)
        const roomHistory = db.history.filter(m => m.room === room);
        socket.emit('load_history', roomHistory);
    });

    // 3. ОТПРАВКА СООБЩЕНИЯ
    socket.on('send_msg', (data) => {
        const msg = { id: Date.now() + Math.random(), date: new Date(), ...data };
        db.history.push(msg);
        if (db.history.length > 3000) db.history.shift();
        
        io.to(data.room).emit('new_msg', msg);
        
        // Логика ЛС (автодобавление чата)
        if(data.isPrivate) {
            [data.userId, data.toId].forEach(uid => {
                if(!db.chats[uid]) db.chats[uid] = [];
                if(!db.chats[uid].find(c => c.room === data.room)) {
                    db.chats[uid].push({ name: data.userName, room: data.room, type: 'private', tid: data.userId });
                }
            });
            io.to("user-" + data.toId).emit('private_request', { fromName: data.userName, fromId: data.userId, room: data.room });
        }
        saveDB();
    });

    // 4. УДАЛЕНИЕ СООБЩЕНИЯ (ИСПРАВЛЕНО)
    socket.on('delete_msg', (data) => {
        const index = db.history.findIndex(m => m.id == data.id); // Используем == для надежности
        if (index !== -1) {
            db.history.splice(index, 1); // Полное удаление из массива
            saveDB(); // Мгновенное сохранение в файл
            io.to(data.room).emit('msg_deleted', data.id);
        }
    });

    // 5. ДОБАВЛЕНИЕ ЧЕЛОВЕКА В ГРУППУ (НОВОЕ)
    socket.on('add_user_to_group', (data) => {
        const { targetId, room, chatName } = data;
        const targetIdInt = parseInt(targetId);
        
        // Ищем пользователя с таким ID
        const targetUserKey = Object.keys(db.accounts).find(key => db.accounts[key].id === targetIdInt);
        
        if (targetUserKey) {
            if (!db.chats[targetIdInt]) db.chats[targetIdInt] = [];
            // Проверка на дубликат
            if (!db.chats[targetIdInt].find(c => c.room === room)) {
                const newChat = { name: chatName, room: room, type: 'group', admin: null };
                db.chats[targetIdInt].push(newChat);
                saveDB();
                // Обновляем список чатов у того, кого добавили
                io.to("user-" + targetIdInt).emit('sync_chats', db.chats[targetIdInt]);
                io.to("user-" + targetIdInt).emit('force_alert', `Вас добавили в группу "${chatName}"`);
            }
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

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-Chat v3</title>
    <style>
        :root { --bg: #0b0e14; --panel: #151921; --accent: #7c3aed; --text: #ffffff; --danger: #ef4444; }
        * { box-sizing: border-box; outline: none; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        html, body { overscroll-behavior-y: contain; background: var(--bg); color: var(--text); height: 100%; font-family: sans-serif; overflow: hidden; }
        body { display: flex; }
        
        /* ВХОД */
        #auth-screen { position: fixed; inset: 0; background: rgba(7, 8, 12, 0.98); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(15px); padding: 20px; }
        .glass-box { background: var(--panel); padding: 30px; border-radius: 28px; width: 100%; max-width: 320px; border: 1px solid rgba(255,255,255,0.1); text-align: center; }
        input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 15px; border-radius: 15px; margin-bottom: 12px; font-size: 16px; }
        
        /* SIDEBAR И ПРОФИЛЬ */
        #sidebar { width: 260px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; border-bottom: 2px solid var(--accent); display: flex; justify-content: space-between; align-items: center; }
        .profile-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--accent); }
        
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border-radius: 18px; cursor: pointer; }
        .room-btn.active { background: rgba(124, 58, 237, 0.2); border: 1px solid var(--accent); }

        /* ЧАТ */
        #chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #07080c; }
        .top-bar { height: 65px; padding: 0 20px; background: var(--panel); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
        #add-user-btn { display: none; background: #333; color: white; border: none; padding: 8px 12px; border-radius: 10px; font-weight: bold; cursor: pointer; }
        
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; overscroll-behavior: contain; }
        .msg { max-width: 85%; padding: 12px 18px; border-radius: 22px; font-size: 14px; position: relative; }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 4px; }
        .msg.them { align-self: flex-start; background: #1e293b; border-bottom-left-radius: 4px; }

        /* ВВОД */
        #input-zone { padding: 12px; background: var(--panel); display: flex; gap: 10px; align-items: center; border-top: 1px solid #1e293b; position: relative; }
        #msg-in { flex: 1; border-radius: 30px; height: 45px; padding: 0 15px; background: #000; border: 1px solid #333; color: #fff; }
        .btn { background: var(--accent); border: none; color: white; padding: 12px 20px; border-radius: 15px; font-weight: bold; cursor: pointer; }
        .icon-btn { font-size: 24px; cursor: pointer; color: #a1a1aa; padding: 5px; }
        
        /* ГОЛОСОВЫЕ */
        #voice-panel { display: none; position: absolute; inset: 0; background: var(--panel); align-items: center; padding: 0 20px; gap: 15px; z-index: 10; }
        .voice-status { flex: 1; color: #fff; font-weight: bold; animation: pulse 1.5s infinite; }
        .voice-btn { width: 45px; height: 45px; border-radius: 50%; border: none; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; }
        @keyframes pulse { 0% { opacity: 0.7; } 50% { opacity: 1; } 100% { opacity: 0.7; } }

        /* МОДАЛКИ */
        .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:2000; align-items:center; justify-content:center; }
        @media (max-width: 768px) { #sidebar { position: fixed; left: -260px; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="glass-box">
            <h2 style="color:var(--accent); margin-bottom:20px;">G-CHAT</h2>
            <div id="quick-login-box" style="display:none; margin-bottom:15px;">
                 <button onclick="quickLogin()" class="btn" style="width:100%; background:#333; border:1px solid var(--accent);">Войти как <b id="ql-name"></b></button>
            </div>
            <input type="text" id="a-name" placeholder="Логин">
            <input type="password" id="a-pass" placeholder="Пароль">
            <button onclick="auth('login')" class="btn" style="width:100%; margin-bottom:12px;">ВОЙТИ</button>
            <button onclick="auth('reg')" class="btn" style="width:100%; background:#222;">РЕГИСТРАЦИЯ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <div>
                <b id="u-name">...</b><br>
                <span id="u-id" style="font-size:12px; opacity:0.7">ID: ...</span>
            </div>
            <button class="profile-btn" onclick="openProfile()">⚙️</button>
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
            <b id="c-title">Чат</b>
            <button id="add-user-btn" onclick="openAddUser()">👤+</button>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <div id="voice-panel">
                <div class="voice-status">🔴 Запись...</div>
                <button class="voice-btn" style="background:#333; color:red;" onclick="stopVoice(false)">✖</button>
                <button class="voice-btn" style="background:green; color:white;" onclick="stopVoice(true)">✔</button>
            </div>
            <span class="icon-btn" onclick="document.getElementById('file-in').click()">📎</span>
            <input type="file" id="file-in" hidden onchange="upFile()">
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <span class="icon-btn" onclick="startVoice()">🎤</span>
            <button onclick="sendMsg()" class="btn">➤</button>
        </div>
    </div>

    <div id="profile-modal" class="modal-overlay">
        <div class="glass-box">
            <h3>ПРОФИЛЬ</h3>
            <p style="margin:10px 0; opacity:0.7;">Логин: <b id="p-name" style="color:#fff;"></b></p>
            <p style="margin:10px 0; opacity:0.7;">Пароль: <b id="p-pass" style="color:#fff;"></b></p>
            <p style="margin:10px 0; opacity:0.7;">ID: <b id="p-id" style="color:var(--accent); font-size:18px;"></b></p>
            <button onclick="logout()" class="btn" style="width:100%; background:red; margin-top:15px;">ВЫЙТИ</button>
            <button onclick="document.getElementById('profile-modal').style.display='none'" class="btn" style="width:100%; background:#222; margin-top:10px;">ЗАКРЫТЬ</button>
        </div>
    </div>

    <div id="general-modal" class="modal-overlay">
        <div class="glass-box">
            <b id="m-title" style="display:block; margin-bottom:15px; color:#fff;"></b>
            <input type="text" id="m-i1" placeholder="Введите данные">
            <input type="text" id="m-i2" placeholder="ID друга" style="display:none;">
            <button id="m-ok" class="btn" style="width:100%;">ОК</button>
            <button onclick="document.getElementById('general-modal').style.display='none'" class="btn" style="width:100%; background:#222; margin-top:10px;">ОТМЕНА</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let user = null;
        let chats = [];
        let curRoom = null;
        let recorder, chunks = [];

        // АВТО-ЛОГИН ПРИ СТАРТЕ
        const saved = JSON.parse(localStorage.getItem('g_creds'));
        if(saved) {
            document.getElementById('quick-login-box').style.display = 'block';
            document.getElementById('ql-name').innerText = saved.name;
        }

        function quickLogin() {
            if(saved) {
                document.getElementById('a-name').value = saved.name;
                document.getElementById('a-pass').value = saved.pass;
                auth('login');
            }
        }

        function auth(type) {
            const name = document.getElementById('a-name').value.trim();
            const pass = document.getElementById('a-pass').value.trim();
            if(!name || !pass) return alert("Заполни поля!");
            if(type === 'login') localStorage.setItem('g_creds', JSON.stringify({name, pass}));
            socket.emit('server_auth', { name, pass, type });
        }

        socket.on('auth_success', acc => {
            user = acc;
            document.getElementById('auth-screen').style.display = 'none';
            socket.emit('register_me', user.id);
            upd();
        });

        socket.on('sync_chats', sChats => {
            chats = sChats;
            upd();
        });
        
        socket.on('force_alert', msg => alert(msg));
        socket.on('auth_error', msg => alert(msg));

        function logout() {
            localStorage.removeItem('g_creds');
            location.reload();
        }

        // ПРОФИЛЬ
        function openProfile() {
            document.getElementById('profile-modal').style.display='flex';
            document.getElementById('p-name').innerText = user.name;
            document.getElementById('p-pass').innerText = user.pass;
            document.getElementById('p-id').innerText = user.id;
        }

        // ДОБАВЛЕНИЕ УЧАСТНИКА В ГРУППУ
        function openAddUser() {
            openM('Добавить участника (ID)', 3);
        }

        // МОДАЛКИ
        function openM(title, mode) {
            const m = document.getElementById('general-modal');
            m.style.display='flex';
            document.getElementById('m-title').innerText = title;
            const i1 = document.getElementById('m-i1');
            const i2 = document.getElementById('m-i2');
            i1.value = ''; 
            i2.style.display = (mode === 2) ? 'block' : 'none';
            i1.placeholder = (mode === 3) ? 'Введите ID друга' : 'Имя';

            document.getElementById('m-ok').onclick = () => {
                const val1 = i1.value;
                const val2 = i2.value;
                
                if (mode === 1 && val1) { // Создать группу
                    const r = 'grp_' + Date.now();
                    const c = {name: val1, room: r, type: 'group', admin: user.id};
                    chats.push(c);
                    socket.emit('save_chat_to_server', {uid: user.id, chat: c});
                    switchR(r);
                } else if (mode === 2 && val1 && val2) { // Создать ЛС
                    const r = [user.id, parseInt(val2)].sort().join('_');
                    if(!chats.find(x=>x.room===r)) {
                        const c = {name: val1, room: r, type: 'private', tid: parseInt(val2)};
                        chats.push(c);
                        socket.emit('save_chat_to_server', {uid: user.id, chat: c});
                    }
                    switchR(r);
                } else if (mode === 3 && val1) { // Добавить в группу
                     const curChat = chats.find(c => c.room === curRoom);
                     if(curChat && curChat.type === 'group') {
                        socket.emit('add_user_to_group', {
                            targetId: val1, 
                            room: curRoom, 
                            chatName: curChat.name
                        });
                        alert('Запрос на добавление отправлен!');
                     }
                }
                m.style.display='none';
            };
        }

        // ЧАТ ЛОГИКА
        function switchR(r) {
            curRoom = r;
            const c = chats.find(x=>x.room===r);
            document.getElementById('c-title').innerText = c ? c.name : "Чат";
            // Показываем кнопку добавления только в группах
            document.getElementById('add-user-btn').style.display = (c && c.type === 'group') ? 'block' : 'none';
            
            document.getElementById('messages').innerHTML = '';
            socket.emit('join_room', r);
            document.getElementById('sidebar').classList.remove('open');
            
            // Подсветка активной
            upd();
        }

        function render(m) {
            if(document.getElementById('m-'+m.id)) return;
            const b = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId==user.id?'me':'them');
            d.id = 'm-'+m.id;
            
            let content = m.content;
            if(m.type==='voice') content = \`<audio src="\${m.content}" controls style="max-width:200px; height:40px; filter:invert(1)"></audio>\`;
            if(m.type==='file') {
                 if(m.content.startsWith('data:image')) content = \`<img src="\${m.content}" style="max-width:100%; border-radius:10px">\`;
                 else content = \`<a href="\${m.content}" download="\${m.fileName}" style="color:#fff">📄 \${m.fileName}</a>\`;
            }

            // Кнопка удаления только для своих
            const del = m.userId==user.id ? \`<span onclick="delM('\${m.id}')" style="color:red; cursor:pointer; margin-left:10px; font-weight:bold">✕</span>\` : '';

            d.innerHTML = \`<div style="font-size:10px; opacity:0.5; margin-bottom:5px"><b>\${m.userName}</b>\${del}</div>\${content}\`;
            b.appendChild(d);
            b.scrollTop = b.scrollHeight;
        }

        function delM(id) { 
            document.getElementById('m-'+id).style.display = 'none'; // Сразу прячем для быстроты
            socket.emit('delete_msg', {id, room: curRoom}); 
        }

        socket.on('msg_deleted', id => { const e = document.getElementById('m-'+id); if(e) e.remove(); });
        socket.on('new_msg', m => { if(m.room===curRoom) render(m); });
        socket.on('load_history', h => {
            document.getElementById('messages').innerHTML = '';
            h.forEach(render);
        });
        socket.on('private_request', d => {
            if(!chats.find(c => c.room === d.room)) {
                chats.push({ name: d.fromName, room: d.room, type: 'private', tid: d.fromId });
                upd();
            }
        });

        // ГОЛОСОВЫЕ
        function startVoice() {
             navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
                recorder = new MediaRecorder(s);
                chunks = [];
                recorder.ondataavailable = e => chunks.push(e.data);
                recorder.start();
                document.getElementById('voice-panel').style.display = 'flex';
             }).catch(() => alert("Нет доступа к микрофону"));
        }
        
        function stopVoice(send) {
            if(!recorder) return;
            recorder.stop();
            document.getElementById('voice-panel').style.display = 'none';
            recorder.onstop = () => {
                if(send && chunks.length > 0) {
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
                }
                recorder = null;
            };
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

        function upd() {
            if(user) {
                document.getElementById('u-name').innerText = user.name;
                document.getElementById('u-id').innerText = "ID: " + user.id;
            }
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

server.listen(process.env.PORT || 3000);
