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
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; overflow: hidden; position: fixed; width: 100vw; }

        /* AUTH */
        #auth-screen { position: fixed; inset: 0; background: var(--bg); z-index: 2000; display: flex; align-items: center; justify-content: center; }
        .auth-card { background: var(--panel); padding: 40px; border-radius: 25px; width: 90%; max-width: 350px; text-align: center; border: 1px solid #333; }
        .auth-input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 15px; border-radius: 12px; margin-bottom: 20px; text-align: center; }

        /* SIDEBAR */
        #sidebar { width: 320px; background: var(--panel); border-right: 1px solid #333; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; background: #0d1117; border-bottom: 1px solid #333; }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: rgba(255,255,255,0.02); border-radius: 15px; border: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
        .room-btn.active { background: var(--accent); }
        .del-btn { opacity: 0.5; font-size: 18px; padding: 5px; }

        /* CHAT */
        #chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg); }
        .top-bar { padding: 15px; background: var(--panel); border-bottom: 1px solid #333; display: flex; align-items: center; gap: 15px; }
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 80%; padding: 12px; border-radius: 18px; position: relative; font-size: 15px; }
        .msg.me { align-self: flex-end; background: var(--mine); }
        .msg.them { align-self: flex-start; background: var(--panel); border: 1px solid #333; }

        #input-zone { padding: 10px; background: #0d1117; display: flex; align-items: center; gap: 10px; padding-bottom: max(15px, env(safe-area-inset-bottom)); }
        #msg-in { flex: 1; background: #000; border: 1px solid #333; color: #fff; padding: 12px 18px; border-radius: 25px; }
        .action-btn { background: var(--accent); border: none; color: white; width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }

        @media (max-width: 768px) { #sidebar { position: fixed; left: -100%; height: 100%; width: 85%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>
    <div id="auth-screen">
        <div class="auth-card">
            <h2 style="color:var(--accent)">G-CHAT ELITE</h2>
            <input type="text" id="auth-name" class="auth-input" placeholder="Твоё имя">
            <button class="auth-input" style="background:var(--accent); border:none; font-weight:bold;" onclick="login()">НАЧАТЬ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <button style="float:right; background:none; border:none; color:white; font-size:20px;" onclick="togglePrivacy()">👁️</button>
            <b style="color:var(--accent)">G-CHAT</b>
            <div id="my-id-display" style="font-size:12px; opacity:0.6; margin-top:5px;"></div>
        </div>
        <div id="rooms-list"></div>
        <button onclick="addFriend()" style="margin:15px; padding:15px; background:var(--accent); border:none; color:white; border-radius:12px; font-weight:bold;">+ ДОБАВИТЬ ДРУГА</button>
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
            <button class="action-btn" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let userData = JSON.parse(localStorage.getItem('gchat_user'));
        let privacyMode = localStorage.getItem('gchat_privacy') === 'true';
        let friends = JSON.parse(localStorage.getItem('gchat_friends') || '[]');
        let currentRoom = localStorage.getItem('gchat_last_room');

        function login() {
            const n = document.getElementById('auth-name').value;
            if(!n) return;
            userData = { id: Math.floor(100000 + Math.random()*899999), name: n };
            localStorage.setItem('gchat_user', JSON.stringify(userData));
            location.reload();
        }

        if(userData) {
            document.getElementById('auth-screen').style.display = 'none';
            updateProfile();
            renderFriends();
            if(currentRoom) switchRoom(currentRoom);
        }

        function togglePrivacy() {
            privacyMode = !privacyMode;
            localStorage.setItem('gchat_privacy', privacyMode);
            updateProfile();
            renderFriends();
            switchRoom(currentRoom); // Обновить шапку
        }

        function updateProfile() {
            document.getElementById('my-id-display').innerText = "Мой ID: " + (privacyMode ? "******" : userData.id);
        }

        function addFriend() {
            const fId = prompt("Введите ID друга (6 цифр):");
            const fName = prompt("Как его назвать?");
            if(fId && fName) {
                const room = [userData.id, parseInt(fId)].sort().join('-');
                if(!friends.find(f => f.id == fId)) {
                    friends.push({ id: parseInt(fId), name: fName, room: room });
                    localStorage.setItem('gchat_friends', JSON.stringify(friends));
                }
                renderFriends();
                switchRoom(room);
            }
        }

        function renderFriends() {
            const list = document.getElementById('rooms-list');
            list.innerHTML = '';
            friends.forEach(f => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (currentRoom === f.room ? ' active' : '');
                d.innerHTML = \`<div><b>\${f.name}</b><br><small>ID: \${privacyMode ? '******' : f.id}</small></div>
                               <div class="del-btn" onclick="deleteChat('\${f.room}', event)">🗑️</div>\`;
                d.onclick = () => switchRoom(f.room);
                list.appendChild(d);
            });
        }

        function deleteChat(room, e) {
            e.stopPropagation();
            if(confirm("Удалить этот чат из списка?")) {
                friends = friends.filter(f => f.room !== room);
                localStorage.setItem('gchat_friends', JSON.stringify(friends));
                if(currentRoom === room) currentRoom = null;
                renderFriends();
                location.reload();
            }
        }

        function switchRoom(room) {
            if(!room) return;
            currentRoom = room;
            localStorage.setItem('gchat_last_room', room);
            const friend = friends.find(f => f.room === room);
            document.getElementById('chat-title').innerText = friend ? friend.name : "Чат #" + (privacyMode ? "******" : room);
            socket.emit('join_room', room);
            renderFriends();
            if(window.innerWidth < 768) toggleMenu();
        }

        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }

        socket.on('load_history', (msgs) => {
            const box = document.getElementById('messages'); box.innerHTML = '';
            msgs.forEach(m => renderMsg(m)); box.scrollTop = box.scrollHeight;
        });

        socket.on('new_msg', (msg) => {
            if(msg.room === currentRoom) renderMsg(msg);
            
            // Если пришло сообщение от кого-то, кого нет в друзьях
            const otherId = msg.userId != userData.id ? msg.userId : null;
            if(otherId && !friends.find(f => f.id == otherId)) {
                friends.push({ id: otherId, name: "Неизвестный (#" + otherId + ")", room: msg.room });
                localStorage.setItem('gchat_friends', JSON.stringify(friends));
                renderFriends();
            }
        });

        socket.on('msg_deleted', (id) => { document.getElementById('msg-'+id)?.remove(); });

        function renderMsg(msg) {
            const d = document.createElement('div');
            d.id = 'msg-' + msg.id;
            d.className = 'msg ' + (msg.userId == userData.id ? 'me' : 'them');
            let content = "";
            if(msg.type === 'text') content = msg.content;
            else if(msg.type === 'image') content = \`<img src="\${msg.content}" width="100%" style="border-radius:10px;">\`;
            else content = \`<audio controls src="\${msg.content}" style="width:100%; filter:invert(1)"></audio>\`;
            
            d.innerHTML = \`<div style="font-size:10px; opacity:0.5">\${msg.userName}</div>\${content}<div style="font-size:8px; opacity:0.3; text-align:right">\${msg.time}</div>\`;
            d.onclick = () => { if(msg.userId == userData.id && confirm("Удалить?")) socket.emit('delete_msg', {id: msg.id, room: currentRoom}); };
            document.getElementById('messages').appendChild(d);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
        }

        function sendTxt() {
            const i = document.getElementById('msg-in');
            if(i.value && currentRoom) {
                socket.emit('send_msg', { type: 'text', content: i.value, room: currentRoom, userId: userData.id, userName: userData.name, time: new Date().toLocaleTimeString() });
                i.value = '';
            }
        }
        
        function sendFile() {
            const f = document.getElementById('file-in').files[0];
            if(f && currentRoom) {
                const r = new FileReader();
                r.onload = (e) => socket.emit('send_msg', { type: 'image', content: e.target.result, room: currentRoom, userId: userData.id, userName: userData.name, time: new Date().toLocaleTimeString() });
                r.readAsDataURL(f);
            }
        }

        // Голосовые
        let mediaRec; let chunks = [];
        const mic = document.getElementById('mic-btn');
        async function startR(e) {
            e.preventDefault();
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRec = new MediaRecorder(s); mediaRec.start(); chunks = [];
            mic.style.color = "red";
            mediaRec.ondataavailable = ev => chunks.push(ev.data);
            mediaRec.onstop = () => {
                const b = new Blob(chunks, { type: 'audio/mp4' });
                const r = new FileReader();
                r.onload = (e) => socket.emit('send_msg', { type: 'audio', content: e.target.result, room: currentRoom, userId: userData.id, userName: userData.name, time: new Date().toLocaleTimeString() });
                r.readAsDataURL(b); mic.style.color = "white";
            };
        }
        mic.addEventListener('touchstart', startR); mic.addEventListener('touchend', () => mediaRec.stop());
        mic.addEventListener('mousedown', startR); mic.addEventListener('mouseup', () => mediaRec.stop());
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
