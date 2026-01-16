const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

let messageHistory = [];

io.on('connection', (socket) => {
    socket.on('register_me', (id) => { socket.myId = id; socket.join("user-" + id); });
    socket.on('join_room', (room) => { 
        socket.join(room); 
        socket.emit('load_history', messageHistory.filter(m => m.room === room)); 
    });
    socket.on('send_msg', (data) => {
        const msg = { id: Date.now() + Math.random(), ...data };
        messageHistory.push(msg);
        if (messageHistory.length > 500) messageHistory.shift(); 
        io.to(data.room).emit('new_msg', msg);
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-CHAT PREMIUM</title>
    <style>
        :root { --bg: #090b10; --panel: #12151c; --accent: #8b5cf6; --text: #f3f4f6; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; overflow: hidden; }
        
        /* Sidebar */
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #2d343f; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 25px 20px; border-bottom: 1px solid #2d343f; }
        #rooms-list { flex: 1; overflow-y: auto; padding: 15px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: #1a1f29; border-radius: 12px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
        .room-btn.active { border-color: var(--accent); background: rgba(139, 92, 246, 0.1); }

        /* Main Chat */
        #chat-area { flex: 1; display: flex; flex-direction: column; position: relative; }
        .top-bar { padding: 15px 20px; background: var(--panel); border-bottom: 1px solid #2d343f; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        
        .msg { max-width: 80%; padding: 12px 16px; border-radius: 18px; font-size: 15px; line-height: 1.4; position: relative; animation: fadeIn 0.2s ease; }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 4px; }
        .msg.them { align-self: flex-start; background: #1e2532; border-bottom-left-radius: 4px; }
        .msg-meta { font-size: 10px; opacity: 0.6; margin-bottom: 4px; display: flex; gap: 8px; }

        /* Input Area */
        #input-zone { padding: 15px; background: var(--panel); display: flex; align-items: center; gap: 12px; padding-bottom: calc(15px + env(safe-area-inset-bottom)); }
        #msg-in { flex: 1; background: #000; border: none; color: #fff; padding: 12px 18px; border-radius: 25px; font-size: 15px; }
        .icon-btn { font-size: 22px; cursor: pointer; filter: grayscale(0.5); transition: 0.2s; }
        .icon-btn:hover { filter: grayscale(0); transform: scale(1.1); }
        .rec-active { color: #ff4444 !important; filter: grayscale(0); animation: pulse 1s infinite; }

        /* Custom Modal UI */
        #modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: none; align-items: center; justify-content: center; z-index: 2000; backdrop-filter: blur(5px); }
        .modal { background: var(--panel); padding: 25px; border-radius: 20px; width: 90%; max-width: 350px; border: 1px solid #333; }
        .modal input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 10px; margin: 15px 0; }
        .modal-btns { display: flex; gap: 10px; justify-content: flex-end; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        @media (max-width: 768px) { #sidebar { position: fixed; left: -100%; width: 85%; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>

    <div id="modal-overlay">
        <div class="modal">
            <h3 id="modal-title" style="margin:0">Ввод данных</h3>
            <input type="text" id="modal-input">
            <div class="modal-btns">
                <button onclick="closeModal()" style="background:none; border:none; color:#aaa; cursor:pointer;">Отмена</button>
                <button id="modal-confirm" style="background:var(--accent); border:none; color:white; padding:8px 20px; border-radius:8px; cursor:pointer;">ОК</button>
            </div>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <div onclick="askName()" style="cursor:pointer; font-size:20px;"><b id="user-name">Загрузка...</b> ✏️</div>
            <div id="user-id" style="font-size:12px; color:var(--accent); margin-top:5px;">ID: ...</div>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:15px; display:flex; flex-direction:column; gap:10px;">
            <button onclick="askGroup()" style="background:var(--accent); border:none; color:white; padding:12px; border-radius:12px; font-weight:bold; cursor:pointer;">+ Создать группу</button>
            <button onclick="askFriend()" style="background:#2d343f; border:none; color:white; padding:12px; border-radius:12px; font-weight:bold; cursor:pointer;">+ Личный чат</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="toggleMenu()" style="background:none; border:none; color:white; font-size:24px;">☰</button>
            <b id="chat-title">Выберите чат</b>
            <div style="width:24px;"></div>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <span class="icon-btn" onclick="document.getElementById('file-in').click()">📎</span>
            <input type="file" id="file-in" hidden onchange="uploadFile()">
            <input type="text" id="msg-in" placeholder="Сообщение...">
            <span id="mic-btn" class="icon-btn" onclick="toggleVoice()">🎤</span>
            <span class="icon-btn" onclick="sendText()" style="color:var(--accent)">➤</span>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let userData = JSON.parse(localStorage.getItem('gchat_v4')) || {id: Math.floor(1000+Math.random()*8999), name: "Пользователь"};
        localStorage.setItem('gchat_v4', JSON.stringify(userData));
        let chats = JSON.parse(localStorage.getItem('gchat_rooms') || '[]');
        let currentRoom = null;
        let mediaRecorder;
        let audioChunks = [];

        socket.emit('register_me', userData.id);
        
        // Красивое модальное окно вместо prompt
        function showModal(title, callback) {
            document.getElementById('modal-overlay').style.display = 'flex';
            document.getElementById('modal-title').innerText = title;
            document.getElementById('modal-input').value = '';
            document.getElementById('modal-input').focus();
            document.getElementById('modal-confirm').onclick = () => {
                const val = document.getElementById('modal-input').value;
                if(val) callback(val);
                closeModal();
            };
        }
        function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

        function askName() { showModal("Ваше имя:", (n) => { userData.name = n; save(); updateUI(); }); }
        function askGroup() { showModal("Название группы:", (n) => {
            const room = "grp-" + Date.now();
            chats.push({name: n, room, type:'group'}); save(); switchRoom(room);
        }); }
        function askFriend() { showModal("ID друга:", (id) => {
            const room = [userData.id, parseInt(id)].sort().join('-');
            chats.push({name: "Чат " + id, room, type:'private'}); save(); switchRoom(room);
        }); }

        function save() { 
            localStorage.setItem('gchat_v4', JSON.stringify(userData));
            localStorage.setItem('gchat_rooms', JSON.stringify(chats));
        }

        function updateUI() {
            document.getElementById('user-name').innerText = userData.name;
            document.getElementById('user-id').innerText = "МОЙ ID: " + userData.id;
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
            const c = chats.find(ch => ch.room === room);
            document.getElementById('chat-title').innerText = c ? c.name : "Чат";
            document.getElementById('messages').innerHTML = '';
            socket.emit('join_room', room);
            updateUI();
            if(window.innerWidth < 768) toggleMenu();
        }

        function sendText() {
            const i = document.getElementById('msg-in');
            if(i.value && currentRoom) {
                socket.emit('send_msg', { room: currentRoom, userId: userData.id, userName: userData.name, type: 'text', content: i.value });
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
                    const blob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });
                    const reader = new FileReader();
                    reader.onload = () => {
                        socket.emit('send_msg', { room: currentRoom, userId: userData.id, userName: userData.name, type: 'voice', content: reader.result });
                    };
                    reader.readAsDataURL(blob);
                    document.getElementById('mic-btn').classList.remove('rec-active');
                };
                mediaRecorder.start();
                document.getElementById('mic-btn').classList.add('rec-active');
            } else {
                mediaRecorder.stop();
            }
        }

        function uploadFile() {
            const file = document.getElementById('file-in').files[0];
            const reader = new FileReader();
            reader.onload = () => {
                socket.emit('send_msg', { room: currentRoom, userId: userData.id, userName: userData.name, type: 'file', content: reader.result, fileName: file.name });
            };
            reader.readAsDataURL(file);
        }

        socket.on('new_msg', m => {
            if(m.room === currentRoom) {
                const box = document.getElementById('messages');
                const d = document.createElement('div');
                d.className = 'msg ' + (m.userId == userData.id ? 'me' : 'them');
                let content = m.content;
                if(m.type === 'voice') content = \`<audio src="\${m.content}" controls style="width:200px; height:30px;"></audio>\`;
                if(m.type === 'file') content = \`<a href="\${m.content}" download="\${m.fileName}" style="color:white">📄 \${m.fileName}</a>\`;
                d.innerHTML = \`<div class="msg-meta"><span>\${m.userName}</span><span>ID: \${m.userId}</span></div>\${content}\`;
                box.appendChild(d);
                box.scrollTop = box.scrollHeight;
            }
        });

        socket.on('load_history', msgs => msgs.forEach(m => {
             // рендер истории по аналогии с new_msg
        }));

        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }
        updateUI();
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
