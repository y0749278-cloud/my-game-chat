const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log("G-CHAT CORE STARTED"));

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

    socket.on('delete_msg', async (id) => {
        await Msg.deleteOne({ id: id });
        io.emit('msg_deleted', id);
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
    <title>G-CHAT PRO</title>
    <style>
        :root { --bg: #0b0e14; --panel: #161b22; --accent: #7c3aed; --text: #e6edf3; }
        * { box-sizing: border-box; outline: none; }
        body { margin: 0; background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; display: flex; height: 100vh; overflow: hidden; }
        
        #auth-screen { position: fixed; inset: 0; background: #000; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .auth-card { background: var(--panel); padding: 35px; border-radius: 24px; width: 100%; max-width: 350px; text-align: center; border: 1px solid #30363d; }
        
        input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: #fff; padding: 14px; border-radius: 12px; margin-bottom: 12px; font-size: 16px; }
        .btn { background: var(--accent); color: #fff; border: none; padding: 14px; border-radius: 12px; width: 100%; cursor: pointer; font-weight: 600; font-size: 16px; transition: 0.2s; }
        .btn:active { transform: scale(0.98); opacity: 0.9; }

        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #30363d; display: flex; flex-direction: column; transition: 0.3s; z-index: 500; }
        .room-item { padding: 15px 20px; cursor: pointer; border-bottom: 1px solid #21262d; }
        .room-item.active { background: #1c2128; border-left: 4px solid var(--accent); }

        #chat-main { flex: 1; display: flex; flex-direction: column; background: #0d1117; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        .msg { max-width: 80%; padding: 12px 16px; border-radius: 18px; font-size: 15px; line-height: 1.4; position: relative; }
        .me { align-self: flex-end; background: var(--accent); color: white; border-bottom-right-radius: 4px; }
        .them { align-self: flex-start; background: #21262d; border-bottom-left-radius: 4px; }
        
        #input-area { padding: 15px; background: var(--panel); display: flex; gap: 10px; align-items: center; }
        .icon-btn { background: none; border: none; color: #8b949e; font-size: 22px; cursor: pointer; }
        
        @media (max-width: 768px) {
            #sidebar { position: absolute; left: -100%; width: 85%; height: 100%; }
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>
    <div id="auth-screen">
        <div class="auth-card">
            <h1 style="color:var(--accent); margin-top:0">G-CHAT PRO</h1>
            <input id="un" placeholder="Логин">
            <input id="up" type="password" placeholder="Пароль">
            <button class="btn" onclick="doAuth()">ВХОД / РЕГИСТРАЦИЯ</button>
        </div>
    </div>

    <div id="sidebar">
        <div style="padding:20px; border-bottom:1px solid #30363d; display:flex; justify-content:space-between; align-items:center">
            <div><b id="my-name"></b><br><small id="my-id" style="opacity:0.5"></small></div>
            <button onclick="logout()" style="background:none; border:1px solid #333; color:white; border-radius:8px; padding:4px 8px; font-size:10px">ВЫХОД</button>
        </div>
        <div id="rooms-list" style="flex:1; overflow-y:auto"></div>
        <div style="padding:15px">
            <button class="btn" style="background:#21262d; font-size:14px" onclick="addFriend()">+ ДОБАВИТЬ ДРУГА</button>
        </div>
    </div>

    <div id="chat-main">
        <div style="height:60px; background:var(--panel); border-bottom:1px solid #30363d; display:flex; align-items:center; padding:0 15px; gap:15px">
            <button class="icon-btn" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
            <b id="chat-title">Выберите чат</b>
        </div>
        <div id="messages"></div>
        <div id="input-area">
            <button class="icon-btn" onclick="f_in.click()">📷</button>
            <input type="file" id="f_in" hidden accept="image/*" onchange="sendImg(this)">
            <input id="mi" placeholder="Сообщение..." style="margin:0" onkeypress="if(event.key=='Enter')send()">
            <button class="icon-btn" style="color:var(--accent)" onclick="send()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let user = null, currentRoom = null;

        // Авторизация
        window.doAuth = function() {
            const name = document.getElementById('un').value;
            const pass = document.getElementById('up').value;
            if(name && pass) socket.emit('server_auth', {name, pass});
        };

        window.onload = () => {
            const saved = localStorage.getItem('gchat_v7');
            if(saved) socket.emit('server_auth', JSON.parse(saved));
        };

        socket.on('auth_success', data => {
            user = data;
            localStorage.setItem('gchat_v7', JSON.stringify({name:data.name, pass:data.pass}));
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('my-name').innerText = user.name;
            document.getElementById('my-id').innerText = "ID: " + user.id;
            socket.emit('register_me', user.id);
        });

        socket.on('auth_error', msg => alert(msg));
        window.logout = () => { localStorage.removeItem('gchat_v7'); location.reload(); };

        // Чаты
        socket.on('sync_chats', list => {
            const cont = document.getElementById('rooms-list');
            cont.innerHTML = '';
            list.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-item' + (currentRoom === c.room ? ' active' : '');
                d.innerText = c.name;
                d.onclick = () => {
                    currentRoom = c.room;
                    document.getElementById('chat-title').innerText = c.name;
                    document.getElementById('messages').innerHTML = '';
                    socket.emit('join_room', c.room);
                    document.getElementById('sidebar').classList.remove('open');
                };
                cont.appendChild(d);
            });
        });

        window.addFriend = () => {
            const id = prompt("Введите ID друга:");
            const name = prompt("Имя для чата:");
            if(id && name) {
                const room = [user.id, parseInt(id)].sort().join('_');
                socket.emit('save_chat_to_server', { uid: user.id, chat: { name, room, type: 'private' } });
            }
        };

        // Сообщения
        window.send = () => {
            const input = document.getElementById('mi');
            if(input.value && currentRoom) {
                socket.emit('send_msg', { room: currentRoom, userId: user.id, userName: user.name, content: input.value, type: 'text' });
                input.value = '';
            }
        };

        window.sendImg = (input) => {
            const reader = new FileReader();
            reader.onload = () => socket.emit('send_msg', { room: currentRoom, userId: user.id, userName: user.name, content: reader.result, type: 'img' });
            reader.readAsDataURL(input.files[0]);
        };

        socket.on('load_history', h => h.forEach(render));
        socket.on('new_msg', m => { if(m.room === currentRoom) render(m); });
        socket.on('msg_deleted', id => { const el = document.getElementById('m-'+id); if(el) el.remove(); });

        function render(m) {
            const cont = document.getElementById('messages');
            const d = document.createElement('div');
            d.id = 'm-' + m.id;
            d.className = 'msg ' + (m.userId === user.id ? 'me' : 'them');
            
            let content = m.content;
            if(m.type === 'img') content = '<img src="'+m.content+'" style="max-width:100%; border-radius:10px; margin-top:5px">';
            
            // Кнопка удаления (только для своих)
            const delBtn = (m.userId === user.id) ? 
                '<span style="color:#ff7b72; margin-left:10px; cursor:pointer" onclick="socket.emit(\\'delete_msg\\','+m.id+')">✖</span>' : '';

            d.innerHTML = '<div style="font-size:11px; opacity:0.5; margin-bottom:4px"><b>'+m.userName+'</b>'+delBtn+'</div>' + content;
            cont.appendChild(d);
            cont.scrollTop = cont.scrollHeight;
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
