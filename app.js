const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log("G-CHAT ELITE ONLINE"));

const User = mongoose.model('User', new mongoose.Schema({ name: String, pass: String, id: Number }));
const ChatList = mongoose.model('ChatList', new mongoose.Schema({ uid: Number, chats: Array }));
const Msg = mongoose.model('Msg', new mongoose.Schema({ room: String, userId: Number, userName: String, content: String, type: String, id: Number, date: Date }));

io.on('connection', (socket) => {
    // Авторизация и загрузка ВСЕХ чатов из базы
    socket.on('server_auth', async (data) => {
        const { name, pass } = data;
        let acc = await User.findOne({ name });
        if (acc && acc.pass === pass) {
            socket.emit('auth_success', acc);
            const list = await ChatList.findOne({ uid: acc.id });
            socket.emit('sync_chats', list ? list.chats : []);
        } else if (!acc) {
            const newId = Math.floor(10000 + Math.random() * 89999);
            const newUser = await new User({ name, pass, id: newId }).save();
            await new ChatList({ uid: newId, chats: [] }).save();
            socket.emit('auth_success', newUser);
            socket.emit('sync_chats', []);
        } else {
            socket.emit('auth_error', 'Ошибка входа');
        }
    });

    socket.on('register_me', (id) => socket.join("user-" + id));

    socket.on('join_room', async (room) => {
        socket.join(room);
        const history = await Msg.find({ room }).sort({date: 1}).limit(100);
        socket.emit('load_history', history);
    });

    socket.on('send_msg', async (data) => {
        const msgData = { id: Date.now() + Math.random(), date: new Date(), ...data };
        await new Msg(msgData).save();
        io.to(data.room).emit('new_msg', msgData);
        // Пуш уведомление для других
        socket.to(data.room).emit('push_notify', { title: data.userName, body: data.type === 'text' ? data.content : 'Прислал фото' });
    });

    socket.on('save_chat_to_server', async (data) => {
        let list = await ChatList.findOne({ uid: data.uid });
        if(list) {
            const exists = list.chats.find(c => c.room === data.chat.room);
            if(!exists) {
                list.chats.push(data.chat);
                await ChatList.updateOne({ uid: data.uid }, { chats: list.chats });
                socket.emit('sync_chats', list.chats);
            }
        }
    });

    // Админское приглашение
    socket.on('invite_to_group', async (data) => {
        const { friendId, chatObj } = data;
        let list = await ChatList.findOne({ uid: friendId });
        if(list) {
            if(!list.chats.find(c => c.room === chatObj.room)) {
                list.chats.push(chatObj);
                await ChatList.updateOne({ uid: friendId }, { chats: list.chats });
                io.to("user-" + friendId).emit('sync_chats', list.chats);
            }
        }
    });

    // Удаление из группы (только админ)
    socket.on('kick_user', async (data) => {
        const { targetId, room } = data;
        let list = await ChatList.findOne({ uid: targetId });
        if(list) {
            list.chats = list.chats.filter(c => c.room !== room);
            await ChatList.updateOne({ uid: targetId }, { chats: list.chats });
            io.to("user-" + targetId).emit('sync_chats', list.chats);
            io.to("user-" + targetId).emit('kicked_alert', room);
        }
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>G-CHAT ELITE</title>
    <style>
        :root { --bg: #0b0e14; --panel: #151921; --accent: #7c3aed; --text: #ffffff; }
        * { box-sizing: border-box; font-family: sans-serif; }
        body { margin: 0; background: var(--bg); color: var(--text); display: flex; height: 100vh; overflow: hidden; }
        
        #auth-screen { position: fixed; inset: 0; background: #000; z-index: 10000; display: flex; align-items: center; justify-content: center; }
        .card { background: var(--panel); padding: 30px; border-radius: 20px; width: 90%; max-width: 350px; text-align: center; border: 1px solid #333; }
        input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 14px; border-radius: 12px; margin-bottom: 10px; font-size: 16px; }
        .btn { background: var(--accent); color: #fff; border: none; padding: 14px; border-radius: 12px; width: 100%; cursor: pointer; font-weight: bold; }

        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #222; display: flex; flex-direction: column; transition: 0.3s; z-index: 999; }
        .room-item { padding: 15px; border-bottom: 1px solid #222; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        .room-item.active { background: #1c2128; border-left: 4px solid var(--accent); }

        #chat-main { flex: 1; display: flex; flex-direction: column; background: #07080c; position: relative; }
        .header { height: 60px; background: var(--panel); display: flex; align-items: center; padding: 0 15px; border-bottom: 1px solid #333; }
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; padding-bottom: 80px; }
        
        .msg { max-width: 80%; padding: 12px; border-radius: 15px; font-size: 15px; line-height: 1.4; position: relative; }
        .me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 2px; }
        .them { align-self: flex-start; background: #22272e; border-bottom-left-radius: 2px; }

        .input-bar { position: absolute; bottom: 0; left: 0; right: 0; padding: 12px; background: var(--panel); display: flex; gap: 10px; border-top: 1px solid #333; }
        .input-bar input { margin: 0; flex: 1; }
        
        .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:10001; align-items:center; justify-content:center; }
        @media (max-width: 700px) { #sidebar { position: absolute; left: -100%; width: 85%; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>
    <div id="auth-screen">
        <div class="card">
            <h2 style="color:var(--accent)">G-CHAT ELITE</h2>
            <input id="an" placeholder="Логин">
            <input id="ap" type="password" placeholder="Пароль">
            <button class="btn" onclick="auth()">ВОЙТИ / СОЗДАТЬ</button>
        </div>
    </div>

    <div id="m-box" class="modal">
        <div class="card">
            <h3 id="m-title"></h3>
            <input id="m-id" placeholder="ID пользователя">
            <input id="m-name" placeholder="Название">
            <button class="btn" id="m-ok">ОК</button>
            <button class="btn" style="background:#444; margin-top:5px" onclick="document.getElementById('m-box').style.display='none'">ОТМЕНА</button>
        </div>
    </div>

    <div id="sidebar">
        <div style="padding:20px; border-bottom:1px solid #333">
            <b id="ui-name" style="font-size:18px"></b><br><small id="ui-id" style="opacity:0.5"></small>
        </div>
        <div id="rooms" style="flex:1; overflow-y:auto"></div>
        <div style="padding:10px; display:grid; gap:5px">
            <button class="btn" onclick="openM('private')">ЛИЧКА</button>
            <button class="btn" style="background:#2d333b" onclick="openM('group')">ГРУППА</button>
        </div>
    </div>

    <div id="chat-main">
        <div class="header">
            <button onclick="document.getElementById('sidebar').classList.toggle('open')" style="background:none; border:none; color:white; font-size:20px">☰</button>
            <b id="chat-name" style="margin-left:15px">Выберите чат</b>
            <button id="admin-add" style="display:none; margin-left:auto; background:var(--accent); border:none; color:white; border-radius:8px; padding:5px 10px;" onclick="openM('invite')">+ ИГРОК</button>
            <button id="admin-kick" style="display:none; margin-left:10px; background:#ff4444; border:none; color:white; border-radius:8px; padding:5px 10px;" onclick="openM('kick')">ВЫГНАТЬ</button>
        </div>
        <div id="messages"></div>
        <div class="input-bar">
            <button onclick="f_in.click()" style="background:none; border:none; font-size:20px">📷</button>
            <input type="file" id="f_in" hidden accept="image/*" onchange="sendI(this)">
            <input id="mi" placeholder="Сообщение..." onkeypress="if(event.key=='Enter')sendT()">
            <button onclick="sendT()" style="background:none; border:none; color:var(--accent); font-size:22px">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io(); let me, curR, curC;

        // Запрос разрешений на пуши
        if(Notification.permission !== 'granted') Notification.requestPermission();

        function auth() {
            const n = document.getElementById('an').value, p = document.getElementById('ap').value;
            if(n && p) socket.emit('server_auth', {name:n, pass:p});
        }

        window.onload = () => {
            const s = localStorage.getItem('g_v11');
            if(s) socket.emit('server_auth', JSON.parse(s));
        }

        socket.on('auth_success', d => {
            me = d; localStorage.setItem('g_v11', JSON.stringify({name:d.name, pass:d.pass}));
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('ui-name').innerText = me.name;
            document.getElementById('ui-id').innerText = "ID: " + me.id;
            socket.emit('register_me', me.id);
        });

        socket.on('sync_chats', list => {
            const r = document.getElementById('rooms'); r.innerHTML = '';
            list.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-item' + (curR === c.room ? ' active' : '');
                d.innerHTML = \`<b>\${c.name}</b> \${c.adminId === me.id ? '<small style="color:var(--accent)">★</small>' : ''}\`;
                d.onclick = () => {
                    curR = c.room; curC = c;
                    document.getElementById('chat-name').innerText = c.name;
                    document.getElementById('messages').innerHTML = '';
                    document.getElementById('admin-add').style.display = (c.type==='group' && c.adminId === me.id) ? 'block' : 'none';
                    document.getElementById('admin-kick').style.display = (c.type==='group' && c.adminId === me.id) ? 'block' : 'none';
                    socket.emit('join_room', c.room);
                    document.getElementById('sidebar').classList.remove('open');
                };
                r.appendChild(d);
            });
        });

        function openM(t) {
            const box = document.getElementById('m-box'), ti = document.getElementById('m-title'), nid = document.getElementById('m-id'), nn = document.getElementById('m-name');
            box.style.display = 'flex'; nid.style.display = (t==='group')?'none':'block'; nn.style.display = (t==='invite'||t==='kick')?'none':'block';
            ti.innerText = (t==='private')?'Личка':(t==='group')?'Группа':(t==='invite')?'Пригласить':'Выгнать';
            
            document.getElementById('m-ok').onclick = () => {
                if(t==='private'){
                    const r = [me.id, parseInt(nid.value)].sort().join('_');
                    socket.emit('save_chat_to_server', {uid:me.id, chat:{name:nn.value, room:r, type:'private'}});
                } else if(t==='group'){
                    const r = 'grp_'+Date.now();
                    socket.emit('save_chat_to_server', {uid:me.id, chat:{name:nn.value, room:r, type:'group', adminId: me.id}});
                } else if(t==='invite'){
                    socket.emit('invite_to_group', {friendId: parseInt(nid.value), chatObj: curC});
                } else if(t==='kick'){
                    socket.emit('kick_user', {targetId: parseInt(nid.value), room: curR});
                }
                box.style.display = 'none';
            };
        }

        function sendT() {
            const i = document.getElementById('mi');
            if(i.value && curR) {
                socket.emit('send_msg', {room:curR, userId:me.id, userName:me.name, content:i.value, type:'text'});
                i.value = '';
            }
        }

        function sendI(input) {
            const r = new FileReader();
            r.onload = () => socket.emit('send_msg', {room:curR, userId:me.id, userName:me.name, content:r.result, type:'img'});
            r.readAsDataURL(input.files[0]);
        }

        socket.on('load_history', h => h.forEach(render));
        socket.on('new_msg', m => { 
            if(m.room === curR) render(m); 
            else if(Notification.permission === 'granted') new Notification(m.userName, {body: m.content});
        });

        socket.on('kicked_alert', r => { if(curR === r) { alert('Вас выгнали из этой группы'); location.reload(); } });

        function render(m) {
            const c = document.getElementById('messages'), d = document.createElement('div');
            d.className = 'msg ' + (m.userId === me.id ? 'me' : 'them');
            let body = m.type === 'img' ? \`<img src="\${m.content}" style="max-width:100%; border-radius:10px">\` : m.content;
            d.innerHTML = \`<div style="font-size:10px; opacity:0.5; margin-bottom:4px">\${m.userName}</div>\${body}\`;
            c.appendChild(d); c.scrollTop = c.scrollHeight;
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
