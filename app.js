const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
// Увеличил буфер для голосовых сообщений
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log("G-CHAT DATABASE CONNECTED"));

const User = mongoose.model('User', new mongoose.Schema({ name: String, pass: String, id: Number }));
const ChatList = mongoose.model('ChatList', new mongoose.Schema({ uid: Number, chats: Array }));
const Msg = mongoose.model('Msg', new mongoose.Schema({ room: String, userId: Number, userName: String, content: String, type: String, id: Number, date: Date }));

io.on('connection', (socket) => {
    // ВХОД И ЗАГРУЗКА ЧАТОВ
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
            socket.emit('auth_error', 'Неверный пароль!');
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

    // УДАЛЕНИЕ СООБЩЕНИЙ
    socket.on('delete_msg', async (data) => {
        await Msg.deleteOne({ id: data.id });
        io.to(data.room).emit('msg_deleted', data.id);
    });

    // СОХРАНЕНИЕ НОВОГО ЧАТА
    socket.on('save_chat_to_server', async (data) => {
        let list = await ChatList.findOne({ uid: data.uid });
        if(list) {
            // Проверка дублей
            if(!list.chats.find(c => c.room === data.chat.room)) {
                list.chats.push(data.chat);
                await ChatList.updateOne({ uid: data.uid }, { chats: list.chats });
                socket.emit('sync_chats', list.chats);
            }
        }
    });

    // ПРИГЛАШЕНИЕ В ГРУППУ
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
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>G-CHAT</title>
    <style>
        :root { --bg: #0b0e14; --panel: #151921; --accent: #7c3aed; --text: #ffffff; --danger: #ff4444; }
        * { box-sizing: border-box; font-family: 'Segoe UI', sans-serif; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; background: var(--bg); color: var(--text); display: flex; height: 100vh; overflow: hidden; }
        
        /* AUTH & MODALS */
        .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:10000; align-items:center; justify-content:center; }
        .card { background: var(--panel); padding: 25px; border-radius: 20px; width: 90%; max-width: 350px; text-align: center; border: 1px solid #333; }
        input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 10px; margin-bottom: 10px; font-size: 16px; outline: none; }
        .btn { background: var(--accent); color: #fff; border: none; padding: 12px; border-radius: 10px; width: 100%; font-weight: bold; cursor: pointer; }

        /* LAYOUT */
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #222; display: flex; flex-direction: column; transition: 0.3s; z-index: 999; }
        .room-item { padding: 15px; border-bottom: 1px solid #222; cursor: pointer; display: flex; align-items: center; gap: 10px; }
        .room-item.active { background: #1c2128; border-left: 4px solid var(--accent); }

        #chat-main { flex: 1; display: flex; flex-direction: column; background: #07080c; position: relative; }
        .header { height: 60px; background: var(--panel); display: flex; align-items: center; padding: 0 15px; border-bottom: 1px solid #333; justify-content: space-between; }
        
        /* MESSAGES */
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; padding-bottom: 80px; }
        .msg { max-width: 80%; padding: 10px 14px; border-radius: 16px; position: relative; font-size: 15px; word-break: break-word; }
        .me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 2px; }
        .them { align-self: flex-start; background: #22272e; border-bottom-left-radius: 2px; }
        
        /* INPUT AREA */
        .input-bar { position: absolute; bottom: 0; left: 0; right: 0; padding: 10px; background: var(--panel); display: flex; gap: 8px; align-items: center; border-top: 1px solid #333; }
        .icon-btn { background: none; border: none; color: #888; font-size: 24px; cursor: pointer; padding: 5px; }
        
        /* VOICE RECORDER UI */
        #rec-panel { display:none; flex:1; align-items:center; gap:15px; color: #ff4444; font-weight:bold; }
        .rec-dot { width:12px; height:12px; background:red; border-radius:50%; animation: pulse 1s infinite; }
        @keyframes pulse { 0% {opacity:1} 50% {opacity:0.5} 100% {opacity:1} }

        @media (max-width: 700px) { #sidebar { position: absolute; left: -100%; width: 100%; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>
    <div id="auth-screen" class="modal" style="display:flex">
        <div class="card">
            <h2 style="color:var(--accent); margin-top:0">G-CHAT</h2>
            <input id="an" placeholder="Логин">
            <input id="ap" type="password" placeholder="Пароль">
            <button class="btn" onclick="auth()">ВОЙТИ</button>
        </div>
    </div>

    <div id="m-box" class="modal">
        <div class="card">
            <h3 id="m-title"></h3>
            <input id="m-id" placeholder="ID (цифры)">
            <input id="m-name" placeholder="Название чата">
            <button class="btn" id="m-ok">ОК</button>
            <button class="btn" style="background:#333; margin-top:10px" onclick="closeM()">ОТМЕНА</button>
        </div>
    </div>

    <div id="sidebar">
        <div style="padding:20px; border-bottom:1px solid #333">
            <b id="my-name" style="font-size:20px"></b><br>
            <small id="my-id" style="opacity:0.6"></small>
            <button onclick="localStorage.removeItem('gc_v12');location.reload()" style="float:right; background:none; border:1px solid #555; color:#aaa; font-size:10px; padding:2px 5px; border-radius:4px">ВЫХОД</button>
        </div>
        <div id="rooms" style="flex:1; overflow-y:auto"></div>
        <div style="padding:15px; display:flex; gap:10px">
            <button class="btn" onclick="openM('private')">ЛС</button>
            <button class="btn" style="background:#2d333b" onclick="openM('group')">ГРУППА</button>
        </div>
    </div>

    <div id="chat-main">
        <div class="header">
            <button class="icon-btn" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
            <b id="c-title">Чат не выбран</b>
            <button id="add-btn" style="display:none; background:none; border:none; color:var(--accent); font-size:35px; cursor:pointer; font-weight:bold; line-height:1" onclick="openM('invite')">+</button>
        </div>
        
        <div id="messages"></div>
        
        <div class="input-bar">
            <div id="norm-panel" style="display:flex; width:100%; gap:8px; align-items:center">
                <button class="icon-btn" onclick="f_in.click()">📷</button>
                <input type="file" id="f_in" hidden accept="image/*" onchange="sendI(this)">
                <input id="mi" placeholder="Сообщение..." style="flex:1; background:#1c2128; border:none; color:#fff; padding:10px; border-radius:20px">
                <button class="icon-btn" onclick="startRec()">🎤</button>
                <button class="icon-btn" style="color:var(--accent)" onclick="sendT()">➤</button>
            </div>
            
            <div id="rec-panel">
                <div class="rec-dot"></div>
                <span>Запись...</span>
                <button class="icon-btn" style="color:#ff4444; margin-left:auto" onclick="cancelRec()">✖</button>
                <button class="icon-btn" style="color:var(--accent)" onclick="stopAndSendRec()">➤</button>
            </div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let me, curR, curC;
        let mediaRec, audioChunks = [];

        // АВТОРИЗАЦИЯ
        function auth() {
            const n = document.getElementById('an').value, p = document.getElementById('ap').value;
            if(n && p) socket.emit('server_auth', {name:n, pass:p});
        }
        
        window.onload = () => {
            const saved = localStorage.getItem('gc_v12');
            if(saved) socket.emit('server_auth', JSON.parse(saved));
        }

        socket.on('auth_success', d => {
            me = d; localStorage.setItem('gc_v12', JSON.stringify({name:d.name, pass:d.pass}));
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('my-name').innerText = me.name;
            document.getElementById('my-id').innerText = "ID: " + me.id;
            socket.emit('register_me', me.id);
        });

        // СПИСОК ЧАТОВ
        socket.on('sync_chats', list => {
            const r = document.getElementById('rooms'); r.innerHTML = '';
            list.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-item' + (curR === c.room ? ' active' : '');
                d.innerHTML = \`<div style="width:10px; height:10px; background:var(--accent); border-radius:50%"></div> <b>\${c.name}</b>\`;
                d.onclick = () => {
                    curR = c.room; curC = c;
                    document.getElementById('c-title').innerText = c.name;
                    document.getElementById('messages').innerHTML = '';
                    // Логика плюса: только если группа и я админ
                    const btn = document.getElementById('add-btn');
                    if(c.type === 'group' && c.adminId === me.id) btn.style.display = 'block';
                    else btn.style.display = 'none';
                    
                    socket.emit('join_room', c.room);
                    document.getElementById('sidebar').classList.remove('open');
                };
                r.appendChild(d);
            });
        });

        // МОДАЛКИ
        function openM(type) {
            const box = document.getElementById('m-box'), t = document.getElementById('m-title'), id = document.getElementById('m-id'), nm = document.getElementById('m-name');
            box.style.display = 'flex';
            id.style.display = (type==='group')?'none':'block';
            nm.style.display = (type==='invite')?'none':'block';
            
            if(type==='private') t.innerText="Новая личка";
            if(type==='group') t.innerText="Создать группу";
            if(type==='invite') t.innerText="Добавить участника";

            document.getElementById('m-ok').onclick = () => {
                if(type==='private') {
                    const room = [me.id, parseInt(id.value)].sort().join('_');
                    socket.emit('save_chat_to_server', {uid:me.id, chat:{name:nm.value, room, type:'private'}});
                }
                if(type==='group') {
                    const room = 'grp_'+Date.now();
                    socket.emit('save_chat_to_server', {uid:me.id, chat:{name:nm.value, room, type:'group', adminId:me.id}});
                }
                if(type==='invite') {
                    socket.emit('invite_to_group', {friendId:parseInt(id.value), chatObj:curC});
                }
                closeM();
            }
        }
        function closeM(){ document.getElementById('m-box').style.display='none'; }

        // СООБЩЕНИЯ
        function sendT() {
            const inp = document.getElementById('mi');
            if(inp.value && curR) {
                socket.emit('send_msg', {room:curR, userId:me.id, userName:me.name, content:inp.value, type:'text'});
                inp.value='';
            }
        }
        function sendI(inp) {
            const r = new FileReader();
            r.onload = () => socket.emit('send_msg', {room:curR, userId:me.id, userName:me.name, content:r.result, type:'img'});
            r.readAsDataURL(inp.files[0]);
        }

        // --- ГОЛОСОВЫЕ ---
        async function startRec() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRec = new MediaRecorder(stream);
                audioChunks = [];
                mediaRec.ondataavailable = e => audioChunks.push(e.data);
                mediaRec.start();
                
                document.getElementById('norm-panel').style.display='none';
                document.getElementById('rec-panel').style.display='flex';
            } catch(e) { alert('Разрешите доступ к микрофону!'); }
        }

        function cancelRec() {
            if(mediaRec) { mediaRec.stop(); mediaRec = null; }
            document.getElementById('rec-panel').style.display='none';
            document.getElementById('norm-panel').style.display='flex';
        }

        function stopAndSendRec() {
            if(mediaRec) {
                mediaRec.stop();
                mediaRec.onstop = () => {
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.readAsDataURL(blob);
                    reader.onloadend = () => {
                        socket.emit('send_msg', {room:curR, userId:me.id, userName:me.name, content:reader.result, type:'voice'});
                        cancelRec();
                    };
                };
            }
        }

        // ОТРИСОВКА
        socket.on('load_history', h => h.forEach(render));
        socket.on('new_msg', m => { if(m.room === curR) render(m); });
        socket.on('msg_deleted', id => document.getElementById('m-'+id)?.remove());

        function render(m) {
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.id = 'm-'+m.id;
            d.className = 'msg ' + (m.userId === me.id ? 'me' : 'them');
            
            let content = m.content;
            if(m.type === 'img') content = '<img src="'+m.content+'" style="max-width:100%; border-radius:10px">';
            if(m.type === 'voice') content = '<audio controls src="'+m.content+'" style="max-width:200px; height:30px"></audio>';
            
            const del = (m.userId === me.id) ? \`<span style="color:var(--danger); cursor:pointer; margin-left:8px" onclick="socket.emit('delete_msg',{id:\${m.id}, room:curR})">✖</span>\` : '';
            
            d.innerHTML = \`<div style="font-size:10px; opacity:0.6; margin-bottom:4px"><b>\${m.userName}</b>\${del}</div>\${content}\`;
            box.appendChild(d);
            box.scrollTop = box.scrollHeight;
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
