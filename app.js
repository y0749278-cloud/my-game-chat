const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

// ПАМЯТЬ СЕРВЕРА
let messageHistory = []; 
let existingRooms = ['General']; // Список комнат теперь хранится тут

io.on('connection', (socket) => {
    // При входе отправляем список всех созданных комнат
    socket.emit('init_rooms', existingRooms);

    socket.on('join_room', (room) => {
        socket.join(room);
        const roomMsgs = messageHistory.filter(m => m.room === room);
        socket.emit('load_history', roomMsgs);
    });

    // Создание новой комнаты (теперь она сохраняется на сервере)
    socket.on('create_room', (roomName) => {
        if (!existingRooms.includes(roomName)) {
            existingRooms.push(roomName);
            io.emit('room_created', roomName); // Оповещаем всех о новом чате
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
        if(messageHistory.length > 300) messageHistory.shift();
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
    <title>G-CHAT PRO MAX</title>
    <style>
        :root { --bg: #0f0b1e; --panel: #1a162e; --accent: #7c3aed; --mine: #6d28d9; --text: #e9d5ff; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        
        /* Исправление для мобилок: используем dvh для динамической высоты */
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; width: 100vw; overflow: hidden; position: fixed; }

        /* БОКОВАЯ ПАНЕЛЬ */
        #sidebar { width: 280px; background: var(--panel); border-right: 1px solid #2e1065; display: flex; flex-direction: column; transition: 0.3s; flex-shrink: 0; z-index: 1000; }
        .header { padding: 15px; background: #2e1065; text-align: center; font-weight: bold; font-size: 14px; }
        #rooms-list { flex: 1; padding: 10px; overflow-y: auto; }
        .room-btn { padding: 14px; margin-bottom: 8px; background: rgba(255,255,255,0.05); border-radius: 12px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
        .room-btn.active { background: var(--accent); border-color: #a78bfa; font-weight: bold; }

        /* ЧАТ AREA */
        #chat-area { flex: 1; display: flex; flex-direction: column; background: #0f0b1e; position: relative; height: 100%; width: 100%; }
        .top-bar { padding: 10px; background: var(--panel); display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #2e1065; }
        .burger-btn { background: var(--accent); border: none; color: white; padding: 10px 14px; border-radius: 8px; font-size: 18px; }

        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 85%; padding: 10px 14px; border-radius: 16px; font-size: 15px; position: relative; }
        .msg.them { align-self: flex-start; background: #2e1065; border-bottom-left-radius: 4px; }
        .msg.me { align-self: flex-end; background: var(--mine); border-bottom-right-radius: 4px; }
        .sender-id { font-size: 10px; color: #a78bfa; margin-bottom: 2px; }
        .msg img { max-width: 100%; border-radius: 10px; margin: 5px 0; display: block; }
        .time { font-size: 9px; opacity: 0.5; text-align: right; margin-top: 4px; }

        /* ВВОД - Улучшено для мобилок */
        #input-zone { padding: 8px 12px; background: var(--panel); display: flex; align-items: center; gap: 8px; border-top: 1px solid #2e1065; padding-bottom: max(8px, env(safe-area-inset-bottom)); }
        input[type="text"] { flex: 1; background: #000; border: 1px solid #4c1d95; color: white; padding: 12px 16px; border-radius: 25px; outline: none; font-size: 16px; }
        .icon-btn { font-size: 22px; background: none; border: none; color: #a78bfa; padding: 5px; }
        .send-btn { background: var(--accent); border: none; width: 44px; height: 44px; border-radius: 50%; color: white; font-size: 20px; flex-shrink: 0; }

        @media (max-width: 768px) {
            #sidebar { position: fixed; left: -100%; height: 100%; }
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>

    <div id="sidebar">
        <div class="header">G-CHAT PRO MAX<br><span id="disp-id">ID: ...</span></div>
        <div id="rooms-list"></div>
        <button onclick="createRoom()" style="margin:10px; padding:12px; background:var(--accent); border:none; color:white; border-radius:10px; font-weight:bold;">+ СОЗДАТЬ ЧАТ</button>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button class="burger-btn" onclick="toggleMenu()">☰</button>
            <span id="current-room-title" style="font-weight:bold;"># General</span>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <label class="icon-btn">📎<input type="file" id="file-in" hidden accept="image/*" onchange="sendFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <button class="icon-btn" id="mic-btn" onmousedown="recStart()" onmouseup="recStop()" ontouchstart="recStart()" ontouchend="recStop()">🎤</button>
            <button class="send-btn" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentRoom = 'General';
        
        let myUserId = localStorage.getItem('gchat_uid') || Math.floor(10000 + Math.random() * 90000);
        localStorage.setItem('gchat_uid', myUserId);
        document.getElementById('disp-id').innerText = "Твой ID: " + myUserId;

        // ИНИЦИАЛИЗАЦИЯ
        socket.on('init_rooms', (rooms) => {
            rooms.forEach(r => addRoomButton(r));
            switchRoom('General');
        });

        socket.on('room_created', (roomName) => {
            addRoomButton(roomName);
        });

        socket.on('load_history', (msgs) => {
            const box = document.getElementById('messages');
            box.innerHTML = '';
            msgs.forEach(m => renderMsg(m));
            box.scrollTop = box.scrollHeight;
        });

        socket.on('new_msg', (msg) => {
            if(msg.room === currentRoom) renderMsg(msg);
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

        function sendTxt() {
            const inp = document.getElementById('msg-in');
            if(inp.value.trim()){
                socket.emit('send_msg', { type: 'text', content: inp.value, room: currentRoom, userId: myUserId });
                inp.value = '';
                inp.focus(); // Чтобы клавиатура не закрывалась
            }
        }

        function sendFile() {
            const file = document.getElementById('file-in').files[0];
            if(file){
                const reader = new FileReader();
                reader.onload = (e) => socket.emit('send_msg', { type: 'image', content: e.target.result, room: currentRoom, userId: myUserId });
                reader.readAsDataURL(file);
            }
        }

        // ГОЛОСОВЫЕ
        let mediaRec; let chunks = [];
        async function recStart() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRec = new MediaRecorder(stream);
                mediaRec.start();
                chunks = [];
                document.getElementById('mic-btn').innerText = "🔴";
                mediaRec.ondataavailable = e => chunks.push(e.data);
                mediaRec.onstop = () => {
                    const blob = new Blob(chunks);
                    const reader = new FileReader();
                    reader.onload = (e) => socket.emit('send_msg', { type: 'audio', content: e.target.result, room: currentRoom, userId: myUserId });
                    reader.readAsDataURL(blob);
                    document.getElementById('mic-btn').innerText = "🎤";
                };
            } catch(e) { alert('Дай доступ к микрофону!'); }
        }
        function recStop() { if(mediaRec) mediaRec.stop(); }

        // КОМНАТЫ
        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }
        
        function createRoom() {
            const name = prompt("Название чата:");
            if(name && name.trim()) socket.emit('create_room', name.trim());
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

server.listen(process.env.PORT || 3000, () => { console.log('120 FPS BUILD READY'); });
