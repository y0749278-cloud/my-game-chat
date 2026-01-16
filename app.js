const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

let serverHistory = []; 

io.on('connection', (socket) => {
    socket.on('register_me', (id) => { 
        socket.myId = id; 
        socket.join("user-" + id); 
    });
    socket.on('join_room', (room) => { 
        socket.join(room); 
        socket.emit('load_server_history', serverHistory.filter(m => m.room === room)); 
    });
    socket.on('send_msg', (data) => {
        const msg = { id: Date.now() + Math.random(), ...data };
        serverHistory.push(msg);
        io.to(data.room).emit('new_msg', msg);
    });
    socket.on('delete_msg', (data) => {
        serverHistory = serverHistory.filter(m => m.id !== data.id);
        io.emit('msg_deleted', data.id); // Рассылаем всем
    });
    socket.on('invite_to_group', (data) => {
        io.to("user-" + data.toId).emit('group_invite', { room: data.room, name: data.groupName, adminId: socket.myId });
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-chat</title>
    <style>
        :root { --bg: #07080c; --panel: #0f1117; --accent: #6d28d9; --text: #f3f4f6; --danger: #ff4444; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; margin: 0; padding: 0; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); height: 100dvh; display: flex; overflow: hidden; font-size: 13px; }
        
        /* Окно Логина */
        #auth-screen { position: fixed; inset: 0; background: var(--bg); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .auth-box { background: var(--panel); padding: 25px; border-radius: 20px; width: 100%; max-width: 320px; border: 1px solid #222; text-align: center; }
        .auth-box h2 { margin-bottom: 20px; color: var(--accent); }
        .auth-box input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 12px; border-radius: 10px; margin-bottom: 10px; }

        /* Основной интерфейс */
        #sidebar { width: 240px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; transition: 0.2s; z-index: 1000; }
        .sidebar-header { padding: 15px; border-bottom: 1px solid var(--accent); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 5px; }
        .room-btn { padding: 12px; margin-bottom: 5px; background: #161b22; border-radius: 10px; cursor: pointer; border: 1px solid transparent; }
        .room-btn.active { border-color: var(--accent); background: rgba(109, 40, 217, 0.2); }

        #chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .top-bar { height: 50px; padding: 0 15px; background: var(--panel); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
        
        .msg { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 13px; position: relative; word-wrap: break-word; }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 2px; }
        .msg.them { align-self: flex-start; background: #1e293b; border-bottom-left-radius: 2px; }
        .msg-meta { font-size: 9px; opacity: 0.6; margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center; }
        .del-msg { color: var(--danger); cursor: pointer; font-weight: bold; padding: 0 5px; }

        #input-zone { padding: 10px; background: var(--panel); display: flex; align-items: center; gap: 8px; border-top: 1px solid #1e293b; }
        #msg-in { flex: 1; background: #000; border: none; color: #fff; padding: 10px 15px; border-radius: 20px; font-size: 14px; }
        
        .btn { background: var(--accent); border: none; color: white; padding: 10px 15px; border-radius: 10px; font-weight: bold; cursor: pointer; }
        .icon { font-size: 22px; cursor: pointer; color: #aaa; }
        .rec-controls { display: none; gap: 20px; background: #000; padding: 5px 20px; border-radius: 20px; }

        @media (max-width: 768px) { 
            #sidebar { position: fixed; left: -240px; height: 100%; } 
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="auth-box">
            <h2>G-chat</h2>
            <input type="text" id="auth-name" placeholder="Имя">
            <input type="password" id="auth-pass" placeholder="Пароль">
            <button onclick="handleAuth('login')" class="btn" style="width:100%; margin-bottom:10px;">Войти</button>
            <button onclick="handleAuth('reg')" class="btn" style="width:100%; background:#222;">Регистрация</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <b id="display-name">...</b>
            <div id="display-id" style="font-size:10px; color:var(--accent);">ID: ...</div>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:10px; display:flex; gap:5px;">
            <button onclick="createGroup()" class="btn" style="flex:1">+ Группа</button>
            <button onclick="addFriend()" class="btn" style="flex:1; background:#222;">+ Друг</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="document.getElementById('sidebar').classList.toggle('open')" style="background:none; border:none; color:white; font-size:24px;">☰</button>
            <b id="chat-title">G-chat</b>
            <button id="add-btn" class="btn" style="display:none; padding:5px 10px;">+</button>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <span class="icon" onclick="document.getElementById('file-in').click()">📎</span>
            <input type="file" id="file-in" hidden onchange="uploadFile()">
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <div id="voice-ui" class="rec-controls">
                <span onclick="cancelVoice()" style="color:var(--danger)">🗑️</span>
                <span onclick="stopVoice()" style="color:#22c55e">🛑</span>
            </div>
            <span id="mic-btn" class="icon" onclick="startVoice()">🎤</span>
            <button onclick="sendText()" class="btn">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentUser = JSON.parse(localStorage.getItem('gchat_user'));
        let chats = JSON.parse(localStorage.getItem('gchat_chats')) || [];
        let currentRoom = null;
        let mediaRecorder, audioChunks = [], isCancel = false;

        // Авторизация
        if(currentUser) document.getElementById('auth-screen').style.display = 'none';

        function handleAuth(type) {
            const name = document.getElementById('auth-name').value;
            const pass = document.getElementById('auth-pass').value;
            if(!name || !pass) return alert("Заполни поля!");

            if(type === 'reg') {
                const id = Math.floor(1000 + Math.random() * 8999);
                currentUser = { name, pass, id };
                localStorage.setItem('user_db_' + name, JSON.stringify(currentUser));
                alert("Зарегистрирован! Теперь войди.");
            } else {
                const db = JSON.parse(localStorage.getItem('user_db_' + name));
                if(db && db.pass === pass) {
                    currentUser = db;
                    localStorage.setItem('gchat_user', JSON.stringify(currentUser));
                    location.reload();
                } else { alert("Неверно!"); }
            }
        }

        function saveChats() { localStorage.setItem('gchat_chats', JSON.stringify(chats)); }

        function createGroup() {
            const n = prompt("Имя группы:");
            if(n) {
                const r = "grp-" + Date.now();
                chats.push({name: n, room: r, type: 'group', admin: currentUser.id});
                saveChats(); switchRoom(r);
            }
        }

        function addFriend() {
            const name = prompt("Имя друга:");
            const id = prompt("ID друга:");
            if(name && id) {
                const r = [currentUser.id, parseInt(id)].sort().join('-');
                if(!chats.find(c => c.room === r)) {
                    chats.push({name: name, room: r, type: 'private'});
                    saveChats();
                }
                switchRoom(r);
            }
        }

        function switchRoom(room) {
            currentRoom = room;
            const c = chats.find(x => x.room === room);
            document.getElementById('chat-title').innerText = c ? c.name : "Чат";
            document.getElementById('messages').innerHTML = '';
            
            const addBtn = document.getElementById('add-btn');
            if(c && c.type === 'group' && c.admin === currentUser.id) {
                addBtn.style.display = 'block';
                addBtn.onclick = () => {
                    const id = prompt("ID игрока:");
                    if(id) socket.emit('invite_to_group', { toId: parseInt(id), room: c.room, groupName: c.name });
                };
            } else { addBtn.style.display = 'none'; }

            socket.emit('join_room', room);
            updateUI();
            document.getElementById('sidebar').classList.remove('open');
        }

        function renderMsg(m) {
            if(document.getElementById('m-'+m.id)) return;
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId == currentUser.id ? 'me' : 'them');
            d.id = 'm-' + m.id;
            
            let content = m.content;
            if(m.type === 'voice') content = \`<audio src="\${m.content}" controls style="width:150px; height:30px;"></audio>\`;
            if(m.type === 'file') content = \`<a href="\${m.content}" download="\${m.fileName}" style="color:#fff">📄 Файл</a>\`;
            
            const del = m.userId == currentUser.id ? \`<span class="del-msg" onclick="deleteMsg('\${m.id}')">✕</span>\` : '';
            d.innerHTML = \`<div class="msg-meta"><b>\${m.userName} (ID:\${m.userId})</b>\${del}</div><div>\${content}</div>\`;
            box.appendChild(d);
            box.scrollTop = box.scrollHeight;
        }

        function deleteMsg(id) {
            if(confirm("Удалить?")) socket.emit('delete_msg', {id, room: currentRoom});
        }

        socket.on('msg_deleted', id => {
            const el = document.getElementById('m-'+id);
            if(el) el.remove();
        });

        socket.on('new_msg', m => { if(m.room === currentRoom) renderMsg(m); });

        socket.on('group_invite', d => {
            if(!chats.find(c => c.room === d.room)) {
                if(confirm("Инвайт в: " + d.name)) {
                    chats.push({name: d.name, room: d.room, type: 'group', admin: d.adminId});
                    saveChats(); updateUI();
                }
            }
        });

        function sendText() {
            const i = document.getElementById('msg-in');
            if(i.value && currentRoom) {
                socket.emit('send_msg', { room: currentRoom, userId: currentUser.id, userName: currentUser.name, type:'text', content: i.value });
                i.value = '';
            }
        }

        async function startVoice() {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = []; isCancel = false;
            document.getElementById('voice-ui').style.display = 'flex';
            document.getElementById('mic-btn').style.display = 'none';
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                if(!isCancel) {
                    const blob = new Blob(audioChunks, { type: 'audio/ogg' });
                    const reader = new FileReader();
                    reader.onload = () => socket.emit('send_msg', { room: currentRoom, userId: currentUser.id, userName: currentUser.name, type:'voice', content: reader.result });
                    reader.readAsDataURL(blob);
                }
                document.getElementById('voice-ui').style.display = 'none';
                document.getElementById('mic-btn').style.display = 'flex';
            };
            mediaRecorder.start();
        }
        function stopVoice() { mediaRecorder.stop(); }
        function cancelVoice() { isCancel = true; mediaRecorder.stop(); }

        function uploadFile() {
            const f = document.getElementById('file-in').files[0];
            const r = new FileReader();
            r.onload = () => socket.emit('send_msg', { room: currentRoom, userId: currentUser.id, userName: currentUser.name, type:'file', content: r.result, fileName: f.name });
            r.readAsDataURL(f);
        }

        function updateUI() {
            if(!currentUser) return;
            document.getElementById('display-name').innerText = currentUser.name;
            document.getElementById('display-id').innerText = "ID: " + currentUser.id;
            const l = document.getElementById('rooms-list'); l.innerHTML = '';
            chats.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (currentRoom === c.room ? ' active' : '');
                d.onclick = () => switchRoom(c.room);
                d.innerHTML = \`<b>\${c.name}</b>\`;
                l.appendChild(d);
            });
        }

        if(currentUser) {
            socket.emit('register_me', currentUser.id);
            updateUI();
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
