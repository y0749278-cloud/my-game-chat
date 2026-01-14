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
    <title>G-Chat Purple</title>
    <style>
        :root { --bg: #090516; --panel: #120c2b; --accent: #a855f7; --text: #f3e8ff; --msg-me: #7e22ce; --msg-them: #2e1065; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100vh; overflow: hidden; }
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #3b0764; display: flex; flex-direction: column; }
        .side-header { padding: 20px; background: linear-gradient(to bottom, #1e1b4b, var(--panel)); text-align: center; }
        .my-id { font-size: 12px; color: #d8b4fe; background: rgba(168, 85, 247, 0.2); padding: 6px; border-radius: 8px; margin-top: 10px; display: inline-block; }
        .add-box { padding: 15px; }
        .add-box input { width: 100%; background: #000; border: 1px solid var(--accent); padding: 12px; border-radius: 12px; color: #fff; outline: none; box-sizing: border-box; }
        #chat-list { flex: 1; overflow-y: auto; padding: 10px; }
        .chat-item { padding: 12px; border-radius: 12px; cursor: pointer; margin-bottom: 8px; background: rgba(255,255,255,0.03); border: 1px solid transparent; }
        .chat-item.active { background: rgba(168, 85, 247, 0.2); border-color: var(--accent); }
        #main { flex: 1; display: flex; flex-direction: column; background: radial-gradient(circle at center, #1e1b4b 0%, #090516 100%); }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 75%; padding: 10px 15px; border-radius: 15px; font-size: 14px; }
        .msg.me { align-self: flex-end; background: var(--msg-me); }
        .msg.them { align-self: flex-start; background: var(--msg-them); }
        #footer { padding: 15px; background: var(--panel); display: flex; gap: 10px; border-top: 1px solid #3b0764; }
        #footer input { flex: 1; background: #000; border: 1px solid #3b0764; padding: 12px; border-radius: 10px; color: white; outline: none; }
        #footer button { background: var(--accent); border: none; padding: 0 20px; border-radius: 10px; color: white; font-weight: bold; cursor: pointer; }
    </style>
</head>
<body>
    <div id="sidebar">
        <div class="side-header">
            <div style="font-weight:bold;">G-CHAT PURPLE</div>
            <div class="my-id" id="my-id-val">MY ID: ...</div>
        </div>
        <div class="add-box">
            <input id="invite" placeholder="user12345 + Enter" onkeypress="if(event.key==='Enter') startNewChat(this.value)">
        </div>
        <div id="chat-list"></div>
    </div>
    <div id="main">
        <div id="messages"></div>
        <form id="footer">
            <input id="m-text" placeholder="Сообщение..." autocomplete="off">
            <button type="submit">OK</button>
        </form>
    </div>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let myNum = localStorage.getItem('p_num') || Math.floor(Math.random()*90000+10000);
        localStorage.setItem('p_num', myNum);
        const myId = "user" + myNum;
        document.getElementById('my-id-val').innerText = "MY ID: " + myId;
        let history = JSON.parse(localStorage.getItem('p_hist') || '{}');
        let currentRoom = null;
        if (Notification.permission !== "granted") Notification.requestPermission();
        function startNewChat(val) {
            val = val.trim().toLowerCase();
            if (val.startsWith('user') && val !== myId) {
                let name = prompt("Как назовем друга?");
                if (!name) name = val;
                const room = [myId, val].sort().join("_");
                if (!history[room]) history[room] = { name: name, msgs: [] };
                save(); renderList(); openRoom(room);
                document.getElementById('invite').value = '';
            }
        }
        function openRoom(room) {
            currentRoom = room;
            socket.emit('join', { room });
            renderMessages(); renderList();
        }
        function renderList() {
            const list = document.getElementById('chat-list'); list.innerHTML = '';
            Object.keys(history).forEach(r => {
                const item = document.createElement('div');
                item.className = 'chat-item ' + (currentRoom === r ? 'active' : '');
                item.innerHTML = '<b>' + history[r].name + '</b>';
                item.onclick = () => openRoom(r);
                list.appendChild(item);
            });
        }
        function renderMessages() {
            const box = document.getElementById('messages'); box.innerHTML = '';
            if (!currentRoom) return;
            history[currentRoom].msgs.forEach(m => {
                const d = document.createElement('div');
                d.className = 'msg ' + (m.s === myId ? 'me' : 'them');
                d.innerText = m.t;
                box.appendChild(d);
            });
            box.scrollTop = box.scrollHeight;
        }
        function save() { localStorage.setItem('p_hist', JSON.stringify(history)); }
        document.getElementById('footer').onsubmit = (e) => {
            e.preventDefault();
            const inp = document.getElementById('m-text');
            if (inp.value && currentRoom) {
                socket.emit('chat message', { room: currentRoom, s: myId, t: inp.value });
                inp.value = '';
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
            else if (data.s !== myId) new Notification(history[data.room].name, { body: data.t });
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
