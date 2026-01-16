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
        if (serverHistory.length > 500) serverHistory.shift(); 
        io.to(data.room).emit('new_msg', msg);
    });
    socket.on('invite_to_group', (data) => {
        io.to("user-" + data.toId).emit('group_invite', { room: data.room, name: data.groupName, adminId: socket.myId });
    });
    socket.on('kick_user', (data) => {
        io.to(data.room).emit('user_kicked', { userId: data.userId, room: data.room });
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-CHAT FIXED</title>
    <style>
        :root { --bg: #07080c; --panel: #0f1117; --accent: #6d28d9; --text: #f3f4f6; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; margin: 0; padding: 0; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); height: 100dvh; display: flex; overflow: hidden; font-size: 13px; }
        
        /* Сайдбар (еще меньше) */
        #sidebar { width: 220px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; transition: 0.2s; z-index: 1000; }
        .sidebar-header { padding: 12px; border-bottom: 1px solid var(--accent); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 5px; }
        .room-btn { padding: 8px 12px; margin-bottom: 3px; background: #161b22; border-radius: 6px; cursor: pointer; border: 1px solid transparent; }
        .room-btn.active { border-color: var(--accent); background: rgba(109, 40, 217, 0.2); }

        /* Чат зона */
        #chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .top-bar { height: 40px; padding: 0 10px; background: var(--panel); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; background: #07080c; }
        
        .msg { max-width: 88%; padding: 6px 10px; border-radius: 10px; font-size: 12.5px; line-height: 1.2; position: relative; }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 2px; }
        .msg.them { align-self: flex-start; background: #1e293b; border-bottom-left-radius: 2px; }
        .msg-meta { font-size: 8px; opacity: 0.5; margin-bottom: 2px; display: flex; justify-content: space-between; gap: 8px; }

        /* Ввод (компактный) */
        #input-zone { padding: 6px; background: var(--panel); display: flex; align-items: center; gap: 6px; border-top: 1px solid #1e293b; }
        #msg-in { flex: 1; background: #000; border: none; color: #fff; padding: 8px 12px; border-radius: 15px; font-size: 13px; height: 34px; }
        
        /* Модалки */
        #modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: none; align-items: center; justify-content: center; z-index: 9999; }
        .modal { background: var(--panel); padding: 12px; border-radius: 12px; width: 80%; max-width: 260px; border: 1px solid #333; }
        .modal input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 6px; margin: 6px 0; font-size: 13px; }
        
        .btn { background: var(--accent); border: none; color: white; padding: 5px 10px; border-radius: 5px; font-weight: bold; font-size: 11px; cursor: pointer; }
        .icon { font-size: 18px; cursor: pointer; padding: 0 4px; }

        @media (max-width: 768px) { 
            #sidebar { position: fixed; left: -220px; height: 100%; } 
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>

    <div id="modal-overlay">
        <div class="modal">
            <b id="modal-title">Ввод</b>
            <input type="text" id="modal-input" autocomplete="off">
            <input type="text" id="modal-input-2" style="display:none;" autocomplete="off">
            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:8px;">
                <button onclick="closeModal()" style="background:none; border:none; color:#aaa; font-size:11px;">Отмена</button>
                <button id="modal-confirm" class="btn">ОК</button>
            </div>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <div onclick="askName()"><b id="user-name">Загрузка...</b> ✏️</div>
            <div id="user-id" style="font-size:10px; color:var(--accent); font-weight:bold;">ID: ...</div>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:8px; display:flex; gap:4px;">
            <button onclick="askGroup()" class="btn" style="flex:1">+ Группа</button>
            <button onclick="askFriend()" class="btn" style="flex:1; background:#262626;">+ ЛС</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="toggleMenu()" style="background:none; border:none; color:white; font-size:18px;">☰</button>
            <b id="chat-title" style="font-size:13px; overflow:hidden; white-space:nowrap;">G-CHAT</b>
            <button id="add-btn" class="btn" style="display:none; padding:2px 8px;">+</button>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <span class="icon" onclick="document.getElementById('file-in').click()">📎</span>
            <input type="file" id="file-in" hidden onchange="uploadFile()">
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <span id="mic-btn" class="icon" onclick="toggleVoice()">🎤</span>
            <button onclick="sendText()" class="btn">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        
        // --- ПРАВИЛЬНАЯ ЗАГРУЗКА ---
        const savedUser = localStorage.getItem('gchat_final_user');
        let userData;
        if (savedUser) {
            userData = JSON.parse(savedUser);
        } else {
            userData = {id: Math.floor(1000 + Math.random() * 8999), name: "Пользователь"};
            localStorage.setItem('gchat_final_user', JSON.stringify(userData));
        }

        let chats = JSON.parse(localStorage.getItem('gchat_final_rooms')) || [];
        let currentRoom = null;
        let mediaRecorder;
        let audioChunks = [];

        function save() {
            localStorage.setItem('gchat_final_user', JSON.stringify(userData));
            localStorage.setItem('gchat_final_rooms', JSON.stringify(chats));
        }

        function showModal(title, fields, callback) {
            const overlay = document.getElementById('modal-overlay');
            const i1 = document.getElementById('modal-input');
            const i2 = document.getElementById('modal-input-2');
            overlay.style.display = 'flex';
            document.getElementById('modal-title').innerText = title;
            i1.value = ''; i2.value = '';
            i2.style.display = fields > 1 ? 'block' : 'none';
            i1.placeholder = fields > 1 ? "Ник друга" : "Ввод...";
            i2.placeholder = "ID друга";
            document.getElementById('modal-confirm').onclick = () => {
                callback(i1.value, i2.value);
                closeModal();
            };
        }
        function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

        function askName() { showModal("Ваш ник", 1, n => { if(n) { userData.name = n; save(); updateUI(); } }); }
        function askGroup() { showModal("Имя группы", 1, n => {
            if(n) {
                const r = "grp-" + Date.now();
                chats.push({name:n, room:r, type:'group', admin: userData.id});
                save(); switchRoom(r);
            }
        }); }
        function askFriend() { showModal("Добавить друга", 2, (name, id) => {
            if(name && id) {
                const r = [userData.id, parseInt(id)].sort().join('-');
                if(!chats.find(c => c.room === r)) {
                    chats.push({name: name, room:r, type:'private', friendId: id});
                    save();
                }
                switchRoom(r);
            }
        }); }

        function updateUI() {
            document.getElementById('user-name').innerText = userData.name;
            document.getElementById('user-id').innerText = "ID: " + userData.id;
            const list = document.getElementById('rooms-list'); list.innerHTML = '';
            chats.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (currentRoom === c.room ? ' active' : '');
                d.onclick = () => switchRoom(c.room);
                d.innerHTML = \`<b>\${c.name}</b>\`;
                list.appendChild(d);
            });
        }

        function switchRoom(room) {
            currentRoom = room;
            const c = chats.find(x => x.room === room);
            document.getElementById('chat-title').innerText = c ? c.name : "G-CHAT";
            document.getElementById('messages').innerHTML = '';
            
            const addBtn = document.getElementById('add-btn');
            if(c && c.type === 'group' && c.admin === userData.id) {
                addBtn.style.display = 'block';
                addBtn.onclick = () => showModal("Добавить участника", 1, id => {
                    socket.emit('invite_to_group', { toId: parseInt(id), room: c.room, groupName: c.name });
                });
            } else { addBtn.style.display = 'none'; }

            const hist = JSON.parse(localStorage.getItem('hist_v9_' + room) || '[]');
            hist.forEach(m => renderMsg(m));
            socket.emit('join_room', room);
            updateUI();
            if(window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
            scrollToBottom();
        }

        function renderMsg(m) {
            if(document.getElementById('m-'+m.id)) return;
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId == userData.id ? 'me' : 'them');
            d.id = 'm-' + m.id;
            
            const chat = chats.find(c => c.room === currentRoom);
            const isAdm = chat && chat.type === 'group' && chat.admin === userData.id && m.userId !== userData.id;
            
            let content = m.content;
            if(m.type === 'voice') content = \`<audio src="\${m.content}" controls style="width:140px; height:28px;"></audio>\`;
            if(m.type === 'file') content = \`<a href="\${m.content}" download="\${m.fileName}" style="color:#fff; font-size:11px;">📄 Файл</a>\`;
            
            d.innerHTML = \`
                <div class="msg-meta">
                    <b>\${m.userName}</b>
                    \${isAdm ? \`<span onclick="kickUser(\${m.userId})" style="color:var(--danger)">КИК</span>\` : \`<span>ID:\${m.userId}</span>\`}
                </div>
                <div>\${content}</div>\`;
            box.appendChild(d);
            scrollToBottom();
        }

        function kickUser(id) {
            if(confirm("Выгнать ID " + id + "?")) socket.emit('kick_user', {room: currentRoom, userId: id});
        }

        socket.on('user_kicked', data => {
            if(data.userId === userData.id) {
                alert("Вас кикнули");
                chats = chats.filter(c => c.room !== data.room);
                save(); location.reload();
            }
        });

        socket.on('new_msg', m => {
            let hist = JSON.parse(localStorage.getItem('hist_v9_' + m.room) || '[]');
            if(!hist.find(x => x.id === m.id)) {
                hist.push(m); if(hist.length > 300) hist.shift();
                localStorage.setItem('hist_v9_' + m.room, JSON.stringify(hist));
            }
            if(m.room === currentRoom) renderMsg(m);
        });

        socket.on('group_invite', d => {
            if(!chats.find(c => c.room === d.room)) {
                if(confirm("Инвайт в: " + d.name)) {
                    chats.push({name: d.name, room: d.room, type: 'group', admin: d.adminId});
                    save(); updateUI();
                }
            }
        });

        function sendText() {
            const i = document.getElementById('msg-in');
            if(i.value && currentRoom) {
                socket.emit('send_msg', { room: currentRoom, userId: userData.id, userName: userData.name, type:'text', content: i.value });
                i.value = '';
            }
        }

        async function toggleVoice() {
            try {
                if (!mediaRecorder || mediaRecorder.state === "inactive") {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];
                    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                    mediaRecorder.onstop = () => {
                        const blob = new Blob(audioChunks, { type: 'audio/ogg' });
                        const reader = new FileReader();
                        reader.onload = () => socket.emit('send_msg', { room: currentRoom, userId: userData.id, userName: userData.name, type: 'voice', content: reader.result });
                        reader.readAsDataURL(blob);
                        document.getElementById('mic-btn').style.color = "white";
                    };
                    mediaRecorder.start();
                    document.getElementById('mic-btn').style.color = "red";
                } else { mediaRecorder.stop(); }
            } catch(e) { alert("Ошибка доступа к микрофону"); }
        }

        function uploadFile() {
            const file = document.getElementById('file-in').files[0];
            const reader = new FileReader();
            reader.onload = () => socket.emit('send_msg', { room: currentRoom, userId: userData.id, userName: userData.name, type: 'file', content: reader.result, fileName: file.name });
            reader.readAsDataURL(file);
        }

        socket.emit('register_me', userData.id);
        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }
        function scrollToBottom() { const b = document.getElementById('messages'); b.scrollTop = b.scrollHeight; }
        updateUI();
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
