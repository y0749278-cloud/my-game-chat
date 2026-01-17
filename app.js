const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log("DB CONNECTED"));

const User = mongoose.model('User', new mongoose.Schema({ name: String, pass: String, id: Number }));
const ChatList = mongoose.model('ChatList', new mongoose.Schema({ uid: Number, chats: Array }));
const Msg = mongoose.model('Msg', new mongoose.Schema({ room: String, userId: Number, userName: String, content: String, type: String, id: Number, date: Date }));

io.on('connection', (socket) => {
    // РАБОЧАЯ РЕГИСТРАЦИЯ/ВХОД
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
            const newUser = await new User({ name, pass, id: newId }).save();
            await new ChatList({ uid: newId, chats: [] }).save();
            socket.emit('auth_success', { name: newUser.name, id: newUser.id, pass: newUser.pass });
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
<html>
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>G-Chat</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #0b0e14; color: white; font-family: sans-serif; display: flex; height: 100vh; overflow: hidden; }
        #auth-screen { position: fixed; inset: 0; background: #000; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .auth-card { background: #151921; padding: 30px; border-radius: 20px; width: 100%; max-width: 340px; text-align: center; }
        input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 15px; border-radius: 12px; margin-bottom: 10px; font-size: 16px; }
        .btn { background: #7c3aed; color: #fff; border: none; padding: 15px; border-radius: 12px; width: 100%; cursor: pointer; font-weight: bold; }
        
        #sidebar { width: 280px; background: #151921; border-right: 1px solid #222; display: flex; flex-direction: column; }
        .room-btn { padding: 15px; border-bottom: 1px solid #222; cursor: pointer; }
        .room-btn.active { background: #1c2128; border-left: 4px solid #7c3aed; }

        #chat-window { flex: 1; display: flex; flex-direction: column; background: #07080c; position: relative; }
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 85%; padding: 10px 15px; border-radius: 15px; font-size: 15px; position: relative; }
        .me { align-self: flex-end; background: #7c3aed; }
        .them { align-self: flex-start; background: #222; }
        
        #input-bar { padding: 10px; background: #151921; display: flex; gap: 8px; align-items: center; }
        .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:5000; align-items:center; justify-content:center; }
        
        @media (max-width: 600px) {
            #sidebar { display: none; }
            #sidebar.show { display: flex; position: absolute; width: 100%; height: 100%; z-index: 100; }
        }
    </style>
</head>
<body>
    <div id="auth-screen">
        <div class="auth-card">
            <h2 style="color:#7c3aed">G-CHAT</h2>
            <input id="login-name" placeholder="Логин">
            <input id="login-pass" type="password" placeholder="Пароль">
            <button class="btn" onclick="doAuth()">ВОЙТИ / СОЗДАТЬ</button>
        </div>
    </div>

    <div id="sidebar">
        <div style="padding:20px; border-bottom:1px solid #333">
            <b id="display-name">...</b><br><small id="display-id" style="opacity:0.5"></small>
            <button onclick="logout()" style="margin-top:10px; width:100%; font-size:10px">ВЫЙТИ</button>
        </div>
        <div id="rooms-list" style="flex:1; overflow-y:auto"></div>
        <div style="padding:10px">
            <button class="btn" onclick="addFriend()">+ ЛИЧКА (ID)</button>
        </div>
    </div>

    <div id="chat-window">
        <div style="padding:10px; background:#151921; display:flex; align-items:center">
            <button onclick="document.getElementById('sidebar').classList.toggle('show')" style="background:none; border:none; color:white; font-size:20px; margin-right:10px">☰</button>
            <b id="current-chat-title">Выберите чат</b>
        </div>
        <div id="messages"></div>
        <div id="input-bar">
            <button onclick="f_in.click()" style="background:none; border:none; font-size:20px">📷</button>
            <input type="file" id="f_in" hidden accept="image/*" onchange="sendPhoto(this)">
            <input id="msg-input" placeholder="Текст..." style="margin:0" onkeypress="if(event.key=='Enter')sendMsg()">
            <button onclick="sendMsg()" style="background:none; border:none; font-size:20px; color:#7c3aed">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io(); let me = null, activeRoom = null;

        window.onload = () => {
            const data = localStorage.getItem('gchat_user_v6');
            if(data) socket.emit('server_auth', JSON.parse(data));
        }

        function doAuth() {
            const name = document.getElementById('login-name').value;
            const pass = document.getElementById('login-pass').value;
            if(name && pass) socket.emit('server_auth', {name, pass});
        }

        socket.on('auth_success', data => {
            me = data; localStorage.setItem('gchat_user_v6', JSON.stringify({name:data.name, pass:data.pass}));
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('display-name').innerText = me.name;
            document.getElementById('display-id').innerText = "ID: " + me.id;
            socket.emit('register_me', me.id);
        });

        socket.on('auth_error', msg => alert(msg));
        function logout() { localStorage.removeItem('gchat_user_v6'); location.reload(); }

        socket.on('sync_chats', list => {
            const container = document.getElementById('rooms-list');
            container.innerHTML = '';
            list.forEach(chat => {
                const div = document.createElement('div');
                div.className = 'room-btn' + (activeRoom === chat.room ? ' active' : '');
                div.innerText = chat.name;
                div.onclick = () => {
                    activeRoom = chat.room;
                    document.getElementById('current-chat-title').innerText = chat.name;
                    document.getElementById('messages').innerHTML = '';
                    socket.emit('join_room', chat.room);
                    document.getElementById('sidebar').classList.remove('show');
                };
                container.appendChild(div);
            });
        });

        function sendMsg() {
            const input = document.getElementById('msg-input');
            if(input.value && activeRoom) {
                socket.emit('send_msg', { room: activeRoom, userId: me.id, userName: me.name, content: input.value, type: 'text' });
                input.value = '';
            }
        }

        function sendPhoto(input) {
            const reader = new FileReader();
            reader.onload = () => socket.emit('send_msg', { room: activeRoom, userId: me.id, userName: me.name, content: reader.result, type: 'img' });
            reader.readAsDataURL(input.files[0]);
        }

        function addFriend() {
            const id = prompt("Введите ID друга:");
            const name = prompt("Как назвать чат?");
            if(id && name) {
                const room = [me.id, parseInt(id)].sort().join('_');
                socket.emit('save_chat_to_server', { uid: me.id, chat: { name, room, type: 'private' } });
            }
        }

        socket.on('load_history', h => h.forEach(render));
        socket.on('new_msg', m => { if(m.room === activeRoom) render(m); });
        socket.on('msg_deleted', id => document.getElementById('m-'+id)?.remove());

        function render(m) {
            const container = document.getElementById('messages');
            const div = document.createElement('div');
            div.id = 'm-' + m.id;
            div.className = 'msg ' + (m.userId === me.id ? 'me' : 'them');
            let body = m.content;
            if(m.type === 'img') body = '<img src="'+m.content+'" style="max-width:100%; border-radius:10px">';
            const del = (m.userId === me.id) ? '<span onclick="socket.emit(\'delete_msg\',{id:'+m.id+',room:activeRoom})" style="color:red; margin-left:10px; cursor:pointer">✖</span>' : '';
            div.innerHTML = '<div style="font-size:10px; opacity:0.5">'+m.userName+del+'</div>' + body;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
