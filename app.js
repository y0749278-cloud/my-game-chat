const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mega Chat Pro</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background-color: #e5ddd5; margin: 0; display: flex; height: 100vh; }
        #sidebar { width: 70px; background: #075e54; display: flex; flex-direction: column; align-items: center; padding-top: 20px; gap: 15px; }
        .room-btn { width: 45px; height: 45px; border-radius: 12px; border: none; background: #128c7e; color: white; cursor: pointer; font-weight: bold; font-size: 18px; transition: 0.3s; }
        .room-btn.active { background: #25d366; transform: scale(1.1); box-shadow: 0 0 10px rgba(0,0,0,0.3); }
        #main { flex: 1; display: flex; flex-direction: column; }
        #chat-header { background: #075e54; color: white; padding: 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 8px; background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); }
        .message { max-width: 75%; padding: 8px 12px; border-radius: 10px; font-size: 14px; position: relative; box-shadow: 0 1px 1px rgba(0,0,0,0.1); }
        .sent { align-self: flex-end; background: #dcf8c6; border-bottom-right-radius: 2px; }
        .received { align-self: flex-start; background: white; border-bottom-left-radius: 2px; }
        .user-id { font-size: 10px; color: #075e54; font-weight: bold; display: block; margin-bottom: 3px; }
        #form { display: flex; padding: 15px; background: #f0f0f0; border-top: 1px solid #ddd; }
        #input { flex: 1; padding: 12px 18px; border: none; border-radius: 25px; outline: none; font-size: 15px; }
        #send-btn { background: #075e54; color: white; border: none; padding: 0 25px; border-radius: 25px; margin-left: 10px; cursor: pointer; font-weight: bold; }
    </style>
</head>
<body>
    <div id="sidebar">
        <button class="room-btn active" onclick="joinRoom('Общий', this)">1</button>
        <button class="room-btn" onclick="joinRoom('Гейминг', this)">2</button>
        <button class="room-btn" onclick="joinRoom('Друзья', this)">3</button>
        <button class="room-btn" onclick="joinRoom('Секрет', this)">4</button>
        <button class="room-btn" onclick="joinRoom('Флуд', this)">5</button>
    </div>
    <div id="main">
        <div id="chat-header">
            <span id="room-name">Чат: Общий</span>
            <span id="display-id" style="font-size: 12px; opacity: 0.8;"></span>
        </div>
        <div id="messages"></div>
        <form id="form">
            <input id="input" autocomplete="off" placeholder="Напишите сообщение..." />
            <button id="send-btn">ОТПРАВИТЬ</button>
        </form>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        
        // ЛОГИКА СОХРАНЕНИЯ ID
        let myId = localStorage.getItem('chat_user_id');
        if (!myId) {
            myId = "USER-" + Math.floor(Math.random() * 90000 + 10000);
            localStorage.setItem('chat_user_id', myId);
        }
        
        document.getElementById('display-id').innerText = "Твой ID: " + myId;
        let currentRoom = 'Общий';

        // Запрос уведомлений
        if (Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        function joinRoom(name, btn) {
            currentRoom = name;
            document.getElementById('room-name').innerText = "Чат: " + name;
            document.getElementById('messages').innerHTML = ""; // Очистка при смене комнаты
            socket.emit('join', { room: name, user: myId });
            
            document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }

        document.getElementById('form').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('input');
            if (input.value) {
                socket.emit('chat message', { room: currentRoom, user: myId, text: input.value });
                input.value = '';
            }
        });

        socket.on('chat message', (data) => {
            if (data.room !== currentRoom) {
                // Если пришло сообщение в другую комнату, покажем пуш
                if (document.hidden) {
                    new Notification("Сообщение в " + data.room, { body: data.user + ": " + data.text });
                }
                return;
            }
            
            const item = document.createElement('div');
            item.className = 'message ' + (data.user === myId ? 'sent' : 'received');
            item.innerHTML = '<span class="user-id">' + data.user + '</span>' + data.text;
            document.getElementById('messages').appendChild(item);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;

            // Пуш если вкладка свернута
            if (data.user !== myId && document.hidden) {
                new Notification("Новое сообщение в " + data.room, { body: data.user + ": " + data.text });
            }
        });

        // Заходим в первую комнату при старте
        joinRoom('Общий', document.querySelector('.room-btn'));
    </script>
</body>
</html>
    `);
});

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        socket.join(data.room);
    });
    socket.on('chat message', (data) => {
        io.to(data.room).emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log('Server is online'); });
