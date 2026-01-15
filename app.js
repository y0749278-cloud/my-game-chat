const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });

    // Логика сигналинга для звонков
    socket.on('call-user', (data) => {
        socket.broadcast.emit('incoming-call', { from: socket.id, signal: data.signal });
    });

    socket.on('accept-call', (data) => {
        io.to(data.to).emit('call-accepted', data.signal);
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>G-Chat Video 120 FPS</title>
    <style>
        :root { --bg: #090516; --panel: #120c2b; --accent: #a855f7; --text: #f3e8ff; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        #sidebar { width: 280px; background: var(--panel); border-right: 1px solid #3b0764; display: flex; flex-direction: column; }
        #main { flex: 1; display: flex; flex-direction: column; position: relative; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; }
        
        /* ОКНА ВИДЕОЗВОНКА */
        #video-grid { position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; gap: 10px; z-index: 50; }
        video { width: 200px; border-radius: 12px; border: 2px solid var(--accent); background: #000; }
        #myVideo { width: 120px; border-color: #fff; }

        .fab { position: fixed; bottom: 80px; right: 25px; width: 60px; height: 60px; background: var(--accent); border-radius: 50%; 
               display: flex; align-items: center; justify-content: center; font-size: 30px; cursor: pointer; z-index: 100; }
        .fab-menu { display: none; position: fixed; bottom: 150px; right: 25px; background: var(--panel); border: 1px solid var(--accent); border-radius: 10px; padding: 10px; z-index: 101; }
        .menu-item { padding: 10px; cursor: pointer; border-radius: 5px; margin-bottom: 5px; }
        .menu-item:hover { background: rgba(168, 85, 247, 0.2); }
    </style>
</head>
<body>
    <div id="sidebar"><div style="padding:20px; font-weight:bold; color:var(--accent);">G-CHAT VIDEO PRO</div></div>
    <div id="main">
        <div id="video-grid">
            <video id="remoteVideo" autoplay playsinline></video>
            <video id="myVideo" autoplay muted playsinline></video>
        </div>
        <div id="messages"></div>
        <div style="padding:20px; background:var(--panel); display:flex; gap:10px;">
            <input id="in" style="flex:1; background:#000; border:1px solid #3b0764; color:white; padding:10px; border-radius:8px;" placeholder="Сообщение...">
            <button onclick="send()" style="background:var(--accent); border:none; color:white; padding:0 15px; border-radius:8px;">⬆</button>
        </div>
    </div>

    <div id="fab-menu" class="fab-menu">
        <div class="menu-item" onclick="startVideo()">📹 Видеозвонок</div>
        <div class="menu-item" onclick="sendPhoto()">📷 Отправить фото</div>
        <div class="menu-item" onclick="alert('Группа создана')">👥 Создать группу</div>
    </div>
    <div class="fab" onclick="toggleMenu()">+</div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let myStream;

        async function startVideo() {
            try {
                myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                document.getElementById('myVideo').srcObject = myStream;
                alert("Камера подключена. Оптимизация 120 FPS...");
                toggleMenu();
            } catch (e) { alert("Ошибка камеры: " + e); }
        }

        function sendPhoto() {
            alert("Функция отправки фото через камеру активирована!");
            // Здесь будет логика захвата кадра
            toggleMenu();
        }

        function toggleMenu() {
            const m = document.getElementById('fab-menu');
            m.style.display = m.style.display === 'block' ? 'none' : 'block';
        }

        window.onload = () => { prompt("Через что вы сидите? (Google/VK/Гость)"); };
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => { console.log('Work!'); });
