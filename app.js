const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

// Память сервера (только сообщения)
let messageHistory = []; 

io.on('connection', (socket) => {
    // Пользователь заходит в конкретную комнату
    socket.on('join_room', (room) => {
        socket.join(room);
        // Отправляем историю сообщений только для этой комнаты
        const roomMsgs = messageHistory.filter(m => m.room === room);
        socket.emit('load_history', roomMsgs);
    });

    socket.on('send_msg', (data) => {
        const msgObject = {
            type: data.type,
            room: data.room,
            userId: data.userId,
            userName: data.userName,
            content: data.content,
            time: new Date().toLocaleTimeString().slice(0,5)
        };
        messageHistory.push(msgObject);
        if(messageHistory.length > 1000) messageHistory.shift();
        
        // Отправляем сообщение ТОЛЬКО участникам этой комнаты
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
    <title>G-CHAT ELITE PRIVATE</title>
    <style>
        :root { --bg: #0b0e14; --panel: #161b22; --accent: #7c3aed; --mine: #6d28d9; --text: #e6edf3; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; width: 100vw; overflow: hidden; position: fixed; }

        /* AUTH */
        #auth-screen { position: fixed; inset: 0; background: var(--bg); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
        #auth-screen.hidden { display: none; }
        .auth-card { background: var(--panel); padding: 30px; border-radius: 20px; width: 100%; max-width: 350px; border: 1px solid #30363d; text-align: center; }
        .auth-input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: white; padding: 15px; border-radius: 12px; margin-bottom: 15px; font-size: 16px; }
        .auth-btn { width: 100%; background: var(--accent); border: none; color: white; padding: 15px; border-radius: 12px; font-weight: bold; cursor: pointer; }

        /* SIDEBAR */
        #sidebar { width: 280px; background: var(--panel); border-right: 1px solid #30363d; display: flex; flex-direction: column; transition: 0.3s; flex-shrink: 0; z-index: 1000; }
        .sidebar-header { padding: 20px; background: #0d1117; text-align: center; border-bottom: 1px solid #30363d; }
        #rooms-list { flex: 1; padding: 15px; overflow-y: auto; }
        .room-btn { padding: 14px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border-radius: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        .room-btn.active { background: var(--accent); font-weight: bold; }
        .del-room { color: #ff453a; font-weight: bold; padding: 5px; }

        /* CHAT */
        #chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg); position: relative; }
        .top-bar { padding: 12px 15px; background: var(--panel); display: flex; align-items: center; gap: 15px; border-bottom: 1px solid #30363d; }
        .burger-btn { background: var(--accent); border: none; color: white; width: 40px; height: 40px; border-radius: 10px; font-size: 20px; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        
        .msg { max-width: 85%; padding: 10px 15px; border-radius: 18px; font-size: 15px; position: relative; }
        .msg.them { align-self: flex-start; background: var(--panel); border-bottom-left-radius: 4px; border: 1px solid #30363d; }
        .msg.me { align-self: flex-end; background: var(--mine); border-bottom-right-radius: 4px; }
        .sender-info { font-size: 10px; color: #a78bfa; margin-bottom: 4px; font-weight: bold; }
        .msg img { max-width: 100%; border-radius: 10px; margin: 5px 0; display: block; }
        .msg audio { width: 100%; min-width: 160px; height: 35px; filter: invert(1); }
        .time { font-size: 9px; opacity: 0.5; text-align: right; }

        /* INPUT */
        #input-zone { padding: 10px; background: var(--panel); display: flex; gap: 8px; border-top: 1px solid #30363d; padding-bottom: max(10px, env(safe-area-inset-bottom)); }
        input[type="text"] { flex: 1; background: #0d1117; border: 1px solid #30363d; color: white; padding: 12px; border-radius: 20px; font-size: 16px; }
        .send-btn { background: var(--accent); border: none; width: 44px; height: 44px; border-radius: 50%; color: white; flex-shrink: 0; }

        @media (max-width: 768px) {
            #sidebar { position: fixed; left: -100%; height: 100%; width: 80%; }
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="auth-card">
            <h2 style="color:var(--accent)">G-CHAT ELITE</h2>
            <input type="number" id="auth-id" class="auth-input" placeholder="Цифровой ID">
            <input type="text" id="auth-name" class="auth-input" placeholder="Ваше Имя">
            <button class="auth-btn" onclick="login()">ВОЙТИ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <div style="font-weight:900; color:var(--accent)">G-CHAT ELITE</div>
            <div id="user-display" style="font-size:11px; opacity:0.7; margin-top:5px;"></div>
        </div>
        <div id="rooms-list"></div>
        <button onclick="createRoom()" style="margin:15px; padding:15px; background:var(--accent); border:none; color:white; border-radius:12px; font-weight:bold;">+ СОЗДАТЬ ЧАТ</button>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button class="burger-btn" onclick="toggleMenu()">☰</button>
            <b id="room-title">Выберите чат</b>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <label style="font-size:25px; cursor:pointer">📎<input type="file" id="file-in" hidden onchange="sendFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <button id="mic-btn" style="background:none; border:none; font-size:25px;">🎤</button>
            <button class="send-btn" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentRoom = null;
        let userData = JSON.parse(localStorage.getItem('gchat_user')) || { id: '', name: '' };
        let myRooms = JSON.parse(localStorage.getItem('gchat_rooms')) || [];

        function login() {
            const id = document.getElementById('auth-id').value;
            const name = document.getElementById('auth-name').value;
            if(!id || !name) return alert('Введи данные!');
            userData = { id, name };
            localStorage.setItem('gchat_user', JSON.stringify(userData));
            location.reload();
        }

        if(userData.id) {
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('user-display').innerText = \`ID: \${userData.id} | \${userData.name}\`;
            renderRoomList();
        }

        function createRoom() {
            const name = prompt("Название комнаты (приватное):");
            if(name && name.trim()) {
                const r = name.trim();
                if(!myRooms.includes(r)) {
                    myRooms.push(r);
                    localStorage.setItem('gchat_rooms', JSON.stringify(myRooms));
                }
                renderRoomList();
                switchRoom(r);
            }
        }

        function renderRoomList() {
            const list = document.getElementById('rooms-list');
            list.innerHTML = '';
            myRooms.forEach(r => {
                const div = document.createElement('div');
                div.className = 'room-btn' + (currentRoom === r ? ' active' : '');
                div.innerHTML = \`<span># \${r}</span><span class="del-room" onclick="deleteRoom(event, '\${r}')">×</span>\`;
                div.onclick = () => switchRoom(r);
                list.appendChild(div);
            });
        }

        function deleteRoom(e, name) {
            e.stopPropagation();
            myRooms = myRooms.filter(r => r !== name);
            localStorage.setItem('gchat_rooms', JSON.stringify(myRooms));
            renderRoomList();
            if(currentRoom === name) location.reload();
        }

        function switchRoom(name) {
            currentRoom = name;
            document.getElementById('room-title').innerText = '# ' + name;
            renderRoomList();
            socket.emit('join_room', name);
            if(window.innerWidth <= 768) toggleMenu();
        }

        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }

        // СООБЩЕНИЯ
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
            let h = isMe ? '' : \`<div class="sender-info">\${msg.userName} (ID:\${msg.userId})</div>\`;
            let c = '';
            if(msg.type === 'text') c = \`<div>\${msg.content}</div>\`;
            if(msg.type === 'image') c = \`<img src="\${msg.content}" onclick="window.open(this.src)">\`;
            if(msg.type === 'audio') c = \`<audio controls src="\${msg.content}"></audio>\`;
            div.innerHTML = h + c + \`<div class="time">\${msg.time}</div>\`;
            document.getElementById('messages').appendChild(div);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
        }

        function sendTxt() {
            const inp = document.getElementById('msg-in');
            if(currentRoom && inp.value.trim()){
                socket.emit('send_msg', { type: 'text', content: inp.value, room: currentRoom, userId: userData.id, userName: userData.name });
                inp.value = '';
                inp.focus();
            }
        }

        function sendFile() {
            const file = document.getElementById('file-in').files[0];
            if(file && currentRoom){
                const reader = new FileReader();
                reader.onload = (e) => socket.emit('send_msg', { type: 'image', content: e.target.result, room: currentRoom, userId: userData.id, userName: userData.name });
                reader.readAsDataURL(file);
            }
        }

        // ГОЛОСОВЫЕ
        let mediaRec; let chunks = [];
        const mic = document.getElementById('mic-btn');
        async function startR(e) {
            e.preventDefault();
            if(!currentRoom) return;
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRec = new MediaRecorder(s);
            mediaRec.start(); chunks = [];
            mic.innerText = "🔴";
            mediaRec.ondataavailable = ev => chunks.push(ev.data);
            mediaRec.onstop = () => {
                const b = new Blob(chunks, { type: 'audio/mp4' });
                const r = new FileReader();
                r.onload = (e) => socket.emit('send_msg', { type: 'audio', content: e.target.result, room: currentRoom, userId: userData.id, userName: userData.name });
                r.readAsDataURL(b);
                mic.innerText = "🎤";
            };
        }
        function stopR(e) { e.preventDefault(); if(mediaRec) mediaRec.stop(); }
        mic.addEventListener('touchstart', startR); mic.addEventListener('touchend', stopR);
        mic.addEventListener('mousedown', startR); mic.addEventListener('mouseup', stopR);
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => { console.log('Private Build Ready'); });
