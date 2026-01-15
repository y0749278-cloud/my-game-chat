const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

// Загрузка истории из файла
let messageHistory = [];
try {
    const data = fs.readFileSync('messages.json');
    messageHistory = JSON.parse(data);
} catch (e) { messageHistory = []; }

function saveHistory() {
    fs.writeFileSync('messages.json', JSON.stringify(messageHistory.slice(-500))); // храним последние 500
}

io.on('connection', (socket) => {
    socket.on('join_room', (room) => {
        socket.join(room);
        const roomMsgs = messageHistory.filter(m => m.room === room);
        socket.emit('load_history', roomMsgs);
    });

    socket.on('send_msg', (data) => {
        const msgObject = {
            id: Date.now() + Math.random(), // ID для удаления
            type: data.type, room: data.room, userId: data.userId,
            userName: data.userName, content: data.content, time: data.time 
        };
        messageHistory.push(msgObject);
        saveHistory();
        io.to(data.room).emit('new_msg', msgObject);
    });

    socket.on('delete_msg', (data) => {
        messageHistory = messageHistory.filter(m => m.id !== data.id);
        saveHistory();
        io.to(data.room).emit('msg_deleted', data.id);
    });
});

app.get('/manifest.json', (req, res) => {
    res.json({
        "short_name": "G-Chat",
        "name": "G-CHAT ELITE",
        "icons": [{ "src": "https://i.ibb.co/m568f6K/G-LOGO.png", "type": "image/png", "sizes": "512x512" }],
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0b0e14",
        "theme_color": "#7c3aed"
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <link rel="manifest" href="/manifest.json">
    <title>G-CHAT</title>
    <style>
        :root { --bg: #0b0e14; --panel: #161b22; --accent: #7c3aed; --mine: #6d28d9; --text: #e6edf3; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; overflow: hidden; }
        
        #auth-screen { position: fixed; inset: 0; background: var(--bg); z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        #auth-screen.hidden { display: none; }
        .auth-card { background: var(--panel); padding: 30px; border-radius: 20px; text-align: center; width: 80%; }
        
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #30363d; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        #chat-area { flex: 1; display: flex; flex-direction: column; position: relative; }
        
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 80%; padding: 10px 15px; border-radius: 18px; position: relative; cursor: pointer; }
        .msg.me { align-self: flex-end; background: var(--mine); }
        .msg.them { align-self: flex-start; background: var(--panel); }
        
        /* Индикатор загрузки */
        #loader { display: none; position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); background: var(--accent); padding: 5px 15px; border-radius: 20px; font-size: 12px; z-index: 100; }

        #input-zone { padding: 10px; background: #0d1117; display: flex; align-items: center; gap: 10px; padding-bottom: env(safe-area-inset-bottom); }
        input { flex: 1; background: #000; border: 1px solid #30363d; color: #fff; padding: 12px; border-radius: 25px; }
        
        @media (max-width: 768px) { #sidebar { position: fixed; left: -100%; height: 100%; width: 80%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>
    <div id="loader">Отправка файла...</div>
    <div id="auth-screen">
        <div class="auth-card">
            <input type="text" id="auth-name" placeholder="Имя" style="width:90%; margin-bottom:10px;"><br>
            <button onclick="login()" style="width:95%; padding:10px; background:var(--accent); border:none; color:white; border-radius:10px;">ВОЙТИ</button>
        </div>
    </div>

    <div id="sidebar">
        <div style="padding:20px; border-bottom:1px solid #333;">
            <b>G-CHAT</b> <button onclick="togglePrivacy()" style="float:right">👁️</button>
        </div>
        <div id="rooms-list" style="flex:1; overflow:auto;"></div>
        <button onclick="createRoom()" style="margin:10px; padding:10px;">+ Создать чат</button>
    </div>

    <div id="chat-area">
        <div style="padding:15px; background:var(--panel); display:flex; gap:10px;">
            <button onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
            <b id="room-title">Выберите чат</b>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <label style="font-size:24px;">📎<input type="file" id="file-in" hidden onchange="sendFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение...">
            <button onclick="sendTxt()" style="background:var(--accent); border:none; color:white; width:40px; height:40px; border-radius:50%;">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let userData = JSON.parse(localStorage.getItem('gchat_user'));
        let currentRoom = localStorage.getItem('gchat_last_room');
        let privacyMode = localStorage.getItem('gchat_privacy') === 'true';

        function login() {
            const n = document.getElementById('auth-name').value;
            if(!n) return;
            userData = { id: Math.floor(Math.random()*900000), name: n };
            localStorage.setItem('gchat_user', JSON.stringify(userData));
            location.reload();
        }

        if(userData) {
            document.getElementById('auth-screen').classList.add('hidden');
            renderRooms();
            if(currentRoom) switchRoom(currentRoom);
        }

        function createRoom() {
            const name = prompt("Имя собеседника:");
            const key = prompt("Ключ комнаты:");
            if(name && key) {
                let rooms = JSON.parse(localStorage.getItem('gchat_rooms') || '[]');
                rooms.push({ name, key });
                localStorage.setItem('gchat_rooms', JSON.stringify(rooms));
                renderRooms();
            }
        }

        function renderRooms() {
            const list = document.getElementById('rooms-list');
            list.innerHTML = '';
            const rooms = JSON.parse(localStorage.getItem('gchat_rooms') || '[]');
            rooms.forEach(r => {
                const d = document.createElement('div');
                d.style.padding = '15px';
                d.style.borderBottom = '1px solid #222';
                d.innerText = r.name;
                d.onclick = () => switchRoom(r.key);
                list.appendChild(d);
            });
        }

        function switchRoom(key) {
            currentRoom = key;
            localStorage.setItem('gchat_last_room', key);
            document.getElementById('room-title').innerText = "Комната: " + key;
            socket.emit('join_room', key);
        }

        socket.on('load_history', (msgs) => {
            const b = document.getElementById('messages'); b.innerHTML = '';
            msgs.forEach(m => renderMsg(m));
            b.scrollTop = b.scrollHeight;
        });

        socket.on('new_msg', (msg) => { if(msg.room === currentRoom) renderMsg(msg); });
        
        socket.on('msg_deleted', (id) => {
            const el = document.getElementById('msg-' + id);
            if(el) el.remove();
        });

        function renderMsg(msg) {
            const d = document.createElement('div');
            d.id = 'msg-' + msg.id;
            d.className = 'msg ' + (msg.userId == userData.id ? 'me' : 'them');
            let content = msg.type === 'text' ? msg.content : \`<img src="\${msg.content}" width="100%" style="border-radius:10px;">\`;
            d.innerHTML = \`<small style="opacity:0.5">\${msg.userName}</small><div>\${content}</div><small style="font-size:8px; opacity:0.3">\${msg.time}</small>\`;
            
            // Удаление по клику
            d.onclick = () => {
                if(msg.userId == userData.id && confirm("Удалить сообщение для всех?")) {
                    socket.emit('delete_msg', { id: msg.id, room: currentRoom });
                }
            };
            
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
                document.getElementById('loader').style.display = 'block'; // Показать загрузку
                const r = new FileReader();
                r.onload = (e) => {
                    socket.emit('send_msg', { type: 'image', content: e.target.result, room: currentRoom, userId: userData.id, userName: userData.name, time: new Date().toLocaleTimeString() });
                    document.getElementById('loader').style.display = 'none'; // Скрыть загрузку
                };
                r.readAsDataURL(f);
            }
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => { console.log('Server running'); });
