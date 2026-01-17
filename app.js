const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 1e8, 
    cors: { origin: "*" } 
});

// ТВОЯ ПРОВЕРЕННАЯ ССЫЛКА
const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("DATABASE CONNECTED"))
    .catch(err => console.log("DB ERROR:", err));

// Схемы данных для MongoDB
const userSchema = new mongoose.Schema({ name: String, pass: String, id: Number });
const chatSchema = new mongoose.Schema({ uid: Number, chats: Array });
const msgSchema = new mongoose.Schema({
    room: String, userId: Number, userName: String,
    content: String, type: String, id: Number, date: Date
});

const User = mongoose.model('User', userSchema);
const ChatList = mongoose.model('ChatList', chatSchema);
const Msg = mongoose.model('Msg', msgSchema);

io.on('connection', (socket) => {
    
    // АВТОРИЗАЦИЯ
    socket.on('server_auth', async (data) => {
        const { name, pass, type } = data;
        if (type === 'reg') {
            const exist = await User.findOne({ name });
            if (exist) return socket.emit('auth_error', 'Имя занято!');
            const newId = Math.floor(10000 + Math.random() * 89999);
            await new User({ name, pass, id: newId }).save();
            await new ChatList({ uid: newId, chats: [] }).save();
            socket.emit('auth_success', { name, id: newId, pass });
        } else {
            const acc = await User.findOne({ name, pass });
            if (acc) {
                socket.emit('auth_success', { name: acc.name, id: acc.id, pass: acc.pass });
                const list = await ChatList.findOne({ uid: acc.id });
                socket.emit('sync_chats', list ? list.chats : []);
            } else socket.emit('auth_error', 'Неверный пароль!');
        }
    });

    socket.on('register_me', (id) => { socket.join("user-" + id); });

    socket.on('join_room', async (room) => { 
        socket.join(room); 
        const history = await Msg.find({ room }).sort({date: 1}).limit(100);
        socket.emit('load_history', history);
    });

    socket.on('send_msg', async (data) => {
        const msgData = { id: Date.now() + Math.random(), date: new Date(), ...data };
        await new Msg(msgData).save();
        io.to(data.room).emit('new_msg', msgData);

        // Уведомление для личных сообщений
        if(data.isPrivate) {
            const uids = [data.userId, data.toId];
            for (let uid of uids) {
                let list = await ChatList.findOne({ uid });
                if (list && !list.chats.find(c => c.room === data.room)) {
                    list.chats.push({ name: data.userName, room: data.room, type: 'private', tid: data.userId });
                    await ChatList.updateOne({ uid }, { chats: list.chats });
                }
            }
        }
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
        }
    });
});

// ГЛАВНЫЙ ИНТЕРФЕЙС (HTML/CSS/JS)
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>G-Chat Pro</title>
    <style>
        :root { --bg: #0b0e14; --panel: #151921; --accent: #7c3aed; --text: #ffffff; }
        * { box-sizing: border-box; outline: none; margin: 0; padding: 0; }
        body { display: flex; background: var(--bg); color: var(--text); height: 100vh; font-family: 'Segoe UI', sans-serif; }
        
        #auth-screen { position: fixed; inset: 0; background: #07080c; z-index: 1000; display: flex; align-items: center; justify-content: center; }
        .box { background: var(--panel); padding: 30px; border-radius: 20px; width: 320px; border: 1px solid #333; text-align: center; }
        input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 12px; margin-bottom: 10px; }
        
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #222; display: flex; flex-direction: column; }
        .sb-head { padding: 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 8px; background: #1e293b; border-radius: 12px; cursor: pointer; transition: 0.2s; }
        .room-btn:hover { background: #2d3748; }
        .room-btn.active { border: 2px solid var(--accent); background: #2d1b4d; }

        #chat-main { flex: 1; display: flex; flex-direction: column; background: #07080c; }
        .top-bar { height: 60px; padding: 0 20px; background: var(--panel); display: flex; align-items: center; border-bottom: 1px solid #333; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 75%; padding: 12px; border-radius: 15px; position: relative; font-size: 15px; }
        .msg.me { align-self: flex-end; background: var(--accent); color: white; }
        .msg.them { align-self: flex-start; background: #1e293b; }
        .del-btn { font-size: 10px; color: #ff4d4d; cursor: pointer; margin-left: 10px; }

        #input-zone { padding: 15px; background: var(--panel); display: flex; gap: 10px; }
        #msg-in { flex: 1; background: #000; border: 1px solid #444; color: white; padding: 12px; border-radius: 12px; }
        .btn { background: var(--accent); border: none; color: white; padding: 10px 15px; border-radius: 10px; cursor: pointer; font-weight: bold; }
        
        .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:2000; align-items:center; justify-content:center; }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="box">
            <h2 style="color:var(--accent); margin-bottom:20px;">G-CHAT PRO</h2>
            <input type="text" id="a-name" placeholder="Логин">
            <input type="password" id="a-pass" placeholder="Пароль">
            <button onclick="auth('login')" class="btn" style="width:100%; margin-bottom:10px;">ВХОД</button>
            <button onclick="auth('reg')" class="btn" style="width:100%; background:#222;">РЕГИСТРАЦИЯ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sb-head">
            <div><b id="u-name">...</b><br><small id="u-id" style="color:#aaa"></small></div>
            <button onclick="location.reload()" style="background:none; border:none; cursor:pointer">🚪</button>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:15px; display:flex; gap:5px;">
            <button onclick="openM('Группа', 1)" class="btn" style="flex:1">+ ГРУППА</button>
            <button onclick="openM('Личка (ID)', 2)" class="btn" style="flex:1; background:#222">+ ЛС</button>
        </div>
    </div>

    <div id="chat-main">
        <div class="top-bar"><b id="c-title">Выберите диалог</b></div>
        <div id="messages"></div>
        <div id="input-zone">
            <input type="text" id="msg-in" placeholder="Написать сообщение...">
            <button onclick="sendMsg()" class="btn">ОТПРАВИТЬ</button>
        </div>
    </div>

    <div id="gen-modal" class="modal">
        <div class="box">
            <h3 id="m-title"></h3><br>
            <input type="text" id="m-i1" placeholder="Имя/ID">
            <button id="m-ok" class="btn" style="width:100%">СОЗДАТЬ</button>
            <button onclick="closeM()" class="btn" style="width:100%; background:#222; margin-top:10px">ОТМЕНА</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let user = null, chats = [], curRoom = null;

        function auth(type) {
            const name = document.getElementById('a-name').value;
            const pass = document.getElementById('a-pass').value;
            if(!name || !pass) return alert("Заполни поля");
            socket.emit('server_auth', { name, pass, type });
        }

        socket.on('auth_success', acc => {
            user = acc;
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('u-name').innerText = user.name;
            document.getElementById('u-id').innerText = "ID: " + user.id;
            socket.emit('register_me', user.id);
        });

        socket.on('sync_chats', c => { chats = c; updSidebar(); });
        socket.on('auth_error', e => alert(e));

        function openM(t, mode) {
            document.getElementById('gen-modal').style.display='flex';
            document.getElementById('m-title').innerText = t;
            document.getElementById('m-ok').onclick = () => {
                const val = document.getElementById('m-i1').value;
                if(!val) return;
                if(mode === 1) {
                    const r = 'grp_' + Date.now();
                    const c = {name: val, room: r, type: 'group'};
                    chats.push(c);
                    socket.emit('save_chat_to_server', {uid: user.id, chat: c});
                    switchRoom(r);
                } else {
                    const tid = parseInt(val);
                    const r = [user.id, tid].sort().join('_');
                    const c = {name: 'Чат с ' + tid, room: r, type: 'private', tid: tid};
                    chats.push(c);
                    socket.emit('save_chat_to_server', {uid: user.id, chat: c});
                    switchRoom(r);
                }
                closeM();
            };
        }

        function switchRoom(r) {
            curRoom = r;
            const c = chats.find(x => x.room === r);
            document.getElementById('c-title').innerText = c ? c.name : "Чат";
            document.getElementById('messages').innerHTML = '';
            socket.emit('join_room', r);
            updSidebar();
        }

        function sendMsg() {
            const i = document.getElementById('msg-in');
            const c = chats.find(x => x.room === curRoom);
            if(i.value && curRoom) {
                socket.emit('send_msg', { 
                    room: curRoom, 
                    userId: user.id, 
                    userName: user.name, 
                    content: i.value, 
                    isPrivate: c.type === 'private',
                    toId: c.tid
                });
                i.value = '';
            }
        }

        socket.on('load_history', h => h.forEach(renderMsg));
        socket.on('new_msg', m => { if(m.room === curRoom) renderMsg(m); });

        function renderMsg(m) {
            const b = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId === user.id ? 'me' : 'them');
            d.id = 'msg-' + m.id;
            const del = m.userId === user.id ? \`<span class="del-btn" onclick="delMsg('\${m.id}')">Удалить</span>\` : '';
            d.innerHTML = \`<div style="font-size:11px; opacity:0.7">\${m.userName} \${del}</div>\${m.content}\`;
            b.appendChild(d);
            b.scrollTop = b.scrollHeight;
        }

        function delMsg(id) { socket.emit('delete_msg', {id, room: curRoom}); }
        socket.on('msg_deleted', id => { document.getElementById('msg-' + id)?.remove(); });

        function updSidebar() {
            const l = document.getElementById('rooms-list');
            l.innerHTML = '';
            chats.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (curRoom === c.room ? ' active' : '');
                d.innerHTML = \`<b>\${c.name}</b>\`;
                d.onclick = () => switchRoom(c.room);
                l.appendChild(d);
            });
        }
        function closeM() { document.getElementById('gen-modal').style.display='none'; }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000, () => {
    console.log('SERVER RUNNING ON PORT 3000');
});
