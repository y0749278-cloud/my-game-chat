const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

// --- ТВОЯ ВЕЧНАЯ БАЗА ДАННЫХ ---
const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("БАЗА ПОДКЛЮЧЕНА! ВСЁ СОХРАНЯЕТСЯ ВЕЧНО"))
    .catch(err => console.log("ОШИБКА БАЗЫ:", err));

// Схемы данных
const userSchema = new mongoose.Schema({ name: String, pass: String, id: Number });
const chatSchema = new mongoose.Schema({ uid: Number, chats: Array });
const msgSchema = new mongoose.Schema({
    room: String, userId: Number, userName: String,
    content: String, type: String, fileName: String, id: Number, date: Date
});

const User = mongoose.model('User', userSchema);
const ChatList = mongoose.model('ChatList', chatSchema);
const Msg = mongoose.model('Msg', msgSchema);

io.on('connection', (socket) => {
    
    // АВТОРИЗАЦИЯ И БЫСТРЫЙ ВХОД
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

        if(data.isPrivate) {
            const uids = [data.userId, data.toId];
            for (let uid of uids) {
                let list = await ChatList.findOne({ uid });
                if (list && !list.chats.find(c => c.room === data.room)) {
                    list.chats.push({ name: data.userName, room: data.room, type: 'private', tid: data.userId });
                    await ChatList.updateOne({ uid }, { chats: list.chats });
                }
            }
            io.to("user-" + data.toId).emit('private_request', { fromName: data.userName, fromId: data.userId, room: data.room });
        }
    });

    socket.on('delete_msg', async (data) => {
        await Msg.deleteOne({ id: data.id });
        io.to(data.room).emit('msg_deleted', data.id);
    });

    socket.on('add_user_to_group', async (data) => {
        const targetId = parseInt(data.targetId);
        let list = await ChatList.findOne({ uid: targetId });
        if(list && !list.chats.find(c => c.room === data.room)) {
            list.chats.push({ name: data.chatName, room: data.room, type: 'group' });
            await ChatList.updateOne({ uid: targetId }, { chats: list.chats });
            io.to("user-" + targetId).emit('sync_chats', list.chats);
            io.to("user-" + targetId).emit('force_alert', `Вас добавили в группу \${data.chatName}`);
        }
    });

    socket.on('save_chat_to_server', async (data) => {
        let list = await ChatList.findOne({ uid: data.uid });
        if(list && !list.chats.find(c => c.room === data.chat.room)) {
            list.chats.push(data.chat);
            await ChatList.updateOne({ uid: data.uid }, { chats: list.chats });
        }
    });
});

app.get('/', (req, res) => {
    res.send(\`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-Chat Eternal</title>
    <style>
        :root { --bg: #0b0e14; --panel: #151921; --accent: #7c3aed; --text: #ffffff; }
        * { box-sizing: border-box; outline: none; margin: 0; padding: 0; }
        body { display: flex; background: var(--bg); color: var(--text); height: 100vh; font-family: sans-serif; overflow: hidden; }
        
        #auth-screen { position: fixed; inset: 0; background: #07080c; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .glass-box { background: var(--panel); padding: 30px; border-radius: 28px; width: 100%; max-width: 320px; text-align: center; border: 1px solid #333; }
        input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 15px; border-radius: 15px; margin-bottom: 12px; }
        
        #sidebar { width: 260px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; }
        .sidebar-header { padding: 20px; border-bottom: 2px solid var(--accent); display: flex; justify-content: space-between; align-items: center; }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: #1e293b; border-radius: 18px; cursor: pointer; }
        .room-btn.active { border: 1px solid var(--accent); background: #2d1b4d; }

        #chat-area { flex: 1; display: flex; flex-direction: column; background: #07080c; }
        .top-bar { height: 60px; padding: 0 20px; background: var(--panel); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 80%; padding: 12px; border-radius: 18px; position: relative; }
        .msg.me { align-self: flex-end; background: var(--accent); }
        .msg.them { align-self: flex-start; background: #1e293b; }

        #input-zone { padding: 15px; background: var(--panel); display: flex; gap: 10px; align-items: center; }
        #msg-in { flex: 1; background: #000; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 25px; }
        .btn { background: var(--accent); border: none; color: #fff; padding: 10px 20px; border-radius: 15px; font-weight: bold; cursor: pointer; }
        
        #voice-panel { display: none; position: absolute; inset: 0; background: var(--panel); align-items: center; padding: 0 20px; z-index: 100; gap: 10px; }
        .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:2000; align-items:center; justify-content:center; }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="glass-box">
            <h2 style="margin-bottom:20px; color:var(--accent)">G-CHAT</h2>
            <div id="quick-box" style="display:none; margin-bottom:15px">
                <button onclick="quickLogin()" class="btn" style="width:100%">Войти как <b id="ql-name"></b></button>
            </div>
            <input type="text" id="a-name" placeholder="Логин">
            <input type="password" id="a-pass" placeholder="Пароль">
            <button onclick="auth('login')" class="btn" style="width:100%; margin-bottom:10px">ВОЙТИ</button>
            <button onclick="auth('reg')" class="btn" style="width:100%; background:#222">РЕГИСТРАЦИЯ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <div><b id="u-name">...</b><br><span id="u-id" style="font-size:10px"></span></div>
            <button onclick="openProfile()" style="background:none; border:none; font-size:20px; cursor:pointer">⚙️</button>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:10px; display:flex; gap:5px">
            <button onclick="openM('Группа', 1)" class="btn" style="flex:1; font-size:12px">+ ГРУППА</button>
            <button onclick="openM('Личка', 2)" class="btn" style="flex:1; background:#222; font-size:12px">+ ЛС</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <b id="c-title">Выберите чат</b>
            <button id="add-btn" onclick="openM('Добавить (ID)', 3)" class="btn" style="display:none; padding:5px 10px">👤+</button>
        </div>
        <div id="messages"></div>
        <div id="input-zone" style="position:relative">
            <div id="voice-panel">
                <span style="flex:1">🎤 Запись...</span>
                <button onclick="stopVoice(false)" class="btn" style="background:red">✖</button>
                <button onclick="stopVoice(true)" class="btn" style="background:green">✔</button>
            </div>
            <input type="text" id="msg-in" placeholder="Сообщение...">
            <button onclick="startVoice()" class="btn">🎤</button>
            <button onclick="sendMsg()" class="btn">➤</button>
        </div>
    </div>

    <div id="profile-modal" class="modal">
        <div class="glass-box">
            <h3>ПРОФИЛЬ</h3>
            <p id="p-data" style="margin:15px 0; text-align:left; font-size:14px"></p>
            <button onclick="logout()" class="btn" style="width:100%; background:red">ВЫЙТИ</button>
            <button onclick="closeModals()" class="btn" style="width:100%; background:#222; margin-top:10px">ЗАКРЫТЬ</button>
        </div>
    </div>

    <div id="gen-modal" class="modal">
        <div class="glass-box">
            <h3 id="m-title"></h3><br>
            <input type="text" id="m-i1" placeholder="Имя">
            <input type="text" id="m-i2" placeholder="ID" style="display:none">
            <button id="m-ok" class="btn" style="width:100%">ОК</button>
            <button onclick="closeModals()" class="btn" style="width:100%; background:#222; margin-top:10px">ОТМЕНА</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let user = null, chats = [], curRoom = null, recorder, chunks = [];

        const saved = JSON.parse(localStorage.getItem('g_creds'));
        if(saved) {
            document.getElementById('quick-box').style.display = 'block';
            document.getElementById('ql-name').innerText = saved.name;
        }

        function quickLogin() {
            document.getElementById('a-name').value = saved.name;
            document.getElementById('a-pass').value = saved.pass;
            auth('login');
        }

        function auth(type) {
            const name = document.getElementById('a-name').value;
            const pass = document.getElementById('a-pass').value;
            localStorage.setItem('g_creds', JSON.stringify({name, pass}));
            socket.emit('server_auth', { name, pass, type });
        }

        socket.on('auth_success', acc => {
            user = acc;
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('u-name').innerText = user.name;
            document.getElementById('u-id').innerText = "ID: " + user.id;
            socket.emit('register_me', user.id);
        });

        socket.on('sync_chats', c => { chats = c; upd(); });
        socket.on('auth_error', e => alert(e));
        socket.on('force_alert', m => alert(m));

        function openProfile() {
            document.getElementById('profile-modal').style.display='flex';
            document.getElementById('p-data').innerHTML = \`Логин: \${user.name}<br>Пароль: \${user.pass}<br>Ваш ID: <b>\${user.id}</b>\`;
        }

        function logout() { localStorage.removeItem('g_creds'); location.reload(); }

        function openM(t, mode) {
            document.getElementById('gen-modal').style.display='flex';
            document.getElementById('m-title').innerText = t;
            document.getElementById('m-i2').style.display = (mode === 2) ? 'block' : 'none';
            document.getElementById('m-ok').onclick = () => {
                const v1 = document.getElementById('m-i1').value;
                const v2 = document.getElementById('m-i2').value;
                if(mode === 1) {
                    const r = 'grp_' + Date.now();
                    const c = {name: v1, room: r, type: 'group', admin: user.id};
                    chats.push(c);
                    socket.emit('save_chat_to_server', {uid: user.id, chat: c});
                    switchR(r);
                } else if(mode === 2) {
                    const r = [user.id, parseInt(v2)].sort().join('_');
                    const c = {name: v1, room: r, type: 'private', tid: parseInt(v2)};
                    chats.push(c);
                    socket.emit('save_chat_to_server', {uid: user.id, chat: c});
                    switchR(r);
                } else if(mode === 3) {
                    socket.emit('add_user_to_group', {targetId: v1, room: curRoom, chatName: document.getElementById('c-title').innerText});
                }
                closeModals();
            };
        }

        function switchR(r) {
            curRoom = r;
            const c = chats.find(x => x.room === r);
            document.getElementById('c-title').innerText = c ? c.name : "Чат";
            document.getElementById('add-btn').style.display = (c && c.type==='group') ? 'block' : 'none';
            document.getElementById('messages').innerHTML = '';
            socket.emit('join_room', r);
            upd();
        }

        function sendMsg() {
            const i = document.getElementById('msg-in');
            const c = chats.find(x => x.room === curRoom);
            if(i.value && curRoom) {
                socket.emit('send_msg', { room: curRoom, userId: user.id, userName: user.name, content: i.value, type: 'text', isPrivate: c.type==='private', toId: c.tid });
                i.value = '';
            }
        }

        socket.on('load_history', h => { h.forEach(render); });
        socket.on('new_msg', m => { if(m.room === curRoom) render(m); });

        function render(m) {
            const b = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId === user.id ? 'me' : 'them');
            d.id = 'm-' + m.id;
            const del = m.userId === user.id ? \`<span onclick="delM('\${m.id}')" style="margin-left:10px; color:red; cursor:pointer">✕</span>\` : '';
            
            let content = m.content;
            if(m.type === 'voice') content = \`<audio src="\${m.content}" controls style="width:180px; filter:invert(1)"></audio>\`;
            
            d.innerHTML = \`<div style="font-size:10px; opacity:0.6">\${m.userName}\${del}</div>\${content}\`;
            b.appendChild(d);
            b.scrollTop = b.scrollHeight;
        }

        function delM(id) { socket.emit('delete_msg', {id, room: curRoom}); }
        socket.on('msg_deleted', id => { document.getElementById('m-'+id)?.remove(); });

        async function startVoice() {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recorder = new MediaRecorder(stream);
            chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.start();
            document.getElementById('voice-panel').style.display = 'flex';
        }

        function stopVoice(send) {
            recorder.stop();
            document.getElementById('voice-panel').style.display = 'none';
            recorder.onstop = () => {
                if(send) {
                    const blob = new Blob(chunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = () => {
                        const c = chats.find(x => x.room === curRoom);
                        socket.emit('send_msg', { room: curRoom, userId: user.id, userName: user.name, content: reader.result, type: 'voice', isPrivate: c.type==='private', toId: c.tid });
                    };
                    reader.readAsDataURL(blob);
                }
            };
        }

        function upd() {
            const l = document.getElementById('rooms-list');
            l.innerHTML = '';
            chats.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (curRoom === c.room ? ' active' : '');
                d.innerHTML = \`<b>\${c.name}</b>\`;
                d.onclick = () => switchR(c.room);
                l.appendChild(d);
            });
        }

        function closeModals() { 
            document.querySelectorAll('.modal').forEach(m => m.style.display='none'); 
        }
    </script>
</body>
</html>
    \`);
});

server.listen(process.env.PORT || 3000);
