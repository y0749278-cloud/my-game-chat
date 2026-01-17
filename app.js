const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log("G-CHAT ENGINE START"));

const User = mongoose.model('User', new mongoose.Schema({ name: String, pass: String, id: Number }));
const ChatList = mongoose.model('ChatList', new mongoose.Schema({ uid: Number, chats: Array }));
const Msg = mongoose.model('Msg', new mongoose.Schema({ room: String, userId: Number, userName: String, content: String, type: String, id: Number, date: Date }));

io.on('connection', (socket) => {
    socket.on('server_auth', async (data) => {
        const { name, pass, type } = data;
        if (type === 'reg') {
            if (await User.findOne({ name })) return socket.emit('auth_error', 'Имя занято!');
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
            } else socket.emit('auth_error', 'Ошибка входа!');
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
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-Chat Eternal</title>
    <style>
        :root { --bg: #0f1218; --side: #161b22; --acc: #8b5cf6; --text: #e6edf3; }
        * { box-sizing: border-box; outline: none; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, system-ui, sans-serif; display: flex; height: 100vh; overflow: hidden; }
        
        /* AUTH */
        #auth { position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .auth-box { background: var(--side); padding: 30px; border-radius: 24px; width: 100%; max-width: 350px; text-align: center; border: 1px solid #30363d; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: #fff; padding: 14px; border-radius: 12px; margin-bottom: 12px; font-size: 16px; }
        .btn-main { background: var(--acc); color: #fff; border: none; padding: 14px; border-radius: 12px; width: 100%; cursor: pointer; font-weight: 600; font-size: 16px; }
        
        /* SIDEBAR */
        #sidebar { width: 320px; background: var(--side); border-right: 1px solid #30363d; display: flex; flex-direction: column; transition: 0.3s; z-index: 50; }
        .sb-head { padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #30363d; }
        #rooms { flex: 1; overflow-y: auto; }
        .room-card { padding: 15px 20px; cursor: pointer; border-bottom: 1px solid #21262d; transition: 0.2s; }
        .room-card:active { background: #21262d; }
        .active-room { background: #1c2128; border-left: 4px solid var(--acc); }

        /* CHAT AREA */
        #chat { flex: 1; display: flex; flex-direction: column; position: relative; }
        .chat-head { height: 60px; background: var(--side); display: flex; align-items: center; padding: 0 20px; border-bottom: 1px solid #30363d; gap: 15px; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; background: #0d1117; }
        .msg { max-width: 85%; padding: 12px 16px; border-radius: 18px; position: relative; animation: fade 0.2s ease; font-size: 15px; }
        @keyframes fade { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .me { align-self: flex-end; background: var(--acc); color: #fff; border-bottom-right-radius: 4px; }
        .them { align-self: flex-start; background: #21262d; border-bottom-left-radius: 4px; }
        
        /* CONTROLS */
        #input-area { padding: 15px; background: var(--side); display: flex; gap: 10px; align-items: center; padding-bottom: calc(15px + env(safe-area-inset-bottom)); }
        .icon-btn { background: none; border: none; font-size: 22px; color: #8b949e; cursor: pointer; padding: 5px; }
        #mi { flex: 1; margin: 0; }

        /* MODAL */
        .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:2000; align-items:center; justify-content:center; backdrop-filter: blur(5px); }
        
        /* ADAPTIVITY */
        @media (max-width: 768px) {
            #sidebar { position: absolute; left: -100%; height: 100%; width: 85%; }
            #sidebar.open { left: 0; }
            .mobile-menu { display: block !important; }
        }
        img { max-width: 100%; border-radius: 12px; margin-top: 8px; }
        audio { height: 35px; margin-top: 8px; filter: invert(1); }
        .del { font-size: 11px; opacity: 0.5; margin-left: 8px; color: #ff7b72; cursor: pointer; }
    </style>
</head>
<body>
    <div id="auth">
        <div class="auth-box">
            <h2 style="color:var(--acc)">G-CHAT</h2>
            <input id="an" placeholder="Логин">
            <input id="ap" type="password" placeholder="Пароль">
            <button class="btn-main" onclick="auth('login')">ВХОД</button>
            <div style="margin: 15px 0; opacity: 0.5">или</div>
            <button class="btn-main" style="background:#21262d" onclick="auth('reg')">РЕГИСТРАЦИЯ</button>
        </div>
    </div>
    
    <div id="prof-modal" class="modal">
        <div class="auth-box">
            <h3>ПРОФИЛЬ</h3>
            <p id="p-info" style="text-align:left; line-height:1.6"></p>
            <button class="btn-main" style="background:#ff4444" onclick="logout()">ВЫЙТИ</button><br><br>
            <button class="btn-main" style="background:#30363d" onclick="closeProf()">ЗАКРЫТЬ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sb-head">
            <div><b id="my-name"></b><br><small id="my-id" style="opacity:0.5"></small></div>
            <button onclick="showProf()" style="background:none; border:none; font-size:20px; cursor:pointer">⚙️</button>
        </div>
        <div id="rooms"></div>
        <div style="padding:15px; display:grid; gap:8px">
            <button class="btn-main" onclick="addLS()" style="font-size:14px">+ ЛИЧКА</button>
            <button class="btn-main" style="background:#30363d; font-size:14px" onclick="createGrp()">+ ГРУППА</button>
        </div>
    </div>

    <div id="chat">
        <div class="chat-head">
            <button class="mobile-menu" style="display:none; background:none; border:none; color:white; font-size:24px" onclick="sidebar.classList.toggle('open')">☰</button>
            <b id="chat-title">Выберите чат</b>
            <button id="inv-btn" style="display:none; margin-left:auto; background:none; border:1px solid #30363d; color:white; border-radius:8px; padding:5px 10px" onclick="invite()">+ Добавить</button>
        </div>
        <div id="messages"></div>
        <div id="input-area">
            <button class="icon-btn" onclick="f_in.click()">📷</button>
            <input type="file" id="f_in" hidden accept="image/*" onchange="sendImg(this)">
            <button class="icon-btn" id="v_btn" onclick="startVoice()">🎤</button>
            <input id="mi" placeholder="Сообщение..." onkeypress="if(event.key=='Enter')sendText()">
            <button class="icon-btn" style="color:var(--acc)" onclick="sendText()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io(); let user, curRoom, rec, chunks = [];
        
        window.onload = () => {
            const saved = localStorage.getItem('g_u_data');
            if(saved) socket.emit('server_auth', {...JSON.parse(saved), type:'login'});
        }

        function auth(type){
            const name = an.value, pass = ap.value;
            if(!name || !pass) return;
            socket.emit('server_auth', {name, pass, type});
        }

        socket.on('auth_success', a => {
            user = a; localStorage.setItem('g_u_data', JSON.stringify({name:a.name, pass:a.pass}));
            auth.style.display='none'; my_name.innerText=user.name; my_id.innerText="ID: "+user.id;
            socket.emit('register_me', user.id);
        });

        socket.on('auth_error', e => alert(e));
        
        function showProf(){ p_info.innerHTML=\`<b>Логин:</b> \${user.name}<br><b>ID:</b> \${user.id}<br><b>Пароль:</b> \${user.pass}\`; prof_modal.style.display='flex'; }
        function closeProf(){ prof_modal.style.display='none'; }
        function logout(){ localStorage.removeItem('g_u_data'); location.reload(); }

        socket.on('sync_chats', c => {
            rooms.innerHTML='';
            c.forEach(i => {
                let d = document.createElement('div');
                d.className = 'room-card' + (curRoom === i.room ? ' active-room' : '');
                d.innerHTML = \`<b>\${i.name}</b><br><small style="opacity:0.5">\${i.type === 'group' ? 'Группа' : 'Личный чат'}</small>\`;
                d.onclick = () => { join(i); sidebar.classList.remove('open'); };
                rooms.append(d);
            });
        });

        function addLS(){
            let id = prompt("ID друга"); let n = prompt("Имя чата");
            if(id && n){
                let r = [user.id, parseInt(id)].sort().join('_');
                let c = {name: n, room: r, type: 'private', tid: parseInt(id)};
                socket.emit('save_chat_to_server', {uid: user.id, chat: c});
                join(c);
            }
        }

        function createGrp(){
            let n = prompt("Название группы");
            if(n){
                let r = 'grp_' + Date.now();
                let c = {name: n, room: r, type: 'group'};
                socket.emit('save_chat_to_server', {uid: user.id, chat: c});
                join(c);
            }
        }

        function invite(){
            let id = prompt("ID друга для добавления:");
            if(id){
                let c = {name: chat_title.innerText, room: curRoom, type: 'group'};
                socket.emit('invite_to_group', {friendId: parseInt(id), chatObj: c});
                alert("Добавлен!");
            }
        }

        function join(c){
            curRoom = c.room; chat_title.innerText = c.name;
            inv_btn.style.display = (c.type === 'group') ? 'block' : 'none';
            messages.innerHTML = ''; socket.emit('join_room', c.room);
            document.querySelectorAll('.room-card').forEach(el => el.classList.remove('active-room'));
        }

        function sendText(){ if(mi.value && curRoom){ socket.emit('send_msg', {room:curRoom, userId:user.id, userName:user.name, content:mi.value, type:'text'}); mi.value=''; }}
        function sendImg(input){
            let reader = new FileReader();
            reader.onload = () => socket.emit('send_msg', {room:curRoom, userId:user.id, userName:user.name, content:reader.result, type:'img'});
            reader.readAsDataURL(input.files[0]);
        }

        async function startVoice(){
            if(rec && rec.state === "recording"){ rec.stop(); v_btn.style.color='#8b949e'; return; }
            let s = await navigator.mediaDevices.getUserMedia({audio:true});
            rec = new MediaRecorder(s); chunks = [];
            rec.ondataavailable = e => chunks.push(e.data);
            rec.onstop = () => {
                let blob = new Blob(chunks, {type:'audio/webm'});
                let r = new FileReader();
                r.onload = () => socket.emit('send_msg', {room:curRoom, userId:user.id, userName:user.name, content:r.result, type:'audio'});
                r.readAsDataURL(blob);
            };
            rec.start(); v_btn.style.color='red';
        }

        socket.on('load_history', h => h.forEach(render));
        socket.on('new_msg', m => { if(m.room === curRoom) render(m); });
        socket.on('msg_deleted', id => document.getElementById('m-'+id)?.remove());

        function render(m){
            let d = document.createElement('div'); d.className = 'msg ' + (m.userId === user.id ? 'me' : 'them'); d.id = 'm-'+m.id;
            let c = m.content;
            if(m.type==='img') c = '<img src="'+m.content+'">';
            if(m.type==='audio') c = '<audio src="'+m.content+'" controls></audio>';
            let del = (m.userId === user.id) ? \`<span class="del" onclick="socket.emit('delete_msg',{id:\${m.id},room:curRoom})">✖</span>\` : '';
            d.innerHTML = \`<div style="font-size:11px; opacity:0.6; margin-bottom:4px">\${m.userName}\${del}</div>\${c}\`;
            messages.append(d); messages.scrollTop = messages.scrollHeight;
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
