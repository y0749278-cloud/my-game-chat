const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

let messageHistory = []; 

io.on('connection', (socket) => {
    socket.on('join_room', (room) => {
        socket.join(room);
        const roomMsgs = messageHistory.filter(m => m.room === room);
        socket.emit('load_history', roomMsgs);
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
        if(messageHistory.length > 200) messageHistory.shift();
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
    <title>G-CHAT FINAL</title>
    <style>
        :root { --bg: #0f0b1e; --panel: #1a162e; --accent: #7c3aed; --mine: #6d28d9; --text: #e9d5ff; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; position: fixed; width: 100%; }

        /* БОКОВАЯ ПАНЕЛЬ */
        #sidebar { width: 280px; background: var(--panel); border-right: 1px solid #2e1065; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; flex-shrink: 0; }
        .header { padding: 20px; background: #2e1065; text-align: center; font-weight: bold; }
        #rooms-list { flex: 1; padding: 10px; overflow-y: auto; }
        .room-btn { padding: 15px; margin-bottom: 8px; background: rgba(255,255,255,0.05); border-radius: 12px; cursor: pointer; border: 1px solid transparent; }
        .room-btn.active { background: var(--accent); border-color: #a78bfa; }

        /* ОСНОВНОЙ ЧАТ */
        #chat-area { flex: 1; display: flex; flex-direction: column; position: relative; background: #0f0b1e; height: 100%; }
        
        /* ШАПКА С БУРГЕРОМ */
        .top-bar { padding: 10px; background: var(--panel); display: flex; align-items: center; gap: 15px; border-bottom: 1px solid #2e1065; }
        .burger-btn { background: var(--accent); border: none; color: white; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-size: 20px; }

        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        
        .msg { max-width: 85%; padding: 12px; border-radius: 18px; font-size: 15px; line-height: 1.4; position: relative; }
        .msg.them { align-self: flex-start; background: #2e1065; color: #fff; border-bottom-left-radius: 4px; }
        .msg.me { align-self: flex-end; background: var(--mine); color: #fff; border-bottom-right-radius: 4px; }
        
        .sender-id { font-size: 10px; color: #a78bfa; margin-bottom: 4px; opacity: 0.8; }
        .msg img { max-width: 100%; border-radius: 10px; margin: 5px 0; display: block; }
        .msg audio { width: 100%; margin-top: 5px; }
        .time { font-size: 9px; opacity: 0.5; text-align: right; }

        /* ФИКС СТРОКИ ВВОДА ДЛЯ МОБИЛОК */
        #input-zone { 
            padding: 10px 15px; 
            background: var(--panel); 
            display: flex; 
            align-items: center; 
            gap: 10px; 
            border-top: 1px solid #2e1065;
            padding-bottom: calc(10px + env(safe-area-inset-bottom)); /* Фикс для айфонов */
        }
        
        input[type="text"] { 
            flex: 1; 
            background: #000; 
            border: 1px solid #4c1d95; 
            color: white; 
            padding: 12px 15px; 
            border-radius: 25px; 
            outline: none; 
            font-size: 16px; /* Предотвращает зум на iOS */
        }

        .icon-btn { font-size: 24px; background: none; border: none; cursor: pointer; color: #a78bfa; }
        .send-btn { background: var(--accent); border: none; width: 45px; height: 45px; border-radius: 50%; color: white; font-size: 20px; flex-shrink: 0; }

        @media (max-width: 768px) {
            #sidebar { position: fixed; left: -100%; height: 100%; }
            #sidebar.open { left: 0; }
            #chat-area { width: 100vw; }
        }
    </style>
</head>
<body>

    <div id="sidebar">
        <div class="header">
            G-CHAT PRO
            <div id="disp-id" style="font-size:12px; color:#a78bfa; margin-top:5px;">ID: ...</div>
        </div>
        <div id="rooms-list">
            <div class="room-btn active" data-room="General" onclick="switchRoom('General')"># General</div>
        </div>
        <button onclick="createRoom()" style="margin:10px; padding:15px; background:var(--accent); border:none; color:white; border-radius:10px; cursor:pointer;">+ Создать чат</button>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button class="burger-btn" onclick="toggleMenu()">☰</button>
            <b id="current-room-title"># General</b>
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
        
        // --- ID СИСТЕМА ---
        let myUserId = localStorage.getItem('gchat_uid');
        if (!myUserId) {
            myUserId = Math.floor(10000 + Math.random() * 90000);
            localStorage.setItem('gchat_uid', myUserId);
        }
        document.getElementById('disp-id').innerText = "Твой ID: " + myUserId;

        // --- ПОДКЛЮЧЕНИЕ ---
        socket.on('connect', () => {
            socket.emit('join_room', currentRoom);
        });

        socket.on('load_history', (msgs) => {
            const box = document.getElementById('messages');
            box.innerHTML = '';
            msgs.forEach(m => renderMsg(m));
            box.scrollTop = box.scrollHeight;
        });

        socket.on('new_msg', (msg) => {
            if(msg.room === currentRoom) {
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
            document.getElementById('messages').appendChild(div);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
        }

        // --- ФУНКЦИИ ---
        function sendTxt() {
            const inp = document.getElementById('msg-in');
            if(inp.value.trim()){
                socket.emit('send_msg', { type: 'text', content: inp.value, room: currentRoom, userId: myUserId });
                inp.value = '';
                inp.focus();
            }
        }

        function sendFile() {
            const file = document.getElementById('file-in').files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                socket.emit('send_msg', { type: 'image', content: e.target.result, room: currentRoom, userId: myUserId });
            };
            reader.readAsDataURL(file);
        }

        // --- ГОЛОСОВЫЕ ---
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
                    reader.onload = (e) => {
                        socket.emit('send_msg', { type: 'audio', content: e.target.result, room: currentRoom, userId: myUserId });
                    };
                    reader.readAsDataURL(blob);
                    document.getElementById('mic-btn').innerText = "🎤";
                };
            } catch(e) { alert('Включи микрофон в настройках браузера!'); }
        }
        function recStop() { if(mediaRec) mediaRec.stop(); }

        // --- КОМНАТЫ (ИСПРАВЛЕНО) ---
        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }

        function createRoom() {
            const name = prompt("Введите название чата:");
            if(name && name.trim()) {
                const roomName = name.trim();
                // Добавляем кнопку в список
                const list = document.getElementById('rooms-list');
                const newBtn = document.createElement('div');
                newBtn.className = 'room-btn';
                newBtn.innerText = '# ' + roomName;
                newBtn.onclick = () => switchRoom(roomName);
                list.appendChild(newBtn);
                
                switchRoom(roomName);
            }
        }

        function switchRoom(name) {
            currentRoom = name;
            document.getElementById('current-room-title').innerText = '# ' + name;
            
            // Подсветка активной кнопки
            document.querySelectorAll('.room-btn').forEach(b => {
                b.classList.remove('active');
                if(b.innerText === '# ' + name) b.classList.add('active');
            });

            socket.emit('join_room', name);
            if(window.innerWidth <= 768) toggleMenu(); // Закрыть меню на мобиле
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => { console.log('Final Build Ready'); });
