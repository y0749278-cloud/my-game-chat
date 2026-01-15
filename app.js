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

function saveDB() { fs.writeFileSync('messages.json', JSON.stringify(messageHistory.slice(-2000))); }

io.on('connection', (socket) => {
    // При подключении сразу подписываем пользователя на его личный канал по ID
    socket.on('register_me', (myId) => {
        socket.join("user-" + myId);
    });

    socket.on('join_room', (room) => {
        socket.join(room);
        socket.emit('load_history', messageHistory.filter(m => m.room === room));
    });

    socket.on('send_msg', (data) => {
        const msg = {
            id: Date.now() + Math.random(),
            type: data.type, room: data.room, userId: data.userId,
            userName: data.userName, content: data.content, time: data.time,
            toId: data.toId // ID получателя
        };
        messageHistory.push(msg);
        saveDB();

        // Отправляем в общую комнату и лично получателю, чтобы у него создался чат
        io.to(data.room).emit('new_msg', msg);
        io.to("user-" + data.toId).emit('notify_new_contact', msg);
    });

    socket.on('delete_msg', (data) => {
        messageHistory = messageHistory.filter(m => m.id !== data.id);
        saveDB();
        io.to(data.room).emit('msg_deleted', data.id);
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
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline:none; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; overflow: hidden; position: fixed; width: 100vw; }
        #sidebar { width: 320px; background: var(--panel); border-right: 1px solid #333; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; background: #0d1117; border-bottom: 1px solid #333; }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: rgba(255,255,255,0.02); border-radius: 15px; border: 1px solid #333; display: flex; justify-content: space-between; align-items: center; cursor:pointer; }
        .room-btn.active { background: var(--accent); }
        .room-actions { display: flex; gap: 12px; }
        #chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg); }
        .top-bar { padding: 15px; background: var(--panel); border-bottom: 1px solid #333; display: flex; align-items: center; gap: 15px; }
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 80%; padding: 12px; border-radius: 18px; font-size: 15px; }
        .msg.me { align-self: flex-end; background: var(--mine); }
        .msg.them { align-self: flex-start; background: var(--panel); border: 1px solid #333; }
        #input-zone { padding: 10px; background: #0d1117; display: flex; align-items: center; gap: 10px; padding-bottom: max(15px, env(safe-area-inset-bottom)); }
        #msg-in { flex: 1; background: #000; border: 1px solid #333; color: #fff; padding: 12px 18px; border-radius: 25px; }
        @media (max-width: 768px) { #sidebar { position: fixed; left: -100%; height: 100%; width: 85%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>
    <div id="sidebar">
        <div class="sidebar-header">
            <button style="float:right; background:none; border:none; color:white; font-size:20px;" onclick="togglePrivacy()">👁️</button>
            <b style="color:var(--accent)">G-CHAT ELITE</b>
            <div id="my-id-display" style="font-size:12px; opacity:0.6; margin-top:5px;"></div>
        </div>
        <div id="rooms-list"></div>
        <button onclick="addFriend()" style="margin:15px; padding:15px; background:var(--accent); border:none; color:white; border-radius:12px; font-weight:bold;">+ НАПИСАТЬ ПО ID</button>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="toggleMenu()" style="background:var(--accent); border:none; color:white; padding:8px 12px; border-radius:8px;">☰</button>
            <b id="chat-title">Выберите чат</b>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <label style="font-size:24px;">📎<input type="file" id="file-in" hidden onchange="sendFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение...">
            <div id="mic-btn" style="font-size:24px;">🎤</div>
            <button style="background:var(--accent); border:none; color:white; width:45px; height:45px; border-radius:50%;" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let userData = JSON.parse(localStorage.getItem('gchat_user')) || {id: Math.floor(100000 + Math.random()*899999), name: "User"};
        if(!localStorage.getItem('gchat_user')) localStorage.setItem('gchat_user', JSON.stringify(userData));

        let privacyMode = localStorage.getItem('gchat_privacy') === 'true';
        let friends = JSON.parse(localStorage.getItem('gchat_friends') || '[]');
        let currentRoom = localStorage.getItem('gchat_last_room');

        socket.emit('register_me', userData.id);

        function updateProfile() { document.getElementById('my-id-display').innerText = "Мой ID: " + (privacyMode ? "******" : userData.id); }
        function togglePrivacy() { privacyMode = !privacyMode; localStorage.setItem('gchat_privacy', privacyMode); updateProfile(); renderFriends(); }
        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }

        function addFriend() {
            const fId = prompt("Введите ID:");
            if(!fId) return;
            const fName = prompt("Имя контакта:") || "Друг #" + fId;
            const room = [userData.id, parseInt(fId)].sort().join('-');
            saveContact(parseInt(fId), fName, room);
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
                const d = document.createElement('div');
                d.className = 'room-btn' + (currentRoom === f.room ? ' active' : '');
                d.onclick = () => switchRoom(f.room);
                d.innerHTML = \`<div><b>\${f.name}</b><br><small>ID: \${privacyMode ? '******' : f.id}</small></div>
                               <div class="room-actions">
                                 <span onclick="renameContact(\${f.id}, event)">✏️</span>
                                 <span onclick="deleteChat('\${f.room}', event)">🗑️</span>
                               </div>\`;
                list.appendChild(d);
            });
        }

        function renameContact(id, e) {
            e.stopPropagation();
            const n = prompt("Новое имя:");
            if(n) {
                const f = friends.find(f => f.id === id);
                if(f) saveContact(id, n, f.room);
            }
        }

        function deleteChat(room, e) {
            e.stopPropagation();
            if(confirm("Удалить чат?")) {
                friends = friends.filter(f => f.room !== room);
                localStorage.setItem('gchat_friends', JSON.stringify(friends));
                if(currentRoom === room) currentRoom = null;
                renderFriends();
            }
        }

        function switchRoom(room) {
            currentRoom = room;
            localStorage.setItem('gchat_last_room', room);
            const f = friends.find(f => f.room === room);
            document.getElementById('chat-title').innerText = f ? f.name : "Чат";
            socket.emit('join_room', room);
            renderFriends();
            if(window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
        }

        // Ключевое исправление: ловим уведомление о сообщении от незнакомца
        socket.on('notify_new_contact', (msg) => {
            const otherId = msg.userId;
            if(!friends.find(f => f.id == otherId)) {
                saveContact(otherId, "Незнакомец #" + otherId, msg.room);
            }
        });

        socket.on('new_msg', (msg) => {
            if(msg.room === currentRoom) renderMsg(msg);
        });

        socket.on('load_history', (msgs) => {
            const box = document.getElementById('messages'); box.innerHTML = '';
            msgs.forEach(m => renderMsg(m)); box.scrollTop = box.scrollHeight;
        });

        socket.on('msg_deleted', (id) => { document.getElementById('msg-'+id)?.remove(); });

        function renderMsg(msg) {
            const d = document.createElement('div');
            d.id = 'msg-' + msg.id;
            d.className = 'msg ' + (msg.userId == userData.id ? 'me' : 'them');
            let c = msg.type === 'text' ? msg.content : (msg.type === 'image' ? \`<img src="\${msg.content}" width="100%" style="border-radius:10px;">\` : \`<audio controls src="\${msg.content}" style="width:100%; filter:invert(1)"></audio>\`);
            d.innerHTML = \`<div style="font-size:10px; opacity:0.5">\${msg.userName}</div>\${c}<div style="font-size:8px; opacity:0.3; text-align:right">\${msg.time}</div>\`;
            d.onclick = () => { if(msg.userId == userData.id && confirm("Удалить?")) socket.emit('delete_msg', {id: msg.id, room: currentRoom}); };
            document.getElementById('messages').appendChild(d);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
        }

        function sendTxt() {
            const i = document.getElementById('msg-in');
            const f = friends.find(f => f.room === currentRoom);
            if(i.value && currentRoom && f) {
                socket.emit('send_msg', { 
                    type: 'text', content: i.value, room: currentRoom, 
                    userId: userData.id, userName: userData.name, 
                    time: new Date().toLocaleTimeString(), toId: f.id 
                });
                i.value = '';
            }
        }

        function sendFile() {
            const file = document.getElementById('file-in').files[0];
            const f = friends.find(f => f.room === currentRoom);
            if(file && currentRoom && f) {
                const r = new FileReader();
                r.onload = (e) => socket.emit('send_msg', { 
                    type: 'image', content: e.target.result, room: currentRoom, 
                    userId: userData.id, userName: userData.name, 
                    time: new Date().toLocaleTimeString(), toId: f.id 
                });
                r.readAsDataURL(file);
            }
        }

        let mediaRec; let chunks = [];
        const mic = document.getElementById('mic-btn');
        async function startR(e) {
            e.preventDefault(); 
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRec = new MediaRecorder(s); mediaRec.start(); chunks = []; mic.style.color = "red";
            mediaRec.ondataavailable = ev => chunks.push(ev.data);
            mediaRec.onstop = () => {
                const b = new Blob(chunks, { type: 'audio/mp4' });
                const r = new FileReader();
                const f = friends.find(f => f.room === currentRoom);
                r.onload = (e) => socket.emit('send_msg', { 
                    type: 'audio', content: e.target.result, room: currentRoom, 
                    userId: userData.id, userName: userData.name, 
                    time: new Date().toLocaleTimeString(), toId: f.id 
                });
                r.readAsDataURL(b); mic.style.color = "white";
            };
        }
        mic.addEventListener('touchstart', startR); mic.addEventListener('touchend', () => mediaRec.stop());
        mic.addEventListener('mousedown', startR); mic.addEventListener('mouseup', () => mediaRec.stop());

        updateProfile();
        renderFriends();
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
