const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log("G-CHAT V10 STARTED"));

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

    socket.on('invite_to_group', async (data) => {
        const { friendId, chatObj } = data;
        let list = await ChatList.findOne({ uid: friendId });
        if(list && !list.chats.find(c => c.room === chatObj.room)) {
            list.chats.push(chatObj);
            await ChatList.updateOne({ uid: friendId }, { chats: list.chats });
            io.to("user-" + friendId).emit('sync_chats', list.chats);
        }
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
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>G-CHAT ETERNAL</title>
    <style>
        :root { --bg: #0b0e14; --panel: #151921; --accent: #7c3aed; --text: #ffffff; }
        * { box-sizing: border-box; font-family: 'Segoe UI', sans-serif; }
        body { margin: 0; background: var(--bg); color: var(--text); display: flex; height: 100vh; overflow: hidden; }
        
        #auth-screen { position: fixed; inset: 0; background: #000; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: var(--panel); padding: 30px; border-radius: 20px; width: 100%; max-width: 350px; text-align: center; border: 1px solid #333; }
        input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 14px; border-radius: 12px; margin-bottom: 10px; font-size: 16px; }
        .btn { background: var(--accent); color: #fff; border: none; padding: 14px; border-radius: 12px; width: 100%; cursor: pointer; font-weight: bold; }

        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #222; display: flex; flex-direction: column; transition: 0.3s; z-index: 999; }
        .room-item { padding: 15px; border-bottom: 1px solid #222; cursor: pointer; display: flex; align-items: center; gap: 10px; }
        .room-item.active { background: #1c2128; border-left: 4px solid var(--accent); }

        #chat-main { flex: 1; display: flex; flex-direction: column; background: #07080c; position: relative; }
        .header { height: 65px; background: var(--panel); display: flex; align-items: center; padding: 0 15px; border-bottom: 1px solid #333; }
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; padding-bottom: 80px; }
        
        .msg { max-width: 80%; padding: 12px 16px; border-radius: 18px; position: relative; font-size: 15px; line-height: 1.4; animation: fIn 0.2s; }
        @keyframes fIn { from { opacity: 0; transform: translateY(5px); } }
        .me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 2px; }
        .them { align-self: flex-start; background: #22272e; border-bottom-left-radius: 2px; }

        .input-bar { position: absolute; bottom: 0; left: 0; right: 0; padding: 15px; background: var(--panel); display: flex; gap: 10px; align-items: center; border-top: 1px solid #333; }
        .icon-btn { background: none; border: none; color: #888; font-size: 24px; cursor: pointer; }

        /* MODALS */
        .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:10001; align-items:center; justify-content:center; padding:20px; }
        
        @media (max-width: 700px) {
            #sidebar { position: absolute; left: -100%; height: 100%; width: 85%; }
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>
    <div id="auth-screen">
        <div class="card">
            <h2 style="color:var(--accent)">G-CHAT</h2>
            <input id="an" placeholder="Логин">
            <input id="ap" type="password" placeholder="Пароль">
            <button class="btn" onclick="auth()">ВОЙТИ / СОЗДАТЬ</button>
        </div>
    </div>

    <div id="add-modal" class="modal">
        <div class="card">
            <h3 id="modal-title">Новый чат</h3>
            <input id="modal-id" placeholder="ID друга">
            <input id="modal-name" placeholder="Название">
            <button class="btn" id="modal-ok">ДОБАВИТЬ</button>
            <button class="btn" style="background:#444; margin-top:10px" onclick="closeModal()">ОТМЕНА</button>
        </div>
    </div>

    <div id="sidebar">
        <div style="padding:20px; border-bottom:1px solid #333">
            <b id="m-name" style="font-size:18px"></b><br>
            <small id="m-id" style="opacity:0.5"></small>
            <button onclick="localStorage.removeItem('gchat_v10');location.reload()" style="display:block; margin-top:10px; background:none; border:1px solid #444; color:#fff; border-radius:8px; padding:4px 10px; font-size:10px">ВЫЙТИ</button>
        </div>
        <div id="rooms" style="flex:1; overflow-y:auto"></div>
        <div style="padding:15px; display:grid; gap:10px">
            <button class="btn" style="background:#2d333b; font-size:13px" onclick="openAdd('private')">+ ЛИЧКА</button>
            <button class="btn" style="background:#2d333b; font-size:13px" onclick="openAdd('group')">+ ГРУППА</button>
        </div>
    </div>

    <div id="chat-main">
        <div class="header">
            <button class="icon-btn" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
            <b id="c-title" style="margin-left:10px">Чат</b>
            <button id="add-member-btn" style="display:none; margin-left:auto; background:var(--accent); border:none; color:white; padding:6px 12px; border-radius:10px; font-size:12px; font-weight:bold" onclick="openAdd('invite')">+ ПРИГЛАСИТЬ</button>
        </div>
        <div id="messages"></div>
        <div class="input-bar">
            <button class="icon-btn" onclick="f_in.click()">📷</button>
            <input type="file" id="f_in" hidden accept="image/*" onchange="sImg(this)">
            <input id="mi" placeholder="Сообщение..." onkeypress="if(event.key=='Enter')send()">
            <button class="icon-btn" style="color:var(--accent)" onclick="send()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io(); let me, curR, curType;

        function auth() {
            const name = document.getElementById('an').value, pass = document.getElementById('ap').value;
            if(name && pass) socket.emit('server_auth', {name, pass});
        }

        window.onload = () => {
            const saved = localStorage.getItem('gchat_v10');
            if(saved) socket.emit('server_auth', JSON.parse(saved));
        }

        socket.on('auth_success', d => {
            me = d; localStorage.setItem('gchat_v10', JSON.stringify({name:d.name, pass:d.pass}));
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('m-name').innerText = me.name;
            document.getElementById('m-id').innerText = "ID: " + me.id;
            socket.emit('register_me', me.id);
        });

        socket.on('sync_chats', list => {
            const r = document.getElementById('rooms'); r.innerHTML = '';
            list.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-item' + (curR === c.room ? ' active' : '');
                d.innerHTML = \`<div style="width:10px; height:10px; background:var(--accent); border-radius:50%"></div> <b>\${c.name}</b>\`;
                d.onclick = () => {
                    curR = c.room; curType = c.type;
                    document.getElementById('c-title').innerText = c.name;
                    document.getElementById('add-member-btn').style.display = (c.type==='group')?'block':'none';
                    document.getElementById('messages').innerHTML = '';
                    socket.emit('join_room', c.room);
                    document.getElementById('sidebar').classList.remove('open');
                };
                r.appendChild(d);
            });
        });

        // МОДАЛЬНОЕ ОКНО ВМЕСТО PROMPT
        function openAdd(type) {
            const m = document.getElementById('add-modal');
            const ti = document.getElementById('modal-title');
            const nid = document.getElementById('modal-id');
            const nn = document.getElementById('modal-name');
            m.style.display = 'flex';
            if(type === 'private') { ti.innerText = "Новая личка"; nid.style.display='block'; nn.style.display='block'; }
            if(type === 'group') { ti.innerText = "Создать группу"; nid.style.display='none'; nn.style.display='block'; }
            if(type === 'invite') { ti.innerText = "Пригласить друга"; nid.style.display='block'; nn.style.display='none'; }
            
            document.getElementById('modal-ok').onclick = () => {
                if(type === 'private') {
                    const room = [me.id, parseInt(nid.value)].sort().join('_');
                    socket.emit('save_chat_to_server', {uid:me.id, chat:{name:nn.value, room, type:'private'}});
                } else if(type === 'group') {
                    const room = 'grp_'+Date.now();
                    socket.emit('save_chat_to_server', {uid:me.id, chat:{name:nn.value, room, type:'group'}});
                } else if(type === 'invite') {
                    socket.emit('invite_to_group', {friendId: parseInt(nid.value), chatObj: {name:document.getElementById('c-title').innerText, room:curR, type:'group'}});
                }
                closeModal();
            };
        }
        function closeModal() { document.getElementById('add-modal').style.display='none'; }

        function send() {
            const i = document.getElementById('mi');
            if(i.value && curR) {
                socket.emit('send_msg', {room:curR, userId:me.id, userName:me.name, content:i.value, type:'text'});
                i.value = '';
            }
        }

        function sImg(input) {
            const reader = new FileReader();
            reader.onload = () => socket.emit('send_msg', {room:curR, userId:me.id, userName:me.name, content:reader.result, type:'img'});
            reader.readAsDataURL(input.files[0]);
        }

        socket.on('load_history', h => h.forEach(render));
        socket.on('new_msg', m => { if(m.room === curR) render(m); });
        socket.on('msg_deleted', id => document.getElementById('m-'+id)?.remove());

        function render(m) {
            const cont = document.getElementById('messages');
            const d = document.createElement('div');
            d.id = 'm-' + m.id;
            d.className = 'msg ' + (m.userId === me.id ? 'me' : 'them');
            let content = m.content;
            if(m.type === 'img') content = '<img src="'+m.content+'" style="max-width:100%; border-radius:12px; margin-top:5px; display:block">';
            const del = (m.userId === me.id) ? \`<span style="color:#ff4d4d; margin-left:10px; cursor:pointer" onclick="socket.emit('delete_msg',{id:\${m.id}})">✖</span>\` : '';
            d.innerHTML = \`<div style="font-size:11px; opacity:0.5; margin-bottom:5px"><b>\${m.userName}</b>\${del}</div>\${content}\`;
            cont.appendChild(d); cont.scrollTop = cont.scrollHeight;
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
