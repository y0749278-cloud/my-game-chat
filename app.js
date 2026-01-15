const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

// База данных в файле
let messageHistory = [];
try {
    if (fs.existsSync('messages.json')) {
        messageHistory = JSON.parse(fs.readFileSync('messages.json'));
    }
} catch (e) { console.log("Ошибка базы"); }

function saveDB() {
    fs.writeFileSync('messages.json', JSON.stringify(messageHistory.slice(-1000)));
}

io.on('connection', (socket) => {
    socket.on('join_room', (room) => {
        socket.join(room);
        socket.emit('load_history', messageHistory.filter(m => m.room === room));
    });

    socket.on('send_msg', (data) => {
        const msg = {
            id: Date.now() + Math.random(),
            type: data.type, room: data.room, userId: data.userId,
            userName: data.userName, content: data.content, time: data.time 
        };
        messageHistory.push(msg);
        saveDB();
        io.to(data.room).emit('new_msg', msg);
    });

    socket.on('delete_msg', (data) => {
        messageHistory = messageHistory.filter(m => m.id !== data.id);
        saveDB();
        io.to(data.room).emit('msg_deleted', data.id);
    });
});

app.get('/manifest.json', (req, res) => {
    res.json({
        "short_name": "G-Chat",
        "name": "G-CHAT ELITE",
        "icons": [{ "src": "https://i.ibb.co/m568f6K/G-LOGO.png", "type": "image/png", "sizes": "512x512", "purpose": "any maskable" }],
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0b0e14",
        "theme_color": "#7c3aed"
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <link rel="manifest" href="/manifest.json">
    <title>G-CHAT ULTIMATE</title>
    <style>
        :root { --bg: #0b0e14; --panel: #161b22; --accent: #7c3aed; --mine: #6d28d9; --text: #e6edf3; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; width: 100vw; overflow: hidden; position: fixed; }

        /* AUTH */
        #auth-screen { position: fixed; inset: 0; background: var(--bg); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
        #auth-screen.hidden { display: none; }
        .auth-card { background: var(--panel); padding: 40px 30px; border-radius: 25px; width: 100%; max-width: 350px; border: 1px solid #30363d; text-align: center; }
        .auth-input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: white; padding: 18px; border-radius: 15px; margin-bottom: 20px; font-size: 18px; text-align: center; }
        .auth-btn { width: 100%; background: var(--accent); border: none; color: white; padding: 18px; border-radius: 15px; font-weight: bold; font-size: 16px; }

        /* SIDEBAR */
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #30363d; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; background: #0d1117; border-bottom: 1px solid #30363d; }
        .privacy-btn { float: right; background: #30363d; border: none; color: white; width: 35px; height: 35px; border-radius: 8px; font-size: 18px; cursor: pointer; }
        #rooms-list { flex: 1; padding: 10px; overflow-y: auto; }
        .room-btn { padding: 16px; margin-bottom: 12px; background: rgba(255,255,255,0.03); border-radius: 15px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #30363d; cursor: pointer; }
        .room-btn.active { background: var(--accent); border-color: #a78bfa; }

        /* CHAT AREA */
        #chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg); position: relative; width: 100%; }
        .top-bar { padding: 12px 15px; background: var(--panel); display: flex; align-items: center; gap: 15px; border-bottom: 1px solid #30363d; }
        .burger-btn { background: var(--accent); border: none; color: white; width: 42px; height: 42px; border-radius: 10px; font-size: 20px; flex-shrink: 0; }

        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px; padding-bottom: 30px; }
        .msg { max-width: 85%; padding: 12px 16px; border-radius: 20px; font-size: 15px; position: relative; cursor: pointer; }
        .msg.them { align-self: flex-start; background: var(--panel); border-bottom-left-radius: 4px; border: 1px solid #30363d; }
        .msg.me { align-self: flex-end; background: var(--mine); border-bottom-right-radius: 4px; }
        .sender-info { font-size: 11px; color: #a78bfa; margin-bottom: 4px; font-weight: bold; }
        .time { font-size: 9px; opacity: 0.4; text-align: right; margin-top: 4px; }

        /* INPUT PANEL */
        #input-zone { 
            padding: 10px 12px; 
            background: #0d1117; 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            border-top: 1px solid #30363d; 
            padding-bottom: max(12px, env(safe-area-inset-bottom));
        }
        #msg-in { flex: 1; min-width: 0; background: #000; border: 1px solid #30363d; color: white; padding: 12px 15px; border-radius: 25px; font-size: 16px; }
        .input-icon { font-size: 26px; color: #8b949e; cursor: pointer; flex-shrink: 0; }
        .send-btn { 
            background: var(--accent); 
            border: none; 
            width: 45px; 
            height: 45px; 
            border-radius: 50%; 
            color: white; 
            font-size: 18px; 
            cursor: pointer; 
            flex-shrink: 0; 
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #img-loader { display: none; width: 20px; height: 20px; border: 3px solid #7c3aed; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 768px) { #sidebar { position: fixed; left: -100%; height: 100%; width: 85%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>
    <div id="auth-screen">
        <div class="auth-card">
            <h2 style="color:var(--accent); margin-bottom:25px;">G-CHAT</h2>
            <input type="text" id="auth-name" class="auth-input" placeholder="Введите имя">
            <button class="auth-btn" onclick="login()">ВОЙТИ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <button class="privacy-btn" onclick="togglePrivacy()">👁️</button>
            <div style="font-weight:900; color:var(--accent); font-size:18px;">G-CHAT</div>
            <div id="user-display" style="font-size:11px; opacity:0.7; margin-top:5px;"></div>
        </div>
        <div id="rooms-list"></div>
        <button onclick="createRoom()" style="margin:15px; padding:15px; background:var(--accent); border:none; color:white; border-radius:12px; font-weight:bold;">+ НОВЫЙ ЧАТ</button>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button class="burger-btn" onclick="toggleMenu()">☰</button>
            <div class="top-info"><b id="room-title">Выберите чат</b><br><span id="room-key-display" style="font-size:10px; opacity:0.6;"></span></div>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <label class="input-icon">📎<input type="file" id="file-in" hidden onchange="sendFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <div id="img-loader"></div>
            <div id="mic-btn" class="input-icon">🎤</div>
            <button class="send-btn" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentRoomKey = localStorage.getItem('gchat_last_room');
        let privacyMode = localStorage.getItem('gchat_privacy') === 'true';
        let userData = JSON.parse(localStorage.getItem('gchat_user'));
        let myRooms = JSON.parse(localStorage.getItem('gchat_rooms')) || [];

        // Запрос уведомлений
        if ("Notification" in window) { Notification.requestPermission(); }

        function getTime() { return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
        function login() {
            const name = document.getElementById('auth-name').value;
            if(!name.trim()) return;
            userData = { id: Math.floor(100000 + Math.random() * 900000), name: name.trim() };
            localStorage.setItem('gchat_user', JSON.stringify(userData));
            location.reload();
        }
        if(userData) { document.getElementById('auth-screen').classList.add('hidden'); updateUserDisplay(); renderRoomList(); if(currentRoomKey) switchRoom(currentRoomKey); }

        function togglePrivacy() { privacyMode = !privacyMode; localStorage.setItem('gchat_privacy', privacyMode); updateUserDisplay(); renderRoomList(); updateTopBar(); }
        function updateUserDisplay() { document.getElementById('user-display').innerText = \`ID: \${privacyMode ? '******' : userData.id} | \${userData.name}\`; }
        
        function createRoom() {
            const id = prompt("ID:"), name = prompt("Имя:"), key = prompt("КЛЮЧ:");
            if(id && name && key) {
                if(!myRooms.find(r => r.key === key)) myRooms.push({ key: key.trim(), labelId: id, labelName: name });
                localStorage.setItem('gchat_rooms', JSON.stringify(myRooms));
                renderRoomList(); switchRoom(key.trim(), name);
            }
        }
        function renderRoomList() {
            const list = document.getElementById('rooms-list'); list.innerHTML = '';
            myRooms.forEach(r => {
                const div = document.createElement('div');
                div.className = 'room-btn' + (currentRoomKey === r.key ? ' active' : '');
                div.innerHTML = \`<div><b>\${r.labelName}</b><br><small>ID: \${privacyMode ? '******' : r.labelId}</small></div>\`;
                div.onclick = () => switchRoom(r.key, r.labelName);
                list.appendChild(div);
            });
        }
        function switchRoom(key, name) {
            currentRoomKey = key; localStorage.setItem('gchat_last_room', key);
            updateTopBar(name || myRooms.find(r=>r.key===key)?.labelName);
            socket.emit('join_room', key); renderRoomList(); if(window.innerWidth <= 768) toggleMenu();
        }
        function updateTopBar(n) {
            document.getElementById('room-title').innerText = n || 'Чат';
            document.getElementById('room-key-display').innerText = privacyMode ? 'КЛЮЧ: ****' : 'КЛЮЧ: ' + currentRoomKey;
        }
        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }

        socket.on('load_history', (msgs) => { const box = document.getElementById('messages'); box.innerHTML = ''; msgs.forEach(m => renderMsg(m)); box.scrollTop = box.scrollHeight; });
        socket.on('new_msg', (msg) => { 
            if(msg.room === currentRoomKey) renderMsg(msg); 
            if(msg.userId !== userData.id && document.hidden) { new Notification("G-CHAT: " + msg.userName, { body: msg.type === 'text' ? msg.content : "Отправил медиа" }); }
        });
        socket.on('msg_deleted', (id) => { document.getElementById('msg-'+id)?.remove(); });

        function renderMsg(msg) {
            const div = document.createElement('div');
            div.id = 'msg-' + msg.id;
            div.className = 'msg ' + (msg.userId == userData.id ? 'me' : 'them');
            const showId = privacyMode ? '******' : msg.userId;
            let h = msg.userId == userData.id ? '' : \`<div class="sender-info">\${msg.userName} #\${showId}</div>\`;
            
            // ИСПРАВЛЕННЫЙ РЕНДЕР (ДЛЯ ГОЛОСОВЫХ И КАРТИНОК)
            let c = "";
            if(msg.type === 'text') c = \`<div>\${msg.content}</div>\`;
            else if(msg.type === 'image') c = \`<img src="\${msg.content}" width="100%" style="border-radius:12px;">\`;
            else if(msg.type === 'audio') c = \`<audio controls src="\${msg.content}" style="width:100%; filter: invert(1);"></audio>\`;
            
            div.innerHTML = h + c + \`<div class="time">\${msg.time}</div>\`;
            div.onclick = () => { if(msg.userId == userData.id && confirm("Удалить?")) socket.emit('delete_msg', { id: msg.id, room: currentRoomKey }); };
            document.getElementById('messages').appendChild(div);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
        }

        function sendTxt() {
            const inp = document.getElementById('msg-in');
            if(currentRoomKey && inp.value.trim()){
                socket.emit('send_msg', { type: 'text', content: inp.value, room: currentRoomKey, userId: userData.id, userName: userData.name, time: getTime() });
                inp.value = '';
            }
        }
        function sendFile() {
            const file = document.getElementById('file-in').files[0];
            if(file && currentRoomKey){
                document.getElementById('img-loader').style.display = 'block';
                const reader = new FileReader();
                reader.onload = (e) => {
                    socket.emit('send_msg', { type: 'image', content: e.target.result, room: currentRoomKey, userId: userData.id, userName: userData.name, time: getTime() });
                    document.getElementById('img-loader').style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        }
        
        let mediaRec; let chunks = [];
        const mic = document.getElementById('mic-btn');
        async function startR(e) {
            e.preventDefault(); if(!currentRoomKey) return;
            try {
                const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRec = new MediaRecorder(s); mediaRec.start(); chunks = [];
                mic.style.color = "red";
                mediaRec.ondataavailable = ev => chunks.push(ev.data);
                mediaRec.onstop = () => {
                    const b = new Blob(chunks, { type: 'audio/mp4' });
                    const r = new FileReader();
                    r.onload = (e) => socket.emit('send_msg', { type: 'audio', content: e.target.result, room: currentRoomKey, userId: userData.id, userName: userData.name, time: getTime() });
                    r.readAsDataURL(b); mic.style.color = "#8b949e";
                };
            } catch(err) { alert("Микрофон недоступен"); }
        }
        function stopR(e) { e.preventDefault(); if(mediaRec) mediaRec.stop(); }
        mic.addEventListener('touchstart', startR); mic.addEventListener('touchend', stopR);
        mic.addEventListener('mousedown', startR); mic.addEventListener('mouseup', stopR);
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => { console.log('Fixed Build Ready'); });
