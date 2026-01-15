const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

let messageHistory = []; 

io.on('connection', (socket) => {
    socket.on('join_room', (room) => {
        socket.join(room);
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
            time: data.time // Берем время, присланное клиентом (твоим телефоном)
        };
        messageHistory.push(msgObject);
        if(messageHistory.length > 1000) messageHistory.shift();
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
    <title>G-CHAT ELITE PRIVACY</title>
    <style>
        :root { --bg: #0b0e14; --panel: #161b22; --accent: #7c3aed; --mine: #6d28d9; --text: #e6edf3; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; width: 100vw; overflow: hidden; position: fixed; }

        /* AUTH */
        #auth-screen { position: fixed; inset: 0; background: var(--bg); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
        #auth-screen.hidden { display: none; }
        .auth-card { background: var(--panel); padding: 30px; border-radius: 20px; width: 100%; max-width: 350px; border: 1px solid #30363d; text-align: center; }
        .auth-input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: white; padding: 18px; border-radius: 12px; margin-bottom: 15px; font-size: 16px; }
        .auth-btn { width: 100%; background: var(--accent); border: none; color: white; padding: 18px; border-radius: 12px; font-weight: bold; font-size: 16px; }

        /* SIDEBAR */
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #30363d; display: flex; flex-direction: column; transition: 0.3s; flex-shrink: 0; z-index: 1000; }
        .sidebar-header { padding: 20px; background: #0d1117; border-bottom: 1px solid #30363d; }
        .privacy-btn { float: right; background: #30363d; border: none; color: white; padding: 5px 10px; border-radius: 5px; cursor: pointer; }
        
        #rooms-list { flex: 1; padding: 10px; overflow-y: auto; }
        .room-btn { padding: 16px; margin-bottom: 12px; background: rgba(255,255,255,0.03); border-radius: 15px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border: 1px solid #30363d; }
        .room-btn.active { background: var(--accent); border-color: #a78bfa; }
        .room-info { display: flex; flex-direction: column; gap: 4px; pointer-events: none; }
        .room-label-id { font-size: 10px; opacity: 0.6; }

        /* CHAT AREA */
        #chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg); position: relative; }
        .top-bar { padding: 15px; background: var(--panel); display: flex; align-items: center; gap: 15px; border-bottom: 1px solid #30363d; }
        .burger-btn { background: var(--accent); border: none; color: white; width: 45px; height: 45px; border-radius: 12px; font-size: 22px; }

        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 85%; padding: 12px 18px; border-radius: 20px; font-size: 16px; line-height: 1.4; }
        .msg.them { align-self: flex-start; background: var(--panel); border-bottom-left-radius: 4px; border: 1px solid #30363d; }
        .msg.me { align-self: flex-end; background: var(--mine); border-bottom-right-radius: 4px; }
        
        .sender-info { font-size: 11px; color: #a78bfa; margin-bottom: 4px; font-weight: bold; }
        .time { font-size: 10px; opacity: 0.5; text-align: right; margin-top: 5px; }

        /* INPUT AREA */
        #input-zone { padding: 12px; background: var(--panel); display: flex; gap: 10px; border-top: 1px solid #30363d; padding-bottom: max(15px, env(safe-area-inset-bottom)); }
        #msg-in { flex: 1; background: #000; border: 1px solid #30363d; color: white; padding: 15px; border-radius: 30px; font-size: 16px; }
        .send-btn { background: var(--accent); border: none; width: 50px; height: 50px; border-radius: 50%; color: white; font-size: 22px; flex-shrink: 0; }

        @media (max-width: 768px) {
            #sidebar { position: fixed; left: -100%; height: 100%; width: 85%; }
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="auth-card">
            <h2 style="color:var(--accent); margin-top:0">G-CHAT ELITE</h2>
            <input type="number" id="auth-id" class="auth-input" placeholder="Ваш личный ID">
            <input type="text" id="auth-name" class="auth-input" placeholder="Ваше Имя">
            <button class="auth-btn" onclick="login()">ВОЙТИ В СЕТЬ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <button class="privacy-btn" onclick="togglePrivacy()">👁️</button>
            <div style="font-weight:900; color:var(--accent); font-size:18px;">G-CHAT</div>
            <div id="user-display" style="font-size:11px; opacity:0.7; margin-top:5px;"></div>
        </div>
        <div id="rooms-list"></div>
        <button onclick="createRoom()" style="margin:15px; padding:18px; background:var(--accent); border:none; color:white; border-radius:15px; font-weight:bold; cursor:pointer;">+ СОЗДАТЬ ДИАЛОГ</button>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button class="burger-btn" onclick="toggleMenu()">☰</button>
            <b id="room-title" style="font-size:16px;">Выберите контакт</b>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <label style="font-size:28px; cursor:pointer; padding:5px;">📎<input type="file" id="file-in" hidden onchange="sendFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <button id="mic-btn" style="background:none; border:none; font-size:28px;">🎤</button>
            <button class="send-btn" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentRoom = null;
        let privacyMode = localStorage.getItem('gchat_privacy') === 'true';
        let userData = JSON.parse(localStorage.getItem('gchat_user')) || { id: '', name: '' };
        let myRooms = JSON.parse(localStorage.getItem('gchat_rooms')) || [];

        // Функция получения текущего времени устройства
        function getTime() {
            return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }

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
            updateUserDisplay();
            renderRoomList();
        }

        function togglePrivacy() {
            privacyMode = !privacyMode;
            localStorage.setItem('gchat_privacy', privacyMode);
            updateUserDisplay();
            renderRoomList();
            if(currentRoom) socket.emit('join_room', currentRoom);
        }

        function updateUserDisplay() {
            const displayId = privacyMode ? '*****' : userData.id;
            document.getElementById('user-display').innerText = \`ID: \${displayId} | \${userData.name}\`;
        }

        function createRoom() {
            const labelId = prompt("Введите ID собеседника (для списка):");
            const labelName = prompt("Введите ИМЯ собеседника (для списка):");
            const key = prompt("Введите СЕКРЕТНЫЙ КЛЮЧ комнаты:");
            
            if(labelId && labelName && key) {
                const newRoom = { key: key.trim(), labelId, labelName };
                if(!myRooms.find(r => r.key === newRoom.key)) {
                    myRooms.push(newRoom);
                    localStorage.setItem('gchat_rooms', JSON.stringify(myRooms));
                }
                renderRoomList();
                switchRoom(newRoom.key, newRoom.labelName);
            }
        }

        function renderRoomList() {
            const list = document.getElementById('rooms-list');
            list.innerHTML = '';
            myRooms.forEach(r => {
                const div = document.createElement('div');
                div.className = 'room-btn' + (currentRoom === r.key ? ' active' : '');
                const showId = privacyMode ? '*****' : r.labelId;
                div.innerHTML = \`
                    <div class="room-info">
                        <b style="font-size:16px;">\${r.labelName}</b>
                        <span class="room-label-id">ID: \${showId}</span>
                    </div>
                    <span style="color:#ff453a; font-weight:bold; font-size:20px; padding:10px;" onclick="deleteRoom(event, '\${r.key}')">×</span>
                \`;
                div.onclick = () => switchRoom(r.key, r.labelName);
                list.appendChild(div);
            });
        }

        function deleteRoom(e, key) {
            e.stopPropagation();
            if(!confirm('Удалить чат?')) return;
            myRooms = myRooms.filter(r => r.key !== key);
            localStorage.setItem('gchat_rooms', JSON.stringify(myRooms));
            renderRoomList();
            if(currentRoom === key) location.reload();
        }

        function switchRoom(key, labelName) {
            currentRoom = key;
            document.getElementById('room-title').innerText = 'Чат: ' + labelName;
            renderRoomList();
            socket.emit('join_room', key);
            if(window.innerWidth <= 768) toggleMenu();
        }

        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }

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
            const displayId = privacyMode ? '*****' : msg.userId;
            let h = isMe ? '' : \`<div class="sender-info">\${msg.userName} <span style="opacity:0.5; font-weight:normal;">(ID:\${displayId})</span></div>\`;
            let c = '';
            if(msg.type === 'text') c = \`<div>\${msg.content}</div>\`;
            if(msg.type === 'image') c = \`<img src="\${msg.content}" width="100%" style="border-radius:10px;">\`;
            if(msg.type === 'audio') c = \`<audio controls src="\${msg.content}" style="width:100%"></audio>\`;
            div.innerHTML = h + c + \`<div class="time">\${msg.time}</div>\`;
            document.getElementById('messages').appendChild(div);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
        }

        function sendTxt() {
            const inp = document.getElementById('msg-in');
            if(currentRoom && inp.value.trim()){
                socket.emit('send_msg', { 
                    type: 'text', 
                    content: inp.value, 
                    room: currentRoom, 
                    userId: userData.id, 
                    userName: userData.name,
                    time: getTime() // ОТПРАВЛЯЕМ МЕСТНОЕ ВРЕМЯ
                });
                inp.value = '';
                inp.focus();
            }
        }

        function sendFile() {
            const file = document.getElementById('file-in').files[0];
            if(file && currentRoom){
                const reader = new FileReader();
                reader.onload = (e) => socket.emit('send_msg', { 
                    type: 'image', 
                    content: e.target.result, 
                    room: currentRoom, 
                    userId: userData.id, 
                    userName: userData.name,
                    time: getTime() 
                });
                reader.readAsDataURL(file);
            }
        }

        let mediaRec; let chunks = [];
        const mic = document.getElementById('mic-btn');
        async function startR(e) {
            e.preventDefault();
            if(!currentRoom) return;
            try {
                const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRec = new MediaRecorder(s);
                mediaRec.start(); chunks = [];
                mic.style.color = "red";
                mediaRec.ondataavailable = ev => chunks.push(ev.data);
                mediaRec.onstop = () => {
                    const b = new Blob(chunks, { type: 'audio/mp4' });
                    const r = new FileReader();
                    r.onload = (e) => socket.emit('send_msg', { 
                        type: 'audio', 
                        content: e.target.result, 
                        room: currentRoom, 
                        userId: userData.id, 
                        userName: userData.name,
                        time: getTime() 
                    });
                    reader.readAsDataURL(b);
                    mic.style.color = "white";
                };
            } catch(e) { alert('Включи микрофон!'); }
        }
        function stopR(e) { e.preventDefault(); if(mediaRec) mediaRec.stop(); }
        mic.addEventListener('touchstart', startR); mic.addEventListener('touchend', stopR);
        mic.addEventListener('mousedown', startR); mic.addEventListener('mouseup', stopR);
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => { console.log('Privacy Elite Ready'); });
