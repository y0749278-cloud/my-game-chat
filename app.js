const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

let messageHistory = [];
try {
    if (fs.existsSync('messages.json')) messageHistory = JSON.parse(fs.readFileSync('messages.json'));
} catch (e) { console.log("Ошибка БД"); }

function saveDB() { fs.writeFileSync('messages.json', JSON.stringify(messageHistory.slice(-5000))); }

io.on('connection', (socket) => {
    socket.on('register_me', (myId) => { socket.join("user-" + myId); socket.myId = myId; io.emit('user_status', {id: myId, online: true}); });
    
    socket.on('join_room', (room) => {
        socket.join(room);
        socket.emit('load_history', messageHistory.filter(m => m.room === room));
    });

    socket.on('typing', (data) => { socket.to(data.room).emit('is_typing', data); });

    socket.on('send_msg', (data) => {
        const msg = { id: Date.now() + Math.random(), ...data };
        messageHistory.push(msg);
        saveDB();
        io.to(data.room).emit('new_msg', msg);
        if(data.toId) io.to("user-" + data.toId).emit('notify_new_contact', msg);
    });

    socket.on('call_user', (data) => { io.to("user-" + data.toId).emit('incoming_call', data); });
    socket.on('accept_call', (data) => { io.to("user-" + data.toId).emit('call_accepted', data); });

    socket.on('disconnect', () => { if(socket.myId) io.emit('user_status', {id: socket.myId, online: false}); });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>G-CHAT ULTIMATE</title>
    <style>
        :root { --bg: #0b0e14; --panel: #161b22; --accent: #7c3aed; --mine: #6d28d9; --text: #e6edf3; }
        * { box-sizing: border-box; outline:none; -webkit-tap-highlight-color: transparent; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; overflow: hidden; position: fixed; width: 100vw; }
        
        #sidebar { width: 320px; background: var(--panel); border-right: 1px solid #333; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; background: #0d1117; border-bottom: 1px solid #333; }
        .search-box { padding: 10px; background: #000; margin: 10px; border-radius: 8px; border: 1px solid #333; }
        .search-box input { background: none; border: none; color: #fff; width: 100%; }

        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 8px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid #333; cursor:pointer; position: relative; }
        .room-btn.active { border-color: var(--accent); background: rgba(124, 58, 237, 0.1); }
        .online-dot { width: 10px; height: 10px; background: #22c55e; border-radius: 50%; display: inline-block; margin-right: 5px; }

        #chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg); }
        .top-bar { padding: 10px 20px; background: var(--panel); border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between; }
        .top-info { display: flex; align-items: center; gap: 15px; }
        .call-tools { display: flex; gap: 20px; font-size: 20px; cursor: pointer; }

        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth; }
        .msg { max-width: 80%; padding: 12px; border-radius: 18px; position: relative; animation: fadeIn 0.2s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .msg.me { align-self: flex-end; background: var(--mine); border-bottom-right-radius: 4px; }
        .msg.them { align-self: flex-start; background: var(--panel); border: 1px solid #333; border-bottom-left-radius: 4px; }
        
        #typing-hint { padding: 5px 20px; font-size: 12px; color: var(--accent); height: 20px; }
        #input-zone { padding: 10px; background: #0d1117; display: flex; align-items: center; gap: 10px; padding-bottom: max(15px, env(safe-area-inset-bottom)); }
        #msg-in { flex: 1; background: #000; border: 1px solid #444; color: #fff; padding: 12px 18px; border-radius: 25px; }

        .modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--panel); padding: 30px; border-radius: 20px; border: 2px solid var(--accent); z-index: 2000; text-align: center; display: none; }

        @media (max-width: 768px) { #sidebar { position: fixed; left: -100%; width: 85%; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>
    <div id="sidebar">
        <div class="sidebar-header">
            <b style="color:var(--accent); font-size: 20px;">G-CHAT ULTIMATE</b>
            <div id="my-id-display" style="font-size:12px; opacity:0.6; margin-top:5px;"></div>
        </div>
        <div class="search-box"><input type="text" placeholder="Поиск чатов..." oninput="filterChats(this.value)"></div>
        <div id="rooms-list"></div>
        <div style="padding: 10px; display: flex; gap: 5px;">
            <button onclick="addFriend()" style="flex:1; padding:12px; background:var(--accent); border:none; color:white; border-radius:10px; font-weight:bold;">+ ID</button>
            <button onclick="changeTheme()" style="padding:12px; background:#333; border:none; border-radius:10px;">🎨</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <div class="top-info">
                <button onclick="toggleMenu()" style="background:var(--accent); border:none; color:white; padding:8px 12px; border-radius:8px;">☰</button>
                <b id="chat-title">Выберите чат</b>
            </div>
            <div class="call-tools" id="call-ui" style="display:none;">
                <span onclick="startCall('audio')">📞</span>
                <span onclick="startCall('video')">📹</span>
            </div>
        </div>
        <div id="messages"></div>
        <div id="typing-hint"></div>
        <div id="input-zone">
            <label style="font-size:24px; cursor:pointer;">📎<input type="file" id="file-in" hidden onchange="sendFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение..." oninput="notifyTyping()">
            <div id="mic-btn" style="font-size:24px; cursor:pointer;">🎤</div>
            <button style="background:var(--accent); border:none; color:white; width:45px; height:45px; border-radius:50%; font-size:20px;" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <div id="call-modal" class="modal">
        <h2 id="call-status">Входящий звонок...</h2>
        <div style="display:flex; gap:20px; justify-content:center; margin-top:20px;">
            <button onclick="acceptCall()" style="background:#22c55e; border:none; color:white; padding:15px 30px; border-radius:10px;">Принять</button>
            <button onclick="closeModal()" style="background:#ef4444; border:none; color:white; padding:15px 30px; border-radius:10px;">Сбросить</button>
        </div>
    </div>

    <audio id="notif-sound" src="https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3"></audio>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let userData = JSON.parse(localStorage.getItem('gchat_user')) || {id: Math.floor(100000 + Math.random()*899999), name: "Я"};
        if(!localStorage.getItem('gchat_user')) localStorage.setItem('gchat_user', JSON.stringify(userData));

        let friends = JSON.parse(localStorage.getItem('gchat_friends') || '[]');
        let currentRoom = null;
        let onlineUsers = new Set();

        socket.emit('register_me', userData.id);

        function updateProfile() { document.getElementById('my-id-display').innerText = "Мой ID: " + userData.id; }
        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }

        function addFriend() {
            const id = prompt("Введите ID друга:");
            if(!id) return;
            const name = prompt("Имя для контакта:") || "Друг #" + id;
            const room = [userData.id, parseInt(id)].sort().join('-');
            saveContact(parseInt(id), name, room);
            switchRoom(room);
        }

        function saveContact(id, name, room) {
            const idx = friends.findIndex(f => f.id === id);
            if(idx > -1) friends[idx].name = name;
            else friends.push({ id, name, room });
            localStorage.setItem('gchat_friends', JSON.stringify(friends));
            renderFriends();
        }

        function renderFriends() {
            const list = document.getElementById('rooms-list'); list.innerHTML = '';
            friends.forEach(f => {
                const isOnline = onlineUsers.has(f.id);
                const d = document.createElement('div');
                d.className = 'room-btn' + (currentRoom === f.room ? ' active' : '');
                d.onclick = () => switchRoom(f.room);
                d.innerHTML = \`
                    <div>
                        \${isOnline ? '<span class="online-dot"></span>' : ''}
                        <b>\${f.name}</b><br><small>ID: \${f.id}</small>
                    </div>
                    <div style="position:absolute; right:10px; top:15px;">
                        <span onclick="event.stopPropagation(); renameFriend(\${f.id})" style="margin-right:10px;">✏️</span>
                        <span onclick="event.stopPropagation(); deleteFriend('\${f.room}')">🗑️</span>
                    </div>\`;
                list.appendChild(d);
            });
        }

        function renameFriend(id) {
            const newName = prompt("Введите новое имя:");
            if(newName) {
                const f = friends.find(f => f.id === id);
                saveContact(id, newName, f.room);
            }
        }

        function switchRoom(room) {
            currentRoom = room;
            const f = friends.find(f => f.room === room);
            document.getElementById('chat-title').innerText = f ? f.name : "Чат";
            document.getElementById('call-ui').style.display = 'flex';
            socket.emit('join_room', room);
            renderFriends();
            if(window.innerWidth < 768) toggleMenu();
        }

        // --- Механика сообщений ---
        function sendTxt() {
            const i = document.getElementById('msg-in');
            const f = friends.find(f => f.room === currentRoom);
            if(i.value && f) {
                socket.emit('send_msg', { 
                    type: 'text', content: i.value, room: currentRoom, 
                    userId: userData.id, userName: userData.name, 
                    time: new Date().toLocaleTimeString().slice(0,5), toId: f.id 
                });
                i.value = '';
            }
        }

        socket.on('new_msg', (msg) => {
            if(msg.room === currentRoom) renderMsg(msg);
            if(msg.userId !== userData.id) document.getElementById('notif-sound').play();
        });

        socket.on('notify_new_contact', (msg) => {
            if(!friends.find(f => f.id == msg.userId)) {
                saveContact(msg.userId, "Незнакомец #" + msg.userId, msg.room);
            }
        });

        function renderMsg(msg) {
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (msg.userId == userData.id ? 'me' : 'them');
            let content = msg.content;
            if(msg.type === 'image') content = \`<img src="\${msg.content}" style="width:100%; border-radius:10px;">\`;
            if(msg.type === 'audio') content = \`<audio src="\${msg.content}" controls style="width:100%; filter:invert(1)"></audio>\`;
            
            d.innerHTML = \`<div style="font-size:10px; opacity:0.6; margin-bottom:4px;">\${msg.userName}</div>
                           <div>\${content}</div>
                           <div style="font-size:9px; opacity:0.4; text-align:right; margin-top:4px;">\${msg.time} \${msg.userId == userData.id ? '✓✓' : ''}</div>\`;
            box.appendChild(d);
            box.scrollTop = box.scrollHeight;
        }

        // --- Доп. фишки ---
        function notifyTyping() { socket.emit('typing', {room: currentRoom, name: userData.name}); }
        let typeTimer;
        socket.on('is_typing', (data) => {
            document.getElementById('typing-hint').innerText = data.name + " печатает...";
            clearTimeout(typeTimer);
            typeTimer = setTimeout(() => { document.getElementById('typing-hint').innerText = ""; }, 2000);
        });

        socket.on('user_status', (data) => {
            if(data.online) onlineUsers.add(data.id); else onlineUsers.delete(data.id);
            renderFriends();
        });

        function changeTheme() {
            const colors = ['#7c3aed', '#ef4444', '#10b981', '#f59e0b', '#3b82f6'];
            const next = colors[(colors.indexOf(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) + 1) % colors.length];
            document.documentElement.style.setProperty('--accent', next);
            document.documentElement.style.setProperty('--mine', next);
        }

        function filterChats(val) {
            const btns = document.querySelectorAll('.room-btn');
            btns.forEach(b => b.style.display = b.innerText.toLowerCase().includes(val.toLowerCase()) ? 'flex' : 'none');
        }

        // --- Звонки (Заглушка для интерфейса) ---
        function startCall(type) {
            alert("Вызов " + (type === 'video' ? 'видео' : 'аудио') + "... Ожидание ответа.");
            const f = friends.find(f => f.room === currentRoom);
            socket.emit('call_user', {toId: f.id, fromName: userData.name, type});
        }
        socket.on('incoming_call', (data) => {
            document.getElementById('call-status').innerText = "Звонит " + data.fromName + " (" + data.type + ")";
            document.getElementById('call-modal').style.display = 'block';
        });
        function acceptCall() { alert("Связь установлена!"); closeModal(); }
        function closeModal() { document.getElementById('call-modal').style.display = 'none'; }

        updateProfile();
        renderFriends();
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
