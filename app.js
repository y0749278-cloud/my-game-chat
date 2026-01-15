const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // Разрешаем файлы до 100 МБ
});

// --- ПАМЯТЬ СЕРВЕРА (История сообщений) ---
// Здесь мы храним сообщения, чтобы они не пропадали при смене устройства
let messageHistory = []; 

io.on('connection', (socket) => {
    // 1. При подключении отправляем ID
    socket.emit('me', socket.id);
    
    // 2. ВХОД В КОМНАТУ + ЗАГРУЗКА ИСТОРИИ
    socket.on('join_room', (room) => {
        socket.leaveAll();
        socket.join(room);
        
        // Фильтруем сообщения только для этой комнаты
        const roomHistory = messageHistory.filter(msg => msg.room === room);
        // Отправляем историю этому конкретному пользователю
        socket.emit('load_history', roomHistory);
        
        socket.emit('room_joined', room);
    });

    // 3. Сохранение и отправка ТЕКСТА
    socket.on('send_text', (data) => {
        const msgData = {
            type: 'text',
            room: data.room,
            user: data.user,
            text: data.text,
            id: socket.id,
            time: new Date().toLocaleTimeString().slice(0,5)
        };
        messageHistory.push(msgData); // Запоминаем в истории
        if(messageHistory.length > 100) messageHistory.shift(); // Удаляем старые, если больше 100
        
        io.to(data.room).emit('receive_message', msgData);
    });

    // 4. Сохранение и отправка ФОТО
    socket.on('send_image', (data) => {
        const msgData = {
            type: 'image',
            room: data.room,
            user: data.user,
            image: data.image,
            id: socket.id,
            time: new Date().toLocaleTimeString().slice(0,5)
        };
        messageHistory.push(msgData);
        if(messageHistory.length > 100) messageHistory.shift();

        io.to(data.room).emit('receive_message', msgData);
    });

    // 5. Сохранение и отправка ГОЛОСОВЫХ
    socket.on('send_audio', (data) => {
        const msgData = {
            type: 'audio',
            room: data.room,
            user: data.user,
            audio: data.audio,
            id: socket.id,
            time: new Date().toLocaleTimeString().slice(0,5)
        };
        messageHistory.push(msgData);
        if(messageHistory.length > 100) messageHistory.shift();

        io.to(data.room).emit('receive_message', msgData);
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>G-Chat History</title>
    <style>
        :root { --bg: #0f0b1e; --panel: #1a162e; --accent: #7c3aed; --mine: #6d28d9; --text: #e9d5ff; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        
        /* БОКОВАЯ ПАНЕЛЬ */
        #sidebar { width: 260px; background: var(--panel); border-right: 1px solid #2e1065; display: flex; flex-direction: column; }
        .header { padding: 20px; background: #2e1065; font-weight: bold; font-size: 18px; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
        .my-id { font-size: 11px; color: #a78bfa; margin-top: 5px; text-align: center; }
        #rooms-list { flex: 1; padding: 10px; overflow-y: auto; }
        .room-btn { padding: 12px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; }
        .room-btn:hover { background: rgba(124, 58, 237, 0.3); }
        .room-btn.active { background: var(--accent); }
        
        /* ОСНОВНОЙ ЧАТ */
        #chat-area { flex: 1; display: flex; flex-direction: column; background: radial-gradient(circle at top, #1e1b4b, #0f0b1e); position: relative; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        
        /* СООБЩЕНИЯ */
        .msg { max-width: 75%; padding: 10px 14px; border-radius: 16px; position: relative; font-size: 15px; word-wrap: break-word; }
        .msg.them { align-self: flex-start; background: #2e1065; border-bottom-left-radius: 4px; }
        .msg.me { align-self: flex-end; background: var(--mine); border-bottom-right-radius: 4px; }
        .msg img { max-width: 100%; border-radius: 10px; margin-top: 5px; }
        .msg audio { max-width: 200px; margin-top: 5px; }
        .meta { font-size: 10px; opacity: 0.6; display: flex; justify-content: flex-end; gap: 5px; margin-top: 4px; }
        .sender-name { font-size: 10px; color: #a78bfa; margin-bottom: 2px; font-weight: bold; }

        /* ПАНЕЛЬ ВВОДА */
        #input-zone { padding: 15px; background: var(--panel); display: flex; align-items: center; gap: 10px; border-top: 1px solid #2e1065; }
        .icon-btn { background: none; border: none; font-size: 24px; cursor: pointer; padding: 5px; color: #a78bfa; transition: 0.2s; }
        .icon-btn:active { transform: scale(0.9); }
        input[type="text"] { flex: 1; background: #0a0814; border: 1px solid #4c1d95; color: white; padding: 12px; border-radius: 20px; outline: none; }
        .send-btn { background: var(--accent); border: none; width: 45px; height: 45px; border-radius: 50%; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; }
        
        #file-input { display: none; }

        /* МОБИЛЬНАЯ АДАПТАЦИЯ */
        @media (max-width: 600px) {
            #sidebar { display: none; position: absolute; z-index: 100; height: 100%; width: 80%; }
            #sidebar.active { display: flex; }
            .menu-toggle { display: block; position: fixed; top: 15px; left: 15px; z-index: 101; background: var(--accent); color: white; border: none; padding: 8px; border-radius: 5px; font-size: 20px; cursor: pointer; }
        }
        @media (min-width: 601px) { .menu-toggle { display: none; } }
    </style>
</head>
<body>

    <button class="menu-toggle" onclick="toggleSidebar()">☰</button>

    <div id="sidebar">
        <div class="header">
            G-CHAT <br>
            <div class="my-id" id="my-id">Подключение...</div>
        </div>
        <div id="rooms-list">
            <div class="room-btn active" onclick="switchRoom('General')"># General</div>
            <div class="room-btn" onclick="createRoom()">+ Создать чат</div>
        </div>
    </div>

    <div id="chat-area">
        <div id="messages"></div>
        
        <div id="input-zone">
            <label for="file-input" class="icon-btn">📎</label>
            <input type="file" id="file-input" accept="image/*" onchange="sendPhoto()">
            
            <input type="text" id="msg-input" placeholder="Сообщение..." autocomplete="off">
            
            <button class="icon-btn" id="mic-btn" onmousedown="startRecord()" onmouseup="stopRecord()" ontouchstart="startRecord()" ontouchend="stopRecord()">🎤</button>
            
            <button class="send-btn" onclick="sendText()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let myId = "";
        let currentRoom = "General";
        
        socket.on('connect', () => {
             // При подключении сразу просимся в комнату, чтобы получить историю
             socket.emit('join_room', currentRoom);
        });

        socket.on('me', (id) => {
            myId = id;
            document.getElementById('my-id').innerText = "ID: " + id.substr(0, 5);
            requestNotify();
        });

        // --- УВЕДОМЛЕНИЯ ---
        function requestNotify() {
            if (Notification.permission !== "granted") Notification.requestPermission();
        }
        function showNotify(user, text) {
            if (document.hidden && Notification.permission === "granted") {
                new Notification("G-Chat: " + user, { body: text });
            }
        }

        // --- ЛОГИКА ОТПРАВКИ ---
        function sendText() {
            const input = document.getElementById('msg-input');
            if (input.value.trim()) {
                socket.emit('send_text', { room: currentRoom, text: input.value, user: "Я" });
                input.value = '';
            }
        }

        function sendPhoto() {
            const file = document.getElementById('file-input').files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    socket.emit('send_image', { room: currentRoom, image: evt.target.result, user: "Я" });
                };
                reader.readAsDataURL(file);
            }
        }

        // --- ГОЛОСОВЫЕ ---
        let mediaRecorder;
        let audioChunks = [];

        async function startRecord() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.start();
                audioChunks = [];
                document.getElementById('mic-btn').style.color = "red";
                
                mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
                
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = (e) => {
                         socket.emit('send_audio', { room: currentRoom, audio: e.target.result, user: "Я" });
                    }
                    reader.readAsDataURL(audioBlob);
                    document.getElementById('mic-btn').style.color = "#a78bfa";
                };
            } catch(e) { alert("Нужен доступ к микрофону!"); }
        }
        function stopRecord() { if(mediaRecorder) mediaRecorder.stop(); }

        // --- ПРИЕМ И ОТОБРАЖЕНИЕ ---
        // 1. Загрузка старых сообщений (История)
        socket.on('load_history', (history) => {
            document.getElementById('messages').innerHTML = ''; // Чистим чат перед загрузкой
            history.forEach(msg => renderMessage(msg));
        });

        // 2. Прием нового сообщения
        socket.on('receive_message', (data) => {
            renderMessage(data);
            if(data.id !== myId) showNotify("Новое сообщение", data.type === 'text' ? data.text : "Медиафайл");
        });

        function renderMessage(data) {
            const div = document.createElement('div');
            div.className = 'msg ' + (data.id === myId ? 'me' : 'them');
            
            let content = '';
            // Если это чужое сообщение, показываем ID/Имя
            if(data.id !== myId) content += \`<div class="sender-name">\${data.user} (\${data.id.substr(0,4)})</div>\`;

            if (data.type === 'text') content += \`<div>\${data.text}</div>\`;
            if (data.type === 'image') content += \`<img src="\${data.image}">\`;
            if (data.type === 'audio') content += \`<audio controls src="\${data.audio}"></audio>\`;

            div.innerHTML = content + \`<div class="meta">\${data.time} ✓</div>\`;
            document.getElementById('messages').appendChild(div);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
        }

        // --- УПРАВЛЕНИЕ КОМНАТАМИ ---
        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('active');
        }

        function createRoom() {
            const name = prompt("Название новой комнаты:");
            if (name) {
                switchRoom(name);
                const btn = document.createElement('div');
                btn.className = 'room-btn';
                btn.innerText = '# ' + name;
                btn.onclick = () => switchRoom(name);
                document.getElementById('rooms-list').appendChild(btn);
            }
        }

        function switchRoom(room) {
            currentRoom = room;
            // Визуальное выделение активной комнаты
            document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
            
            socket.emit('join_room', room); // Сервер сам пришлет историю после этого
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => { console.log('Server running'); });
