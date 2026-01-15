const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

// ХРАНИЛИЩЕ ИСТОРИИ (Последние 100 сообщений)
let messageHistory = []; 

io.on('connection', (socket) => {
    
    // Когда юзер заходит, он сразу просит историю
    socket.on('join_room', (room) => {
        socket.join(room);
        // Отправляем только сообщения этой комнаты
        const roomMsgs = messageHistory.filter(m => m.room === room);
        socket.emit('load_history', roomMsgs);
    });

    // ОБРАБОТКА СООБЩЕНИЙ (Текст, Фото, Голос)
    socket.on('send_msg', (data) => {
        // data.userId приходит от клиента (числовой)
        const msgObject = {
            type: data.type, // 'text', 'image', 'audio'
            room: data.room,
            userId: data.userId, // Тот самый вечный цифровой ID
            content: data.content,
            time: new Date().toLocaleTimeString().slice(0,5)
        };

        // Сохраняем в историю
        messageHistory.push(msgObject);
        if(messageHistory.length > 150) messageHistory.shift(); // Чистим старое

        // Отправляем всем в комнате
        io.to(data.room).emit('new_msg', msgObject);
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>G-Chat FIXED</title>
    <style>
        :root { --bg: #0f0b1e; --panel: #1a162e; --accent: #7c3aed; --mine: #6d28d9; --text: #e9d5ff; }
        * { box-sizing: border-box; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }

        /* БОКОВОЕ МЕНЮ (АДАПТИВНОЕ) */
        #sidebar { width: 260px; background: var(--panel); border-right: 1px solid #2e1065; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .header { padding: 20px; background: #2e1065; text-align: center; font-weight: bold; border-bottom: 1px solid #4c1d95; }
        .my-id-display { font-size: 12px; color: #a78bfa; margin-top: 5px; }
        
        #rooms-list { flex: 1; padding: 10px; overflow-y: auto; }
        .room-btn { padding: 12px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 8px; cursor: pointer; }
        .room-btn.active { background: var(--accent); color: white; }

        /* ОСНОВНОЙ ЧАТ */
        #chat-area { flex: 1; display: flex; flex-direction: column; position: relative; background: radial-gradient(circle at top, #1e1b4b, #0f0b1e); width: 100%; }
        
        /* КНОПКА МЕНЮ (ТОЛЬКО НА МОБИЛКАХ) */
        .burger-btn { display: none; position: absolute; top: 10px; left: 10px; z-index: 50; background: var(--accent); border: none; color: white; padding: 8px 12px; border-radius: 5px; font-size: 20px; cursor: pointer; }

        /* СООБЩЕНИЯ */
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; padding-top: 50px; }
        .msg { max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 14px; position: relative; word-wrap: break-word; }
        .msg.them { align-self: flex-start; background: #2e1065; border-bottom-left-radius: 2px; }
        .msg.me { align-self: flex-end; background: var(--mine); border-bottom-right-radius: 2px; }
        
        .sender-id { font-size: 9px; color: #a78bfa; margin-bottom: 3px; font-weight: bold; }
        .msg img { max-width: 100%; border-radius: 8px; margin-top: 5px; }
        .msg audio { max-width: 200px; margin-top: 5px; }
        .time { font-size: 9px; opacity: 0.6; text-align: right; margin-top: 4px; }

        /* НИЖНЯЯ ПАНЕЛЬ */
        #input-zone { padding: 10px; background: var(--panel); display: flex; align-items: center; gap: 8px; border-top: 1px solid #2e1065; }
        input[type="text"] { flex: 1; background: #0a0814; border: 1px solid #4c1d95; color: white; padding: 10px; border-radius: 20px; outline: none; }
        .icon-btn { font-size: 22px; background: none; border: none; cursor: pointer; padding: 5px; }
        .send-btn { background: var(--accent); border: none; width: 40px; height: 40px; border-radius: 50%; color: white; font-size: 18px; cursor: pointer; }

        /* МОБИЛЬНАЯ ВЕРСИЯ (САМОЕ ВАЖНОЕ) */
        @media (max-width: 768px) {
            #sidebar { position: fixed; left: -100%; height: 100%; width: 240px; box-shadow: 2px 0 10px black; }
            #sidebar.open { left: 0; }
            .burger-btn { display: block; } /* Показываем кнопку меню */
        }
    </style>
</head>
<body>

    <button class="burger-btn" onclick="toggleMenu()">☰</button>

    <div id="sidebar">
        <div class="header">
            G-CHAT
            <div class="my-id-display" id="disp-id">ID: ...</div>
        </div>
        <div id="rooms-list">
            <div class="room-btn active" onclick="switchRoom('General')"># General</div>
            <div class="room-btn" onclick="createRoom()">+ Создать чат</div>
        </div>
    </div>

    <div id="chat-area">
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
        
        // --- 1. ВЕЧНЫЙ ЦИФРОВОЙ ID ---
        // Проверяем, есть ли уже ID в телефоне
        let myUserId = localStorage.getItem('gchat_uid');
        
        if (!myUserId) {
            // Если нет, генерируем случайное число от 10000 до 99999
            myUserId = Math.floor(10000 + Math.random() * 90000);
            localStorage.setItem('gchat_uid', myUserId); // Сохраняем навсегда
        }
        
        document.getElementById('disp-id').innerText = "Твой ID: " + myUserId;

        // --- 2. ПОДКЛЮЧЕНИЕ ---
        socket.on('connect', () => {
            console.log("Connected");
            socket.emit('join_room', currentRoom);
        });

        // Загрузка истории
        socket.on('load_history', (msgs) => {
            document.getElementById('messages').innerHTML = ''; // Чистим
            msgs.forEach(m => renderMsg(m));
        });

        // Новое сообщение
        socket.on('new_msg', (msg) => {
            renderMsg(msg);
        });

        // --- 3. ОТРИСОВКА ---
        function renderMsg(msg) {
            const div = document.createElement('div');
            // Сравниваем ID из сообщения с твоим сохраненным ID
            const isMe = (msg.userId == myUserId);
            
            div.className = 'msg ' + (isMe ? 'me' : 'them');
            
            let content = '';
            // Показываем ID только у чужих
            if(!isMe) content += \`<div class="sender-id">ID: \${msg.userId}</div>\`;
            
            if(msg.type === 'text') content += \`<div>\${msg.content}</div>\`;
            if(msg.type === 'image') content += \`<img src="\${msg.content}">\`;
            if(msg.type === 'audio') content += \`<audio controls src="\${msg.content}"></audio>\`;
            
            div.innerHTML = content + \`<div class="time">\${msg.time}</div>\`;
            
            const box = document.getElementById('messages');
            box.appendChild(div);
            box.scrollTop = box.scrollHeight;
        }

        // --- 4. ОТПРАВКА ---
        function sendTxt() {
            const inp = document.getElementById('msg-in');
            if(inp.value.trim()){
                socket.emit('send_msg', { type: 'text', content: inp.value, room: currentRoom, userId: myUserId });
                inp.value = '';
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

        // --- 5. ГОЛОСОВЫЕ ---
        let mediaRec; let chunks = [];
        async function recStart() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRec = new MediaRecorder(stream);
                mediaRec.start();
                chunks = [];
                document.getElementById('mic-btn').style.transform = "scale(1.3)";
                document.getElementById('mic-btn').innerText = "🔴";
                mediaRec.ondataavailable = e => chunks.push(e.data);
                mediaRec.onstop = () => {
                    const blob = new Blob(chunks);
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        socket.emit('send_msg', { type: 'audio', content: e.target.result, room: currentRoom, userId: myUserId });
                    };
                    reader.readAsDataURL(blob);
                    document.getElementById('mic-btn').style.transform = "scale(1)";
                    document.getElementById('mic-btn').innerText = "🎤";
                };
            } catch(e) { alert('Дай доступ к микрофону!'); }
        }
        function recStop() { if(mediaRec) mediaRec.stop(); }

        // --- 6. МЕНЮ И КОМНАТЫ ---
        function toggleMenu() {
            document.getElementById('sidebar').classList.toggle('open');
        }
        function createRoom() {
            const name = prompt("Имя комнаты:");
            if(name) switchRoom(name);
        }
        function switchRoom(name) {
            currentRoom = name;
            document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('active'));
            // Простое выделение, можно доработать
            socket.emit('join_room', name);
            toggleMenu(); // Закрыть меню на мобиле
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => { console.log('Fixed Server OK'); });
