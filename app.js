const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

let messageHistory = [];

io.on('connection', (socket) => {
    socket.on('register_me', (data) => { 
        socket.myId = data.id;
        socket.join("user-" + data.id); 
        io.emit('user_status', {id: data.id, online: true}); 
    });

    socket.on('join_room', (room) => { 
        socket.join(room); 
        socket.emit('load_history', messageHistory.filter(m => m.room === room)); 
    });

    socket.on('typing', (data) => {
        socket.to(data.room).emit('is_typing', { userId: socket.myId, userName: data.userName, typing: data.typing });
    });

    socket.on('send_msg', (data) => {
        const msg = { id: Date.now() + Math.random(), ...data };
        messageHistory.push(msg);
        if (messageHistory.length > 500) messageHistory.shift(); 
        io.to(data.room).emit('new_msg', msg);
    });

    socket.on('invite_to_group', (data) => {
        io.to("user-" + data.toId).emit('group_invite', { room: data.room, name: data.groupName, adminId: socket.myId });
    });

    socket.on('disconnect', () => { if(socket.myId) io.emit('user_status', {id: socket.myId, online: false}); });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>G-CHAT (No Delete Mode)</title>
    <style>
        :root { --bg: #0b0e14; --panel: #161b22; --accent: #7c3aed; --text: #e6edf3; }
        * { box-sizing: border-box; outline:none; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; overflow: hidden; }
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #333; display: flex; flex-direction: column; z-index: 1000; transition: 0.3s; }
        .sidebar-header { padding: 20px; background: #0d1117; border-bottom: 2px solid var(--accent); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid #333; cursor:pointer; }
        .room-btn.active { border-color: var(--accent); background: rgba(124, 58, 237, 0.1); }
        #chat-area { flex: 1; display: flex; flex-direction: column; }
        .top-bar { padding: 10px 15px; background: var(--panel); border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 85%; padding: 10px; border-radius: 12px; font-size: 14px; position: relative; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .msg.me { align-self: flex-end; background: var(--accent); }
        .msg.them { align-self: flex-start; background: #21262d; }
        .msg-info { font-size: 10px; font-weight: bold; margin-bottom: 4px; color: #aaa; display: flex; justify-content: space-between; }
        .me .msg-info { color: #ddd; }
        #input-zone { padding: 10px; background: #0d1117; display: flex; align-items: center; gap: 8px; }
        #msg-in { flex: 1; background: #000; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 20px; }
        .btn-ui { background: var(--accent); border: none; color: white; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        #typing-monitor { font-size: 11px; color: var(--accent); height: 15px; margin-left: 15px; margin-bottom: 5px; opacity: 0; }
        @media (max-width: 768px) { #sidebar { position: fixed; left: -100%; width: 85%; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>
    <div id="sidebar">
        <div class="sidebar-header">
            <div onclick="changeMyName()" style="cursor:pointer;"><b id="display-name" style="font-size:18px;">Я</b> ✏️</div>
            <div id="display-id" style="font-size:14px; color:var(--accent); font-weight:bold; margin-top:5px;">ID: ...</div>
        </div>
        <div id="rooms-list"></div>
        <button class="btn-ui" style="margin: 10px;" onclick="createGroup()">+ СОЗДАТЬ ГРУППУ</button>
        <button class="btn-ui" style="margin: 0 10px 10px 10px; background:#333;" onclick="addFriend()">+ ЛИЧНЫЙ ЧАТ (ID)</button>
    </div>
    <div id="chat-area">
        <div class="top-bar">
            <div style="display:flex; align-items:center; gap:10px;"><button class="btn-ui" onclick="toggleMenu()">☰</button><b id="chat-title">Выберите чат</b></div>
            <button id="add-to-group-btn" class="btn-ui" style="display:none;" onclick="inviteToGroup()">+</button>
        </div>
        <div id="messages"></div>
        <div id="typing-monitor"></div>
        <div id="input-zone">
            <label style="cursor:pointer; font-size:20px;">📎<input type="file" id="file-input" hidden onchange="uploadFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение..." oninput="handleTyping()">
            <button class="btn-ui" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let userData = JSON.parse(localStorage.getItem('gchat_user')) || {id: Math.floor(1000 + Math.random()*8999), name: "Пользователь"};
        localStorage.setItem('gchat_user', JSON.stringify(userData));
        let chats = JSON.parse(localStorage.getItem('gchat_list') || '[]');
        let currentRoom = null;
        let typingTimeout;

        socket.emit('register_me', {id: userData.id});
        function updateProfileUI() { document.getElementById('display-name').innerText = userData.name; document.getElementById('display-id').innerText = "МОЙ ID: " + userData.id; }
        updateProfileUI();

        function handleTyping() {
            socket.emit('typing', { room: currentRoom, userName: userData.name, typing: true });
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => { socket.emit('typing', { room: currentRoom, typing: false }); }, 2000);
        }

        socket.on('is_typing', (data) => {
            const monitor = document.getElementById('typing-monitor');
            if(data.typing) { monitor.innerText = data.userName + " печатает..."; monitor.style.opacity = 1; }
            else { monitor.style.opacity = 0; }
        });

        function uploadFile() {
            const file = document.getElementById('file-input').files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = { room: currentRoom, userId: userData.id, userName: userData.name, type: 'file', content: e.target.result, fileName: file.name, time: new Date().toLocaleTimeString().slice(0,5) };
                socket.emit('send_msg', data);
            };
            reader.readAsDataURL(file);
        }

        function renderMsg(msg) {
            if(document.getElementById('m-'+msg.id)) return;
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.id = 'm-' + msg.id;
            d.className = 'msg ' + (msg.userId == userData.id ? 'me' : 'them');
            let body = msg.content;
            if(msg.type === 'file') {
                body = \`<a href="\${msg.content}" download="\${msg.fileName}" style="color:white; text-decoration:underline;">📄 \${msg.fileName}</a>\`;
            }
            d.innerHTML = \`<div class="msg-info"><span>\${msg.userName}</span><span>ID: \${msg.userId}</span></div>\${body}\`;
            box.appendChild(d);
        }

        function sendTxt() {
            const i = document.getElementById('msg-in');
            if(i.value && currentRoom) {
                socket.emit('send_msg', { room: currentRoom, userId: userData.id, userName: userData.name, type:'text', content: i.value, time: new Date().toLocaleTimeString().slice(0,5) });
                i.value = '';
                socket.emit('typing', { room: currentRoom, typing: false });
            }
        }

        socket.on('new_msg', (msg) => {
            let hist = JSON.parse(localStorage.getItem('hist_' + msg.room) || '[]');
            hist.push(msg); if(hist.length > 300) hist.shift();
            localStorage.setItem('hist_' + msg.room, JSON.stringify(hist));
            if(msg.room === currentRoom) { renderMsg(msg); scrollToBottom(); }
        });

        function switchRoom(room) {
            currentRoom = room;
            const c = chats.find(c => c.room === room);
            document.getElementById('chat-title').innerText = c ? c.name : "Чат";
            document.getElementById('messages').innerHTML = '';
            document.getElementById('add-to-group-btn').style.display = (c && c.type === 'group' && c.admin === userData.id) ? 'block' : 'none';
            const hist = JSON.parse(localStorage.getItem('hist_' + room) || '[]');
            hist.forEach(m => renderMsg(m));
            socket.emit('join_room', room);
            renderChats();
            if(window.innerWidth < 768) toggleMenu();
            scrollToBottom();
        }

        function createGroup() {
            const name = prompt("Название группы:"); if(!name) return;
            const room = "group-" + Math.random().toString(36).substr(2, 9);
            chats.push({name, room, type: 'group', admin: userData.id});
            localStorage.setItem('gchat_list', JSON.stringify(chats));
            switchRoom(room);
        }

        function addFriend() {
            const id = prompt("ID друга:"); if(!id) return;
            const room = [userData.id, parseInt(id)].sort().join('-');
            if(!chats.find(c => c.room === room)) { 
                chats.push({id: parseInt(id), name: "Чат с ID " + id, room, type: 'private'}); 
                localStorage.setItem('gchat_list', JSON.stringify(chats)); 
            }
            switchRoom(room);
        }

        function inviteToGroup() {
            const id = prompt("ID друга для добавления:");
            const c = chats.find(c => c.room === currentRoom);
            if(id && c) socket.emit('invite_to_group', { toId: parseInt(id), room: c.room, groupName: c.name });
        }

        socket.on('group_invite', (data) => {
            if(!chats.find(c => c.room === data.room)) {
                if(confirm("Приглашение в группу " + data.name + " (Админ ID: " + data.adminId + ")")) {
                    chats.push({name: data.name, room: data.room, type: 'group', admin: data.adminId});
                    localStorage.setItem('gchat_list', JSON.stringify(chats));
                    renderChats();
                }
            }
        });

        function renderChats() {
            const list = document.getElementById('rooms-list'); list.innerHTML = '';
            chats.forEach(c => {
                const d = document.createElement('div'); d.className = 'room-btn' + (currentRoom === c.room ? ' active' : '');
                d.onclick = () => switchRoom(c.room);
                d.innerHTML = \`<b>\${c.name}</b><br><small>\${c.type==='group'?'Группа':'Личный'}</small>\`;
                list.appendChild(d);
            });
        }

        function changeMyName() { const n = prompt("Имя:", userData.name); if(n) { userData.name = n; localStorage.setItem('gchat_user', JSON.stringify(userData)); updateProfileUI(); }}
        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }
        function scrollToBottom() { const b = document.getElementById('messages'); b.scrollTop = b.scrollHeight; }
        socket.on('load_history', (msgs) => { msgs.forEach(m => renderMsg(m)); scrollToBottom(); });
        renderChats();
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
