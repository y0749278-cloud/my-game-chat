const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log("G-CHAT ETERNAL CONNECTED"));

const User = mongoose.model('User', new mongoose.Schema({ name: String, pass: String, id: Number }));
const ChatList = mongoose.model('ChatList', new mongoose.Schema({ uid: Number, chats: Array }));
const Msg = mongoose.model('Msg', new mongoose.Schema({ room: String, userId: Number, userName: String, content: String, type: String, id: Number, date: Date }));

io.on('connection', (socket) => {
    socket.on('server_auth', async (data) => {
        const { name, pass } = data;
        let acc = await User.findOne({ name });
        if (acc) {
            if (acc.pass === pass) {
                socket.emit('auth_success', { name: acc.name, id: acc.id, pass: acc.pass });
                const list = await ChatList.findOne({ uid: acc.id });
                socket.emit('sync_chats', list ? list.chats : []);
            } else { socket.emit('auth_error', 'Неверный пароль!'); }
        } else {
            const newId = Math.floor(10000 + Math.random() * 89999);
            await new User({ name, pass, id: newId }).save();
            await new ChatList({ uid: newId, chats: [] }).save();
            socket.emit('auth_success', { name, id: newId, pass });
            socket.emit('sync_chats', []);
        }
    });

    socket.on('register_me', (id) => socket.join("user-" + id));
    
    socket.on('join_room', async (room) => {
        socket.join(room);
        const history = await Msg.find({ room }).sort({date: 1}).limit(50);
        socket.emit('load_history', history);
    });

    socket.on('send_msg', async (data) => {
        const msgData = { id: Date.now() + Math.random(), date: new Date(), ...data };
        await new Msg(msgData).save();
        io.to(data.room).emit('new_msg', msgData);
    });

    socket.on('delete_msg', async (data) => {
        await Msg.deleteOne({ id: data.id });
        io.to(data.room).emit('msg_deleted', data.id);
    });

    socket.on('save_chat_to_server', async (data) => {
        let list = await ChatList.findOne({ uid: data.uid });
        if(list && !list.chats.find(c => c.room === data.chat.room)) {
            list.chats.push(data.chat);
            await ChatList.updateOne({ uid: data.uid }, { chats: list.chats });
            socket.emit('sync_chats', list.chats);
        }
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>G-CHAT ETERNAL</title>
    <style>
        :root { --bg: #0b0e14; --panel: #151921; --accent: #7c3aed; --text: #ffffff; --msg-them: #22272e; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; background: var(--bg); color: var(--text); font-family: 'Segoe UI', Roboto, sans-serif; display: flex; height: 100vh; overflow: hidden; }
        
        /* AUTH */
        #auth-screen { position: fixed; inset: 0; background: #000; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .auth-card { background: var(--panel); padding: 40px 30px; border-radius: 24px; width: 100%; max-width: 360px; text-align: center; border: 1px solid #333; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .auth-card h2 { color: var(--accent); margin-bottom: 25px; letter-spacing: 1px; }
        input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 15px; border-radius: 14px; margin-bottom: 12px; font-size: 16px; transition: 0.3s; }
        input:focus { border-color: var(--accent); }
        .btn { background: var(--accent); color: #fff; border: none; padding: 15px; border-radius: 14px; width: 100%; cursor: pointer; font-weight: bold; font-size: 16px; transition: 0.2s; }
        .btn:active { transform: scale(0.97); }

        /* MAIN UI */
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #222; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .user-info { padding: 20px; border-bottom: 1px solid #333; background: rgba(124, 58, 237, 0.05); }
        .room-item { padding: 16px 20px; cursor: pointer; border-bottom: 1px solid #222; transition: 0.2s; display: flex; align-items: center; gap: 10px; }
        .room-item:hover { background: #1c2128; }
        .room-item.active { background: #1c2128; border-left: 4px solid var(--accent); }

        #chat-area { flex: 1; display: flex; flex-direction: column; background: #07080c; }
        .chat-header { height: 65px; background: var(--panel); border-bottom: 1px solid #333; display: flex; align-items: center; padding: 0 20px; gap: 15px; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        
        /* MESSAGES */
        .msg { max-width: 80%; padding: 12px 16px; border-radius: 18px; position: relative; font-size: 15px; line-height: 1.4; animation: fadeIn 0.2s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .me { align-self: flex-end; background: var(--accent); color: white; border-bottom-right-radius: 4px; }
        .them { align-self: flex-start; background: var(--msg-them); border-bottom-left-radius: 4px; }
        
        .msg-info { font-size: 11px; opacity: 0.6; margin-bottom: 4px; display: flex; justify-content: space-between; }
        .del-btn { color: #ff4d4d; cursor: pointer; margin-left: 8px; font-weight: bold; }

        #input-bar { padding: 15px; background: var(--panel); display: flex; gap: 12px; align-items: center; border-top: 1px solid #333; }
        .icon-btn { background: none; border: none; color: #888; font-size: 24px; cursor: pointer; padding: 5px; transition: 0.2s; }
        .icon-btn:hover { color: var(--accent); }

        @media (max-width: 768px) {
            #sidebar { position: absolute; left: -100%; height: 100%; width: 85%; box-shadow: 10px 0 30px rgba(0,0,0,0.5); }
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>
    <div id="auth-screen">
        <div class="auth-card">
            <h2>G-CHAT ETERNAL</h2>
            <input id="auth-name" placeholder="Логин">
            <input id="auth-pass" type="password" placeholder="Пароль">
            <button class="btn" onclick="handleAuth()">ВОЙТИ / СОЗДАТЬ</button>
            <p style="font-size: 12px; opacity: 0.5; margin-top: 15px;">Если вы первый раз, аккаунт создастся сам</p>
        </div>
    </div>

    <div id="sidebar">
        <div class="user-info">
            <div style="display:flex; justify-content:space-between; align-items:center">
                <div><b id="me-name" style="font-size:18px"></b><br><small id="me-id" style="opacity:0.6"></small></div>
                <button onclick="exitAcc()" style="background:none; border:1px solid #444; color:#aaa; border-radius:8px; padding:5px 10px; font-size:11px; cursor:pointer">ВЫХОД</button>
            </div>
        </div>
        <div id="rooms-list" style="flex:1; overflow-y:auto"></div>
        <div style="padding:15px">
            <button class="btn" style="background: #2d333b; font-size: 14px;" onclick="addFriend()">+ ДОБАВИТЬ ДРУГА</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="chat-header">
            <button class="icon-btn" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
            <b id="chat-title" style="font-size:18px">Выберите чат</b>
        </div>
        <div id="messages"></div>
        <div id="input-bar">
            <button class="icon-btn" onclick="f_in.click()">📷</button>
            <input type="file" id="f_in" hidden accept="image/*" onchange="sendImg(this)">
            <input id="msg-in" placeholder="Написать сообщение..." style="margin:0" onkeypress="if(event.key=='Enter')send()">
            <button class="icon-btn" style="color:var(--accent)" onclick="send()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let me = null, activeRoom = null;

        // AUTH LOGIC
        function handleAuth() {
            const name = document.getElementById('auth-name').value;
            const pass = document.getElementById('auth-pass').value;
            if(name && pass) socket.emit('server_auth', {name, pass});
        }

        window.onload = () => {
            const saved = localStorage.getItem('gchat_v8');
            if(saved) socket.emit('server_auth', JSON.parse(saved));
        }

        socket.on('auth_success', data => {
            me = data;
            localStorage.setItem('gchat_v8', JSON.stringify({name:data.name, pass:data.pass}));
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('me-name').innerText = me.name;
            document.getElementById('me-id').innerText = "Мой ID: " + me.id;
            socket.emit('register_me', me.id);
        });

        socket.on('auth_error', msg => alert(msg));
        function exitAcc() { localStorage.removeItem('gchat_v8'); location.reload(); }

        // CHATS LOGIC
        socket.on('sync_chats', list => {
            const cont = document.getElementById('rooms-list');
            cont.innerHTML = '';
            list.forEach(c => {
                const div = document.createElement('div');
                div.className = 'room-item' + (activeRoom === c.room ? ' active' : '');
                div.innerHTML = \`<div style="width:10px; height:10px; border-radius:50%; background:var(--accent)"></div> <b>\${c.name}</b>\`;
                div.onclick = () => {
                    activeRoom = c.room;
                    document.getElementById('chat-title').innerText = c.name;
                    document.getElementById('messages').innerHTML = '';
                    socket.emit('join_room', c.room);
                    document.getElementById('sidebar').classList.remove('open');
                    document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');
                };
                cont.appendChild(div);
            });
        });

        function addFriend() {
            const id = prompt("Введите ID друга:");
            const name = prompt("Имя для чата (например, УМАР):");
            if(id && name) {
                const room = [me.id, parseInt(id)].sort().join('_');
                socket.emit('save_chat_to_server', { uid: me.id, chat: { name, room, type: 'private' } });
            }
        }

        // MESSAGES LOGIC
        function send() {
            const input = document.getElementById('msg-in');
            if(input.value && activeRoom) {
                socket.emit('send_msg', { room: activeRoom, userId: me.id, userName: me.name, content: input.value, type: 'text' });
                input.value = '';
            }
        }

        function sendImg(input) {
            const reader = new FileReader();
            reader.onload = () => socket.emit('send_msg', { room: activeRoom, userId: me.id, userName: me.name, content: reader.result, type: 'img' });
            reader.readAsDataURL(input.files[0]);
        }

        socket.on('load_history', h => h.forEach(render));
        socket.on('new_msg', m => { if(m.room === activeRoom) render(m); });
        socket.on('msg_deleted', id => { const el = document.getElementById('m-'+id); if(el) el.remove(); });

        function render(m) {
            const cont = document.getElementById('messages');
            const div = document.createElement('div');
            div.id = 'm-' + m.id;
            div.className = 'msg ' + (m.userId === me.id ? 'me' : 'them');
            
            let body = m.content;
            if(m.type === 'img') body = '<img src="'+m.content+'" style="max-width:100%; border-radius:12px; margin-top:5px; display:block">';
            
            const del = (m.userId === me.id) ? \`<span class="del-btn" onclick="socket.emit('delete_msg',{id:\${m.id},room:activeRoom})">✖</span>\` : '';
            
            div.innerHTML = \`<div class="msg-info"><b>\${m.userName}</b>\${del}</div>\${body}\`;
            cont.appendChild(div);
            cont.scrollTop = cont.scrollHeight;
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
