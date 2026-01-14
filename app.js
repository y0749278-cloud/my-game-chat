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
    <title>My Game Chat</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #e5ddd5; margin: 0; display: flex; flex-direction: column; height: 100vh; }
        #chat-header { background: #075e54; color: white; padding: 15px; text-align: center; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); }
        .message { max-width: 70%; padding: 8px 12px; border-radius: 10px; position: relative; font-size: 14px; line-height: 1.4; word-wrap: break-word; }
        .sent { align-self: flex-end; background-color: #dcf8c6; border-bottom-right-radius: 2px; box-shadow: 0 1px 1px rgba(0,0,0,0.1); }
        .received { align-self: flex-start; background-color: white; border-bottom-left-radius: 2px; box-shadow: 0 1px 1px rgba(0,0,0,0.1); }
        .user-name { font-weight: bold; font-size: 12px; color: #075e54; display: block; margin-bottom: 2px; }
        #form { display: flex; padding: 10px; background: #f0f0f0; border-top: 1px solid #ddd; }
        #input { flex: 1; padding: 12px; border: none; border-radius: 25px; outline: none; font-size: 16px; }
        #send-btn { background: #075e54; color: white; border: none; padding: 0 20px; margin-left: 10px; border-radius: 25px; cursor: pointer; font-weight: bold; }
    </style>
</head>
<body>
    <div id="chat-header">GAME CHAT (Online)</div>
    <div id="messages"></div>
    <form id="form">
        <input id="input" autocomplete="off" placeholder="Введите сообщение..." />
        <button id="send-btn">Отправить</button>
    </form>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        const form = document.getElementById('form');
        const input = document.getElementById('input');
        const messages = document.getElementById('messages');
        const userName = "Игрок_" + Math.floor(Math.random() * 1000);

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (input.value) {
                const data = { user: userName, text: input.value };
                socket.emit('chat message', data);
                input.value = '';
            }
        });

        socket.on('chat message', (data) => {
            const item = document.createElement('div');
            item.classList.add('message');
            item.classList.add(data.user === userName ? 'sent' : 'received');
            item.innerHTML = '<span class="user-name">' + data.user + '</span>' + data.text;
            messages.appendChild(item);
            messages.scrollTop = messages.scrollHeight;
        });
    </script>
</body>
</html>
    `);
});

io.on('connection', (socket) => {
    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('СЕРВЕР ЗАПУЩЕН НА ПОРТУ ' + PORT);
});
