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
        if (serverHistory.length > 1000) serverHistory.shift(); 
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
    <title>G-CHAT MASTER</title>
    <style>
        :root { --bg: #090b10; --panel: #12151c; --accent: #8b5cf6; --danger: #ff4444; --text: #f3f4f6; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; overflow: hidden; }
        
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #2d343f; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 25px 20px; border-bottom: 1px solid var(--accent); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 15px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: #1a1f29; border-radius: 12px; cursor: pointer; border: 1px solid transparent; }
        .room-btn.active { border-color: var(--accent); background: rgba(139, 92, 246, 0.1); }

        #chat-area { flex: 1; display: flex; flex-direction: column; }
        .top-bar { padding: 15px 20px; background: var(--panel); border-bottom: 1px solid #2d343f; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        
        .msg { max-width: 85%; padding: 12px 16px; border-radius: 18px; font-size: 15px; position: relative; }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 4px; }
        .msg.them { align-self: flex-start; background: #1e2532; border-bottom-left-radius: 4px; }
        .msg-meta { font-size: 10px; opacity: 0.6; margin-bottom: 4px; display: flex; justify-content: space-between; }
        .kick-btn { color: var(--danger); font-size: 9px; cursor: pointer; text-decoration: underline; margin-left: 10px; }

        #input-zone { padding: 15px; background: var(--panel); display: flex; align-items: center; gap: 12px; }
        #msg-in { flex: 1; background: #000; border: none; color: #fff; padding: 12px 18px; border-radius: 25px; }
        
        #modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: none; align-items: center; justify-content: center; z-index: 2000; backdrop-filter: blur(5px); }
        .modal { background: var(--panel); padding: 25px; border-radius: 20px; width: 90%; max-width: 350px; border: 1px solid #333; }
        .modal input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 10px; margin: 10px 0; }
        
        .btn { background: var(--accent); border: none; color: white; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        @media (max-width: 768px) { #sidebar { position: fixed; left: -100%; width: 85%; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>

    <div id="modal-overlay">
        <div class="modal">
            <h3 id="modal-title" style="margin:0">Ввод</h3>
            <div id="modal-desc" style="font-size:12px; opacity:0.7; margin-top:5px;"></div>
            <input type="text" id="modal-input" placeholder="...">
            <input type="text" id="modal-input-2" style="display:none;" placeholder="...">
            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px;">
                <button onclick="closeModal()" style="background:none; border:none; color:#aaa;">Отмена</button>
                <button id="modal-confirm" class="btn">ОК</button>
            </div>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <div onclick="askName()" style="cursor:pointer;"><b id="user-name">Пользователь</b> ✏️</div>
            <div id="user-id" style="font-size:12px; color:var(--accent); margin-top:5px;">ID: ...</div>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:15px; display:flex; flex-direction:column; gap:10px;">
            <button onclick="askGroup()" class="btn">+ Группа</button>
            <button onclick="askFriend()" class="btn" style="background:#2d343f;">+ Личный чат</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="toggleMenu()" style="background:none; border:none; color:white; font-size:24px;">☰</button>
            <b id="chat-title">Выберите чат</b>
            <button id="add-btn" class="btn" style="display:none; padding:5px 12px;">+</button>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <span onclick="document.getElementById('file-in').click()" style="cursor:pointer; font-size:20px;">📎</span>
            <input type="file" id="file-in" hidden onchange="uploadFile()">
            <input type="text" id="msg-in" placeholder="Сообщение...">
            <span id="mic-btn" onclick="toggleVoice()" style="cursor:pointer; font-size:20px;">🎤</span>
            <button onclick="sendText()" class="btn">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let userData = JSON.parse(localStorage.getItem('gchat_v6_user')) || {id: Math.floor(1000+Math.random()*8999), name: "Пользователь"};
        let chats = JSON.parse(localStorage.getItem('gchat_v6_rooms') || '[]');
        let currentRoom = null;
        let mediaRecorder;
        let audioChunks = [];

        function saveCore() {
            localStorage.setItem('gchat_v6_user', JSON.stringify(userData));
            localStorage.setItem('gchat_v6_rooms', JSON.stringify(chats));
        }

        function showModal(title, desc, fields, callback) {
            document.getElementById('modal-overlay').style.display = 'flex';
            document.getElementById('modal-title').innerText = title;
            document.getElementById('modal-desc').innerText = desc;
            const i1 = document.getElementById('modal-input');
            const i2 = document.getElementById('modal-input-2');
            i1.value = ''; i2.value = '';
            i2.style.display = fields > 1 ? 'block' : 'none';
            i1.placeholder = fields > 1 ? "Имя" : "Ввод...";
            i2.placeholder = "ID друга";
            document.getElementById('modal-confirm').onclick = () => {
                if(fields === 1) callback(i1.value);
                else callback(i1.value, i2.value);
                closeModal();
            };
        }
        function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

        function askName() { showModal("Сменить имя", "", 1, n => { userData.name = n; saveCore(); updateUI(); }); }
        function askGroup() { showModal("Создать группу", "Вы будете админом", 1, n => {
            const r = "grp-"+Date.now();
            chats.push({name:n, room:r, type:'group', admin: userData.id});
            saveCore(); switchRoom(r);
        }); }
        function askFriend() { showModal("Новый чат", "Введите ник и ID друга", 2, (name, id) => {
            const r = [userData.id, parseInt(id)].sort().join('-');
            chats.push({name: name + " ("+id+")", room:r, type:'private'});
            saveCore(); switchRoom(r);
        }); }

        function updateUI() {
            document.getElementById('user-name').innerText = userData.name;
            document.getElementById('user-id').innerText = "ID: " + userData.id;
            const list = document.getElementById('rooms-list'); list.innerHTML = '';
            chats.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (currentRoom === c.room ? ' active' : '');
                d.onclick = () => switchRoom(c.room);
                d.innerHTML = \`<b>\${c.name}</b><br><small>\${c.type==='group'?'Группа':'Личный'}</small>\`;
                list.appendChild(d);
            });
        }

        function switchRoom(room) {
            currentRoom = room;
            const c = chats.find(x => x.room === room);
            document.getElementById('chat-title').innerText = c ? c.name : "Чат";
            document.getElementById('messages').innerHTML = '';
            
            // Кнопка добавления только для админа группы
            const addBtn = document.getElementById('add-btn');
            if(c && c.type === 'group' && c.admin === userData.id) {
                addBtn.style.display = 'block';
                addBtn.onclick = () => {
                    showModal("Добавить в группу", "Введите ID участника", 1, id => {
                        socket.emit('invite_to_group', { toId: parseInt(id), room: c.room, groupName: c.name });
                    });
                };
            } else { addBtn.style.display = 'none'; }

            const hist = JSON.parse(localStorage.getItem('hist_' + room) || '[]');
            hist.forEach(m => renderMsg(m));
            socket.emit('join_room', room);
            updateUI();
            scrollToBottom();
        }

        function renderMsg(m) {
            if(document.getElementById('msg-'+m.id)) return;
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId == userData.id ? 'me' : 'them');
            d.id = 'msg-' + m.id;
            
            const chat = chats.find(c => c.room === currentRoom);
            const canKick = chat && chat.type === 'group' && chat.admin === userData.id && m.userId !== userData.id;
            const kickHtml = canKick ? \`<span class="kick-btn" onclick="kickUser(\${m.userId})">ВЫГНАТЬ</span>\` : '';

            let content = m.content;
            if(m.type === 'voice') content = \`<audio src="\${m.content}" controls style="width:180px; height:30px;"></audio>\`;
            if(m.type === 'file') content = \`<a href="\${m.content}" download="\${m.fileName}" style="color:#fff">📄 \${m.fileName}</a>\`;
            
            d.innerHTML = \`
                <div class="msg-meta">
                    <span>\${m.userName} (ID:\${m.userId})</span>
                    \${kickHtml}
                </div>
                \${content}\`;
            box.appendChild(d);
            scrollToBottom();
        }

        function kickUser(id) {
            if(confirm("Выгнать ID " + id + "?")) socket.emit('kick_user', {room: currentRoom, userId: id});
        }

        socket.on('user_kicked', data => {
            if(data.userId === userData.id) {
                alert("Вас исключили из группы.");
                chats = chats.filter(c => c.room !== data.room);
                saveCore(); location.reload();
            }
        });

        socket.on('new_msg', m => {
            let hist = JSON.parse(localStorage.getItem('hist_' + m.room) || '[]');
            if(!hist.find(x => x.id === m.id)) {
                hist.push(m); if(hist.length > 300) hist.shift();
                localStorage.setItem('hist_' + m.room, JSON.stringify(hist));
            }
            if(m.room === currentRoom) renderMsg(m);
        });

        socket.on('group_invite', d => {
            if(!chats.find(c => c.room === d.room)) {
                if(confirm("Приглашение в группу " + d.name + " от ID " + d.adminId)) {
                    chats.push({name: d.name, room: d.room, type: 'group', admin: d.adminId});
                    saveCore(); updateUI();
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
