const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

let serverHistory = []; 

io.on('connection', (socket) => {
    socket.on('register_me', (id) => { socket.myId = id; socket.join("user-" + id); });
    socket.on('join_room', (room) => { 
        socket.join(room); 
        socket.emit('load_server_history', serverHistory.filter(m => m.room === room)); 
    });
    socket.on('send_msg', (data) => {
        const msg = { id: Date.now() + Math.random(), ...data };
        serverHistory.push(msg);
        io.to(data.room).emit('new_msg', msg);
    });
    // Удаление сообщения для всех
    socket.on('delete_msg', (data) => {
        serverHistory = serverHistory.filter(m => m.id !== data.id);
        io.to(data.room).emit('msg_deleted', data.id);
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
    <title>G-chat</title>
    <style>
        :root { --bg: #07080c; --panel: #0f1117; --accent: #6d28d9; --text: #f3f4f6; --danger: #ff4444; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; margin: 0; padding: 0; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); height: 100dvh; display: flex; overflow: hidden; font-size: 13px; }
        
        #sidebar { width: 220px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; transition: 0.2s; z-index: 1000; }
        .sidebar-header { padding: 12px; border-bottom: 1px solid var(--accent); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 5px; }
        .room-btn { padding: 8px 12px; margin-bottom: 3px; background: #161b22; border-radius: 6px; cursor: pointer; border: 1px solid transparent; }
        .room-btn.active { border-color: var(--accent); background: rgba(109, 40, 217, 0.2); }

        #chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .top-bar { height: 40px; padding: 0 10px; background: var(--panel); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; background: #07080c; }
        
        .msg { max-width: 88%; padding: 6px 10px; border-radius: 10px; font-size: 12.5px; position: relative; }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 2px; }
        .msg.them { align-self: flex-start; background: #1e293b; border-bottom-left-radius: 2px; }
        .msg-meta { font-size: 8px; opacity: 0.5; margin-bottom: 2px; display: flex; justify-content: space-between; gap: 8px; }
        .del-msg { color: var(--danger); cursor: pointer; margin-left: 10px; font-weight: bold; }

        #input-zone { padding: 6px; background: var(--panel); display: flex; align-items: center; gap: 6px; border-top: 1px solid #1e293b; }
        #msg-in { flex: 1; background: #000; border: none; color: #fff; padding: 8px 12px; border-radius: 15px; font-size: 13px; height: 34px; }
        
        #modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: none; align-items: center; justify-content: center; z-index: 9999; }
        .modal { background: var(--panel); padding: 12px; border-radius: 12px; width: 80%; max-width: 260px; border: 1px solid #333; }
        .modal input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 6px; margin: 6px 0; font-size: 13px; }
        
        .btn { background: var(--accent); border: none; color: white; padding: 5px 10px; border-radius: 5px; font-weight: bold; font-size: 11px; cursor: pointer; }
        .icon { font-size: 18px; cursor: pointer; padding: 0 4px; display: flex; align-items: center; }
        .rec-controls { display: none; gap: 10px; }

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
            <div onclick="askName()"><b id="user-name">...</b> ✏️</div>
            <div id="user-id" style="font-size:10px; color:var(--accent); font-weight:bold;">ID: ...</div>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:8px; display:flex; gap:4px;">
            <button onclick="askGroup()" class="btn" style="flex:1">+Группа</button>
            <button onclick="askFriend()" class="btn" style="flex:1; background:#262626;">+ЛС</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="toggleMenu()" style="background:none; border:none; color:white; font-size:18px;">☰</button>
            <b style="font-size:13px;">G-chat</b>
            <button id="add-btn" class="btn" style="display:none; padding:2px 8px;">+</button>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <span id="attach-btn" class="icon" onclick="document.getElementById('file-in').click()">📎</span>
            <input type="file" id="file-in" hidden onchange="uploadFile()">
            
            <input type="text" id="msg-in" placeholder="Сообщение...">
            
            <div id="voice-ui" class="rec-controls">
                <span class="icon" onclick="cancelVoice()" style="color:var(--danger)">🗑️</span>
                <span class="icon" onclick="stopAndSendVoice()" style="color:#22c55e">🛑</span>
            </div>

            <span id="mic-btn" class="icon" onclick="startVoice()">🎤</span>
            <button id="send-btn" onclick="sendText()" class="btn">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        
        const savedUser = localStorage.getItem('gchat_v10_user');
        let userData = savedUser ? JSON.parse(savedUser) : {id: Math.floor(1000 + Math.random() * 8999), name: "Пользователь"};
        localStorage.setItem('gchat_v10_user', JSON.stringify(userData));

        let chats = JSON.parse(localStorage.getItem('gchat_v10_rooms')) || [];
        let currentRoom = null;
        let mediaRecorder;
        let audioChunks = [];
        let isCancelled = false;

        function save() {
            localStorage.setItem('gchat_v10_user', JSON.stringify(userData));
            localStorage.setItem('gchat_v10_rooms', JSON.stringify(chats));
        }

        function showModal(title, fields, callback) {
            const overlay = document.getElementById('modal-overlay');
            const i1 = document.getElementById('modal-input');
            const i2 = document.getElementById('modal-input-2');
            overlay.style.display = 'flex';
            document.getElementById('modal-title').innerText = title;
            i1.value = ''; i2.value = '';
            i2.style.display = fields > 1 ? 'block' : 'none';
            document.getElementById('modal-confirm').onclick = () => { callback(i1.value, i2.value); closeModal(); };
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
                if(!chats.find(c => c.room === r)) { chats.push({name: name, room:r, type:'private', friendId: id}); save(); }
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
            document.getElementById('messages').innerHTML = '';
            const hist = JSON.parse(localStorage.getItem('h10_' + room) || '[]');
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
            
            let content = m.content;
            if(m.type === 'voice') content = \`<audio src="\${m.content}" controls style="width:140px; height:28px;"></audio>\`;
            if(m.type === 'file') content = \`<a href="\${m.content}" download="\${m.fileName}" style="color:#fff">📄 Файл</a>\`;
            
            const delBtn = m.userId == userData.id ? \`<span class="del-msg" onclick="deleteMsg('\${m.id}')">✕</span>\` : '';

            d.innerHTML = \`
                <div class="msg-meta">
                    <b>\${m.userName} (ID:\${m.userId})</b>
                    \${delBtn}
                </div>
                <div>\${content}</div>\`;
            box.appendChild(d);
            scrollToBottom();
        }

        function deleteMsg(id) {
            if(confirm("Удалить сообщение для всех?")) socket.emit('delete_msg', {id, room: currentRoom});
        }

        socket.on('msg_deleted', id => {
            const el = document.getElementById('m-'+id);
            if(el) el.remove();
            let hist = JSON.parse(localStorage.getItem('h10_' + currentRoom) || '[]');
            hist = hist.filter(m => m.id !== id);
            localStorage.setItem('h10_' + currentRoom, JSON.stringify(hist));
        });

        socket.on('new_msg', m => {
            let hist = JSON.parse(localStorage.getItem('h10_' + m.room) || '[]');
            if(!hist.find(x => x.id === m.id)) {
                hist.push(m); if(hist.length > 300) hist.shift();
                localStorage.setItem('h10_' + m.room, JSON.stringify(hist));
            }
            if(m.room === currentRoom) renderMsg(m);
        });

        // --- ГОЛОСОВЫЕ С УПРАВЛЕНИЕМ ---
        async function startVoice() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                isCancelled = false;

                document.getElementById('mic-btn').style.display = 'none';
                document.getElementById('msg-in').style.display = 'none';
                document.getElementById('attach-btn').style.display = 'none';
                document.getElementById('send-btn').style.display = 'none';
                document.getElementById('voice-ui').style.display = 'flex';

                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    if (!isCancelled && audioChunks.length > 0) {
                        const blob = new Blob(audioChunks, { type: 'audio/ogg' });
                        const reader = new FileReader();
                        reader.onload = () => socket.emit('send_msg', { room: currentRoom, userId: userData.id, userName: userData.name, type: 'voice', content: reader.result });
                        reader.readAsDataURL(blob);
                    }
                    resetVoiceUI();
                };
                mediaRecorder.start();
            } catch(e) { alert("Микрофон заблокирован"); }
        }

        function stopAndSendVoice() { if(mediaRecorder) mediaRecorder.stop(); }
        function cancelVoice() { isCancelled = true; if(mediaRecorder) mediaRecorder.stop(); }

        function resetVoiceUI() {
            document.getElementById('mic-btn').style.display = 'flex';
            document.getElementById('msg-in').style.display = 'flex';
            document.getElementById('attach-btn').style.display = 'flex';
            document.getElementById('send-btn').style.display = 'flex';
            document.getElementById('voice-ui').style.display = 'none';
        }

        function sendText() {
            const i = document.getElementById('msg-in');
            if(i.value && currentRoom) {
                socket.emit('send_msg', { room: currentRoom, userId: userData.id, userName: userData.name, type:'text', content: i.value });
                i.value = '';
            }
        }

        function uploadFile() {
            const file = document.getElementById('file-in').files[0];
            const reader = new FileReader();
            reader.onload = () => socket.emit('send_msg', { room: currentRoom, userId: userData.id, userName: userData.name, type: 'file', content: reader.result, fileName: file.name });
            reader.readAsDataURL(file);
        }

        socket.on('group_invite', d => {
            if(confirm("Инвайт в: " + d.name)) { chats.push({name: d.name, room: d.room, type: 'group', admin: d.adminId}); save(); updateUI(); }
        });

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
