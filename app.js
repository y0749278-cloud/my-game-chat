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
    <title>G-Chat Pro</title>
    <style>
        :root { --bg: #0b0e14; --panel: #1a1d23; --accent: #00ff88; --text: #e0e0e0; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100vh; }
        #sidebar { width: 280px; background: var(--panel); border-right: 2px solid #2a2d33; display: flex; flex-direction: column; }
        .side-header { padding: 20px; text-align: center; border-bottom: 1px solid #2a2d33; }
        .id-label { font-size: 11px; color: var(--accent); letter-spacing: 1px; }
        .input-box { padding: 15px; }
        .input-box input { width: 100%; padding: 12px; background: #000; border: 1px solid var(--accent); color: var(--accent); border-radius: 5px; outline: none; box-sizing: border-box; }
        #chat-list { flex: 1; overflow-y: auto; padding: 10px; }
        .chat-item { padding: 12px; background: #222; margin-bottom: 5px; border-radius: 4px; cursor: pointer; border-left: 3px solid transparent; }
        .chat-item.active { border-left-color: var(--accent); background: #2a2a2a; }
        #main { flex: 1; display: flex; flex-direction: column; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .m { max-width: 80%; padding: 10px 15px; border-radius: 8px; font-size: 14px; }
        .m.sent { align-self: flex-end; background: var(--accent); color: #000; }
        .m.received { align-self: flex-start; background: #333; }
        #footer { padding: 15px; background: var(--panel); display: flex; gap: 10px; }
        #msg-in { flex: 1; padding: 12px; background: #000; border: 1px solid #444; color: #fff; border-radius: 5px; outline: none; }
        #send-btn { background: var(--accent); border: none; padding: 0 20px; border-radius: 5px; cursor: pointer; font-weight: bold; }
    </style>
</head>
<body>
    <div id="sidebar">
        <div class="side-header">
            <div style="font-weight:bold; font-size: 18px;">G-CHAT PRIVATE</div>
            <div class="id-label" id="my-id">Загрузка...</div>
        </div>
        <div class="input-box">
            <input id="add-id" placeholder="Напиши user12345" oninput="validateInput(this)">
        </div>
        <div id="chat-list"></div>
    </div>
    <div id="main">
        <div id="messages"></div>
        <form id="footer">
            <input id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <button type="submit">OK</button>
        </form>
    </div>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let myNum = localStorage.getItem('chat_num') || Math.floor(Math.random()*90000+10000);
        localStorage.setItem('chat_num', myNum);
        const myId = "user" + myNum;
        document.getElementById('my-id').innerText = "ТВОЙ ID: " + myId;
        let history = JSON.parse(localStorage.getItem('chat_history') || '{}');
        let currentRoom = null;
        if (Notification.permission !== "granted") Notification.requestPermission();
        function validateInput(el) {
            el.value = el.value.toLowerCase().replace(/[^user0-9]/g, '');
            if (el.value.length >= 9 && el.value.startsWith('user')) {
                startChat(el.value);
                el.value = '';
            }
        }
        function startChat(target) {
            if (target === myId) return;
            const room = [myId, target].sort().join("_");
            if (!history[room]) history[room] = { name: target, msgs: [] };
            save(); renderList(); join(room);
        }
        function join(room) {
            currentRoom = room;
            socket.emit('join', { room });
            renderMessages(); renderList();
        }
        function renderList() {
            const list = document.getElementById('chat-list');
            list.innerHTML = '';
            Object.keys(history).forEach(r => {
                const div = document.createElement('div');
                div.className = 'chat-item ' + (currentRoom === r ? 'active' : '');
                div.innerText = history[r].name;
                div.onclick = () => join(r);
                list.appendChild(div);
            });
        }
        function renderMessages() {
            const box = document.getElementById('messages');
            box.innerHTML = '';
            if (!currentRoom) return;
            history[currentRoom].msgs.forEach(m => {
                const d = document.createElement('div');
                d.className = 'm ' + (m.s === myId ? 'sent' : 'received');
                d.innerText = m.t;
                box.appendChild(d);
            });
            box.scrollTop = box.scrollHeight;
        }
        function save() { localStorage.setItem('chat_history', JSON.stringify(history)); }
        document.getElementById('footer').onsubmit = (e) => {
            e.preventDefault();
            const input = document.getElementById('msg-in');
            if (input.value && currentRoom) {
                socket.emit('chat message', { room: currentRoom, s: myId, t: input.value });
                input.value = '';
            }
        };
        socket.on('chat message', (data) => {
            if (!history[data.room]) {
                const other = data.room.replace(myId, "").replace("_", "");
                history[data.room] = { name: other, msgs: [] };
            }
            history[data.room].msgs.push(data);
            save();
            if (data.room === currentRoom) renderMessages();
            else if (data.s !== myId) new Notification("Сообщение от " + data.s, { body: data.t });
        });
        renderList();
    </script>
</body>
</html>
    `);
});

io.on('connection', (socket) => {
    socket.on('join', (data) => socket.join(data.room));
    socket.on('chat message', (data) => io.to(data.room).emit('chat message', data));
});
server.listen(process.env.PORT || 3000);



