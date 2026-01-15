const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

// ХРАНИЛИЩЕ НА СЕРВЕРЕ
let messageHistory = []; 
let existingRooms = []; // Пусто при старте, как ты и просил

io.on('connection', (socket) => {
    // Отправляем список комнат
    socket.emit('init_rooms', existingRooms);

    socket.on('join_room', (room) => {
        socket.join(room);
        const roomMsgs = messageHistory.filter(m => m.room === room);
        socket.emit('load_history', roomMsgs);
    });

    socket.on('create_room', (roomName) => {
        if (!existingRooms.includes(roomName)) {
            existingRooms.push(roomName);
            io.emit('room_created', roomName);
        }
    });

    socket.on('send_msg', (data) => {
        const msgObject = {
            type: data.type,
            room: data.room,
            userId: data.userId,
            content: data.content,
            time: new Date().toLocaleTimeString().slice(0,5)
        };
        messageHistory.push(msgObject);
        if(messageHistory.length > 500) messageHistory.shift();
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
    <title>G-CHAT ELITE</title>
    <style>
        :root { --bg: #0b0e14; --panel: #161b22; --accent: #7c3aed; --mine: #6d28d9; --text: #e6edf3; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; }
        
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; width: 100vw; overflow: hidden; position: fixed; }

        /* SIDEBAR */
        #sidebar { width: 280px; background: var(--panel); border-right: 1px solid #30363d; display: flex; flex-direction: column; transition: 0.3s; flex-shrink: 0; z-index: 1000; }
        .sidebar-header { padding: 20px; background: #0d1117; text-align: center; border-bottom: 1px solid #30363d; }
        .logo { font-size: 22px; font-weight: 900; letter-spacing: 1px; color: var(--accent); margin-bottom: 5px; }
        #rooms-list { flex: 1; padding: 15px; overflow-y: auto; }
        .room-btn { padding: 14px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border-radius: 12px; cursor: pointer; border: 1px solid transparent; }
        .room-btn.active { background: var(--accent); border-color: #a78bfa; font-weight: bold; }

        /* CHAT AREA */
        #chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg); height: 100%; width: 100%; }
        .top-bar { padding: 12px 15px; background: var(--panel); display: flex; align-items: center; gap: 15px; border-bottom: 1px solid #30363d; }
        .burger-btn { background: var(--accent); border: none; color: white; width: 40px; height: 40px; border-radius: 10px; font-size: 20px; display: flex; align-items: center; justify-content: center; }

        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .msg { max-width: 85%; padding: 12px 16px; border-radius: 18px; font-size: 15px; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
        .msg.them { align-self: flex-start; background: var(--panel); border-bottom-left-radius: 4px; border: 1px solid #30363d; }
        .msg.me { align-self: flex-end; background: var(--mine); border-bottom-right-radius: 4px; }
        .sender-id { font-size: 10px; color: #a78bfa; margin-bottom: 4px; font-weight: bold; }
        .msg img { max-width: 100%; border-radius: 10px; margin: 8px 0; display: block; }
        .msg audio { width: 100%; min-width: 160px; height: 35px; margin-top: 8px; filter: invert(1); }
        .time { font-size: 9px; opacity: 0.5; text-align: right; margin-top: 5px; }

        /* INPUT */
        #input-zone { padding: 10px 15px; background: var(--panel); display: flex; align-items: center; gap: 10px; border-top: 1px solid #30363d; padding-bottom: max(12px, env(safe-area-inset-bottom)); }
        input[type="text"] { flex: 1; background: #0d1117; border: 1px solid #30363d; color: white; padding: 12px 18px; border-radius: 25px; font-size: 16px; }
        .icon-btn { font-size: 24px; background: none; border: none; color: #8b949e; cursor: pointer; transition: 0.2s; }
        #mic-btn.recording { color: #ff453a; transform: scale(1.2); }
        .send-btn { background: var(--accent); border: none; width: 46px; height: 46px; border-radius: 50%; color: white; font-size: 20px; flex-shrink: 0; }

        .empty-state { text-align: center; margin-top: 100px; color: #8b949e; padding: 20px; }

        @media (max-width: 768px) {
            #sidebar { position: fixed; left: -100%; height: 100%; width: 80%; }
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>

    <div id="sidebar">
        <div class="sidebar-header">
            <div class="logo">G-CHAT ELITE</div>
            <div id="disp-id" style="font-size:12px; color:#a78bfa;">ID: ...</div>
        </div>
        <div id="rooms-list"></div>
        <button onclick="createRoom()" style="margin:20px; padding:15px; background:var(--accent); border:none; color:white; border-radius:12px; font-weight:bold; cursor:pointer;">+ СОЗДАТЬ ЧАТ</button>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button class="burger-btn" onclick="toggleMenu()">☰</button>
            <span id="current-room-title" style="font-weight:bold; font-size: 18px;">Выберите чат</span>
        </div>
        <div id="messages">
            <div class="empty-state">Создайте новый чат слева, чтобы начать общение</div>
        </div>
        <div id="input-zone">
            <label class="icon-btn">📎<input type="file" id="file-in" hidden accept="image/*" onchange="sendFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <button class="icon-btn" id="mic-btn">🎤</button>
            <button class="send-btn" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentRoom = null;
        let myUserId = localStorage.getItem('gchat_uid') || Math.floor(10000 + Math.random() * 90000);
        localStorage.setItem('gchat_uid', myUserId);
        document.getElementById('disp-id').innerText = "Твой ID: " + myUserId;

        // ИНИЦИАЛИЗАЦИЯ КОМНАТ
        socket.on('init_rooms', (rooms) => {
            const list = document.getElementById('rooms-list');
            list.innerHTML = '';
            rooms.forEach(r => addRoomButton(r));
            if(rooms.length > 0) switchRoom(rooms[0]);
        });

        socket.on('room_created', (roomName) => addRoomButton(roomName));

        socket.on('load_history', (msgs) => {
            const box = document.getElementById('messages');
            box.innerHTML = '';
            if(msgs.length === 0) box.innerHTML = '<div class="empty-state">Тут пока нет сообщений...</div>';
            msgs.forEach(m => renderMsg(m));
            box.scrollTop = box.scrollHeight;
        });

        socket.on('new_msg', (msg) => {
            if(msg.room === currentRoom) {
                const empty = document.querySelector('.empty-state');
                if(empty) empty.remove();
                renderMsg(msg);
            }
        });

        function renderMsg(msg) {
            const div = document.createElement('div');
            const isMe = (msg.userId == myUserId);
            div.className = 'msg ' + (isMe ? 'me' : 'them');
            let content = isMe ? '' : \`<div class="sender-id">ID: \${msg.userId}</div>\`;
            if(msg.type === 'text') content += \`<div>\${msg.content}</div>\`;
            if(msg.type === 'image') content += \`<img src="\${msg.content}" onclick="window.open(this.src)">\`;
            if(msg.type === 'audio') content += \`<audio controls src="\${msg.content}"></audio>\`;
            div.innerHTML = content + \`<div class="time">\${msg.time}</div>\`;
            const box = document.getElementById('messages');
            box.appendChild(div);
            box.scrollTop = box.scrollHeight;
        }

        // ОТПРАВКА
        function sendTxt() {
            if(!currentRoom) return alert('Сначала создай или выбери чат!');
            const inp = document.getElementById('msg-in');
            if(inp.value.trim()){
                socket.emit('send_msg', { type: 'text', content: inp.value, room: currentRoom, userId: myUserId });
                inp.value = '';
                inp.focus();
            }
        }

        function sendFile() {
            if(!currentRoom) return;
            const file = document.getElementById('file-in').files[0];
            if(file){
                const reader = new FileReader();
                reader.onload = (e) => socket.emit('send_msg', { type: 'image', content: e.target.result, room: currentRoom, userId: myUserId });
                reader.readAsDataURL(file);
            }
        }

        // ГОЛОСОВЫЕ (FIXED FOR MOBILE)
        let mediaRec; let chunks = [];
        const micBtn = document.getElementById('mic-btn');

        async function recStart(e) {
            e.preventDefault();
            if(!currentRoom) return;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Указываем кодек, который понимают почти все мобилки
                mediaRec = new MediaRecorder(stream);
                mediaRec.start();
                chunks = [];
                micBtn.classList.add('recording');
                micBtn.innerText = "🔴";
                
                mediaRec.ondataavailable = ev => chunks.push(ev.data);
                mediaRec.onstop = () => {
                    const blob = new Blob(chunks, { type: 'audio/mp4' }); // Изменил тип для совместимости
                    const reader = new FileReader();
                    reader.onload = (re) => socket.emit('send_msg', { type: 'audio', content: re.target.result, room: currentRoom, userId: myUserId });
                    reader.readAsDataURL(blob);
                    
                    // ГАРАНТИРОВАННЫЙ СБРОС КНОПКИ
                    micBtn.classList.remove('recording');
                    micBtn.innerText = "🎤";
                };
            } catch(err) { alert('Нужен доступ к микрофону!'); }
        }

        function recStop(e) {
            e.preventDefault();
            if(mediaRec && mediaRec.state === "recording") mediaRec.stop();
        }

        // Привязываем события для мобилок и ПК
        micBtn.addEventListener('mousedown', recStart);
        micBtn.addEventListener('mouseup', recStop);
        micBtn.addEventListener('touchstart', recStart);
        micBtn.addEventListener('touchend', recStop);

        // КОМНАТЫ
        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }
        
        function createRoom() {
            const name = prompt("Название нового чата:");
            if(name && name.trim()) {
                socket.emit('create_room', name.trim());
                setTimeout(() => switchRoom(name.trim()), 200);
            }
        }

        function addRoomButton(name) {
            const list = document.getElementById('rooms-list');
            if ([...list.children].some(b => b.innerText === '# ' + name)) return;
            const btn = document.createElement('div');
            btn.className = 'room-btn';
            btn.innerText = '# ' + name;
            btn.onclick = () => switchRoom(name);
            list.appendChild(btn);
        }

        function switchRoom(name) {
            currentRoom = name;
            document.getElementById('current-room-title').innerText = '# ' + name;
            document.querySelectorAll('.room-btn').forEach(b => {
                b.classList.toggle('active', b.innerText === '# ' + name);
            });
            socket.emit('join_room', name);
            if(window.innerWidth <= 768) toggleMenu();
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => { console.log('Elite Build Ready'); });
