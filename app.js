const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

// ПАМЯТЬ СЕРВЕРА
let messageHistory = []; 
let existingRooms = []; 

io.on('connection', (socket) => {
    socket.emit('init_rooms', existingRooms);

    socket.on('join_room', (room) => {
        socket.join(room);
        const roomMsgs = messageHistory.filter(m => m.room === room);
        socket.emit('load_history', roomMsgs);
    });

    socket.on('create_room', (roomName) => {
        if (!existingRooms.includes(roomName)) {
            existingRooms.push(roomName);
            io.emit('room_created', roomName);
        }
    });

    socket.on('send_msg', (data) => {
        const msgObject = {
            type: data.type,
            room: data.room,
            userId: data.userId,
            userName: data.userName, // Добавили имя
            content: data.content,
            time: new Date().toLocaleTimeString().slice(0,5)
        };
        messageHistory.push(msgObject);
        if(messageHistory.length > 500) messageHistory.shift();
        io.to(data.room).emit('new_msg', msgObject);
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-CHAT ELITE</title>
    <style>
        :root { --bg: #0b0e14; --panel: #161b22; --accent: #7c3aed; --mine: #6d28d9; --text: #e6edf3; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; width: 100vw; overflow: hidden; position: fixed; }

        /* ЭКРАН ВХОДА */
        #auth-screen { position: fixed; inset: 0; background: var(--bg); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; transition: 0.5s; }
        #auth-screen.hidden { opacity: 0; pointer-events: none; transform: translateY(-20px); }
        .auth-card { background: var(--panel); padding: 30px; border-radius: 20px; width: 100%; max-width: 350px; border: 1px solid #30363d; text-align: center; }
        .auth-card h2 { color: var(--accent); margin-bottom: 20px; }
        .auth-input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: white; padding: 15px; border-radius: 12px; margin-bottom: 15px; font-size: 16px; }
        .auth-btn { width: 100%; background: var(--accent); border: none; color: white; padding: 15px; border-radius: 12px; font-weight: bold; cursor: pointer; }

        /* SIDEBAR */
        #sidebar { width: 280px; background: var(--panel); border-right: 1px solid #30363d; display: flex; flex-direction: column; transition: 0.3s; flex-shrink: 0; z-index: 1000; }
        .sidebar-header { padding: 20px; background: #0d1117; text-align: center; border-bottom: 1px solid #30363d; }
        .logo { font-size: 22px; font-weight: 900; color: var(--accent); }
        #rooms-list { flex: 1; padding: 15px; overflow-y: auto; }
        .room-btn { padding: 14px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border-radius: 12px; cursor: pointer; }
        .room-btn.active { background: var(--accent); border-color: #a78bfa; font-weight: bold; }

        /* CHAT AREA */
        #chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg); height: 100%; position: relative; }
        .top-bar { padding: 12px 15px; background: var(--panel); display: flex; align-items: center; gap: 15px; border-bottom: 1px solid #30363d; }
        .burger-btn { background: var(--accent); border: none; color: white; width: 40px; height: 40px; border-radius: 10px; font-size: 20px; }

        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .msg { max-width: 85%; padding: 12px 16px; border-radius: 18px; font-size: 15px; position: relative; }
        .msg.them { align-self: flex-start; background: var(--panel); border-bottom-left-radius: 4px; border: 1px solid #30363d; }
        .msg.me { align-self: flex-end; background: var(--mine); border-bottom-right-radius: 4px; }
        
        .sender-info { font-size: 10px; color: #a78bfa; margin-bottom: 4px; font-weight: bold; display: flex; justify-content: space-between; gap: 10px; }
        .msg img { max-width: 100%; border-radius: 10px; margin: 8px 0; display: block; }
        .msg audio { width: 100%; min-width: 160px; height: 35px; margin-top: 8px; filter: invert(1); }
        .time { font-size: 9px; opacity: 0.5; text-align: right; margin-top: 5px; }

        /* INPUT */
        #input-zone { padding: 10px 15px; background: var(--panel); display: flex; align-items: center; gap: 10px; border-top: 1px solid #30363d; padding-bottom: max(12px, env(safe-area-inset-bottom)); }
        input[type="text"] { flex: 1; background: #0d1117; border: 1px solid #30363d; color: white; padding: 12px 18px; border-radius: 25px; font-size: 16px; }
        .icon-btn { font-size: 24px; background: none; border: none; color: #8b949e; cursor: pointer; }
        #mic-btn.recording { color: #ff453a; transform: scale(1.2); }
        .send-btn { background: var(--accent); border: none; width: 46px; height: 46px; border-radius: 50%; color: white; font-size: 20px; flex-shrink: 0; }

        @media (max-width: 768px) {
            #sidebar { position: fixed; left: -100%; height: 100%; width: 80%; }
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="auth-card">
            <h2>G-CHAT ELITE</h2>
            <input type="number" id="auth-id" class="auth-input" placeholder="Введите ваш цифровой ID">
            <input type="text" id="auth-name" class="auth-input" placeholder="Введите ваше Имя">
            <button class="auth-btn" onclick="login()">ВОЙТИ В ЧАТ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <div class="logo">G-CHAT ELITE</div>
            <div id="user-display" style="font-size:12px; color:#a78bfa; margin-top:5px;"></div>
        </div>
        <div id="rooms-list"></div>
        <button onclick="createRoom()" style="margin:20px; padding:15px; background:var(--accent); border:none; color:white; border-radius:12px; font-weight:bold; cursor:pointer;">+ СОЗДАТЬ ЧАТ</button>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button class="burger-btn" onclick="toggleMenu()">☰</button>
            <span id="current-room-title" style="font-weight:bold; font-size: 18px;">Выберите чат</span>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <label class="icon-btn">📎<input type="file" id="file-in" hidden accept="image/*" onchange="sendFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <button class="icon-btn" id="mic-btn">🎤</button>
            <button class="send-btn" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentRoom = null;
        let userData = { id: '', name: '' };

        // --- ЛОГИКА ВХОДА ---
        function login() {
            const id = document.getElementById('auth-id').value;
            const name = document.getElementById('auth-name').value;
            if(!id || !name) return alert('Заполни всё!');
            
            userData.id = id;
            userData.name = name;
            localStorage.setItem('gchat_user', JSON.stringify(userData));
            
            completeAuth();
        }

        function completeAuth() {
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('user-display').innerText = \`ID: \${userData.id} | \${userData.name}\`;
            socket.emit('get_initial_data');
        }

        // Авто-вход
        const saved = localStorage.getItem('gchat_user');
        if(saved) {
            userData = JSON.parse(saved);
            completeAuth();
        }

        // --- ЧАТ ---
        socket.on('init_rooms', (rooms) => {
            const list = document.getElementById('rooms-list');
            list.innerHTML = '';
            rooms.forEach(r => addRoomButton(r));
        });

        socket.on('room_created', (roomName) => addRoomButton(roomName));

        socket.on('load_history', (msgs) => {
            const box = document.getElementById('messages');
            box.innerHTML = '';
            msgs.forEach(m => renderMsg(m));
            box.scrollTop = box.scrollHeight;
        });

        socket.on('new_msg', (msg) => {
            if(msg.room === currentRoom) renderMsg(msg);
        });

        function renderMsg(msg) {
            const div = document.createElement('div');
            const isMe = (msg.userId == userData.id);
            div.className = 'msg ' + (isMe ? 'me' : 'them');
            
            let head = isMe ? '' : \`<div class="sender-info"><span>\${msg.userName}</span><span>ID: \${msg.userId}</span></div>\`;
            
            let content = '';
            if(msg.type === 'text') content = \`<div>\${msg.content}</div>\`;
            if(msg.type === 'image') content = \`<img src="\${msg.content}" onclick="window.open(this.src)">\`;
            if(msg.type === 'audio') content = \`<audio controls src="\${msg.content}"></audio>\`;
            
            div.innerHTML = head + content + \`<div class="time">\${msg.time}</div>\`;
            document.getElementById('messages').appendChild(div);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
        }

        function sendTxt() {
            if(!currentRoom) return alert('Выбери чат!');
            const inp = document.getElementById('msg-in');
            if(inp.value.trim()){
                socket.emit('send_msg', { 
                    type: 'text', 
                    content: inp.value, 
                    room: currentRoom, 
                    userId: userData.id,
                    userName: userData.name 
                });
                inp.value = '';
                inp.focus();
            }
        }

        function sendFile() {
            if(!currentRoom) return;
            const file = document.getElementById('file-in').files[0];
            if(file){
                const reader = new FileReader();
                reader.onload = (e) => socket.emit('send_msg', { 
                    type: 'image', 
                    content: e.target.result, 
                    room: currentRoom, 
                    userId: userData.id,
                    userName: userData.name 
                });
                reader.readAsDataURL(file);
            }
        }

        // ГОЛОСОВЫЕ
        let mediaRec; let chunks = [];
        const micBtn = document.getElementById('mic-btn');

        async function recStart(e) {
            e.preventDefault();
            if(!currentRoom) return;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRec = new MediaRecorder(stream);
                mediaRec.start();
                chunks = [];
                micBtn.classList.add('recording');
                micBtn.innerText = "🔴";
                mediaRec.ondataavailable = ev => chunks.push(ev.data);
                mediaRec.onstop = () => {
                    const blob = new Blob(chunks, { type: 'audio/mp4' });
                    const reader = new FileReader();
                    reader.onload = (re) => socket.emit('send_msg', { 
                        type: 'audio', 
                        content: re.target.result, 
                        room: currentRoom, 
                        userId: userData.id,
                        userName: userData.name 
                    });
                    reader.readAsDataURL(blob);
                    micBtn.classList.remove('recording');
                    micBtn.innerText = "🎤";
                };
            } catch(err) { alert('Микрофон выключен!'); }
        }

        function recStop(e) {
            e.preventDefault();
            if(mediaRec && mediaRec.state === "recording") mediaRec.stop();
        }

        micBtn.addEventListener('mousedown', recStart);
        micBtn.addEventListener('mouseup', recStop);
        micBtn.addEventListener('touchstart', recStart);
        micBtn.addEventListener('touchend', recStop);

        // КОМНАТЫ
        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }
        
        function createRoom() {
            const name = prompt("Название чата (Сделайте его секретным, чтобы никто не подсмотрел!):");
            if(name && name.trim()) {
                socket.emit('create_room', name.trim());
                setTimeout(() => switchRoom(name.trim()), 200);
            }
        }

        function addRoomButton(name) {
            const list = document.getElementById('rooms-list');
            if ([...list.children].some(b => b.innerText === '# ' + name)) return;
            const btn = document.createElement('div');
            btn.className = 'room-btn';
            btn.innerText = '# ' + name;
            btn.onclick = () => switchRoom(name);
            list.appendChild(btn);
        }

        function switchRoom(name) {
            currentRoom = name;
            document.getElementById('current-room-title').innerText = '# ' + name;
            document.querySelectorAll('.room-btn').forEach(b => b.classList.toggle('active', b.innerText === '# ' + name));
            socket.emit('join_room', name);
            if(window.innerWidth <= 768) toggleMenu();
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => { console.log('Elite Build Ready'); });
