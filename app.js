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
    <title>Private Game Chat</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background-color: #e5ddd5; margin: 0; display: flex; height: 100vh; }
        #sidebar { width: 260px; background: #075e54; color: white; display: flex; flex-direction: column; padding: 15px; box-sizing: border-box; }
        .sidebar-header { font-size: 18px; font-weight: bold; margin-bottom: 20px; text-align: center; }
        .create-chat { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .create-chat input { padding: 8px; border-radius: 5px; border: none; outline: none; }
        .create-chat button { background: #25d366; color: white; border: none; padding: 8px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        #chat-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
        .chat-item { background: #128c7e; padding: 10px; border-radius: 8px; cursor: pointer; transition: 0.3s; font-size: 14px; }
        .chat-item:hover { background: #0b6b5d; }
        .chat-item.active { background: #25d366; }
        #main { flex: 1; display: flex; flex-direction: column; }
        #chat-header { background: #075e54; color: white; padding: 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 8px; background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); }
        .message { max-width: 75%; padding: 8px 12px; border-radius: 10px; font-size: 14px; position: relative; }
        .sent { align-self: flex-end; background: #dcf8c6; }
        .received { align-self: flex-start; background: white; }
        #form { display: flex; padding: 15px; background: #f0f0f0; }
        #input { flex: 1; padding: 12px; border: none; border-radius: 25px; outline: none; }
        #send-btn { background: #075e54; color: white; border: none; padding: 0 20px; border-radius: 25px; margin-left: 10px; cursor: pointer; }
    </style>
</head>
<body>
    <div id="sidebar">
        <div class="sidebar-header">МОИ ЧАТЫ</div>
        <div class="create-chat">
            <input id="target-id" placeholder="Введи ID друга..." />
            <button onclick="startPrivateChat()">СОЗДАТЬ ЧАТ</button>
        </div>
        <div id="chat-list">
            <div class="chat-item active" onclick="joinRoom('Global')">Глобальный чат</div>
        </div>
    </div>
    <div id="main">
        <div id="chat-header">
            <span id="room-name">Чат: Global</span>
            <span id="display-id" style="font-size: 12px; opacity: 0.8;"></span>
        </div>
        <div id="messages"></div>
        <form id="form">
            <input id="input" autocomplete="off" placeholder="Напишите сообщение..." />
            <button id="send-btn">-></button>
        </form>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let myId = localStorage.getItem('chat_user_id') || "ID-" + Math.floor(Math.random() * 90000 + 10000);
        localStorage.setItem('chat_user_id', myId);
        
        document.getElementById('display-id').innerText = "Твой ID: " + myId;
        let currentRoom = 'Global';

        function startPrivateChat() {
            const target = document.getElementById('target-id').value.trim();
            if (!target || target === myId) return alert("Введи корректный ID друга!");
            
            // Генерируем секретное имя комнаты на основе двух ID
            const roomName = [myId, target].sort().join("_");
            
            if (!document.getElementById('chat-' + roomName)) {
                const item = document.createElement('div');
                item.id = 'chat-' + roomName;
                item.className = 'chat-item';
                item.innerText = 'Чат с ' + target;
                item.onclick = () => joinRoom(roomName, item);
                document.getElementById('chat-list').appendChild(item);
            }
            joinRoom(roomName);
            document.getElementById('target-id').value = '';
        }

        function joinRoom(name, element) {
            currentRoom = name;
            document.getElementById('room-name').innerText = "Чат: " + name;
            document.getElementById('messages').innerHTML = "";
            socket.emit('join', { room: name, user: myId });
            
            document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
            if (element) element.classList.add('active');
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
            // Если пришло сообщение в личку, которой нет в списке — создаем её
            if (data.room.includes(myId) && data.room !== 'Global' && !document.getElementById('chat-' + data.room)) {
                const otherUser = data.room.replace(myId, "").replace("_", "");
                const item = document.createElement('div');
                item.id = 'chat-' + data.room;
                item.className = 'chat-item';
                item.innerText = 'Чат с ' + otherUser;
                item.onclick = () => joinRoom(data.room, item);
                document.getElementById('chat-list').appendChild(item);
            }

            if (data.room !== currentRoom) return;
            
            const item = document.createElement('div');
            item.className = 'message ' + (data.user === myId ? 'sent' : 'received');
            item.innerHTML = '<span style="font-size:10px; display:block; font-weight:bold;">' + data.user + '</span>' + data.text;
            document.getElementById('messages').appendChild(item);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
        });

        socket.emit('join', { room: 'Global', user: myId });
    </script>
</body>
</html>
    `);
});

io.on('connection', (socket) => {
    socket.on('join', (data) => socket.join(data.room));
    socket.on('chat message', (data) => io.to(data.room).emit('chat message', data));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log('Private Chat Online'); });


