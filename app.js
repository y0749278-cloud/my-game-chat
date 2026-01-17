const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log("SYSTEM ONLINE"));

const User = mongoose.model('User', new mongoose.Schema({ name: String, pass: String, id: Number }));
const ChatList = mongoose.model('ChatList', new mongoose.Schema({ uid: Number, chats: Array }));
const Msg = mongoose.model('Msg', new mongoose.Schema({ room: String, userId: Number, userName: String, content: String, type: String, id: Number, date: Date }));

io.on('connection', (socket) => {
    // ЕДИНАЯ АВТОРИЗАЦИЯ (Вход + Регистрация)
    socket.on('server_auth', async (data) => {
        const { name, pass } = data;
        let acc = await User.findOne({ name });
        
        if (acc) {
            // Если юзер есть, проверяем пароль
            if (acc.pass === pass) {
                socket.emit('auth_success', { name: acc.name, id: acc.id, pass: acc.pass });
                const list = await ChatList.findOne({ uid: acc.id });
                socket.emit('sync_chats', list ? list.chats : []);
            } else {
                socket.emit('auth_error', 'Неверный пароль для этого логина!');
            }
        } else {
            // Если юзера нет — регистрируем
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

    socket.on('invite_to_group', async (data) => {
        const { friendId, chatObj } = data;
        let list = await ChatList.findOne({ uid: friendId });
        if(list) {
            if(!list.chats.find(c => c.room === chatObj.room)) {
                list.chats.push(chatObj);
                await ChatList.updateOne({ uid: friendId }, { chats: list.chats });
            }
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
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>G-Chat Eternal</title>
    <style>
        :root { --bg: #0b0e14; --side: #151921; --acc: #7c3aed; --text: #ffffff; }
        body { margin: 0; background: var(--bg); color: var(--text); font-family: sans-serif; display: flex; height: 100vh; overflow: hidden; }
        #auth { position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .box { background: var(--side); padding: 30px; border-radius: 25px; width: 100%; max-width: 350px; text-align: center; border: 1px solid #333; }
        input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 15px; border-radius: 15px; margin-bottom: 12px; font-size: 16px; }
        .btn { background: var(--acc); color: #fff; border: none; padding: 15px; border-radius: 15px; width: 100%; cursor: pointer; font-weight: bold; font-size: 16px; }
        
        #sidebar { width: 300px; background: var(--side); border-right: 1px solid #222; display: flex; flex-direction: column; transition: 0.3s; }
        .room { padding: 15px 20px; cursor: pointer; border-bottom: 1px solid #222; }
        .active { background: #1c2128; border-left: 4px solid var(--acc); }

        #chat { flex: 1; display: flex; flex-direction: column; background: #07080c; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 80%; padding: 12px; border-radius: 15px; position: relative; font-size: 15px; }
        .me { align-self: flex-end; background: var(--acc); }
        .them { align-self: flex-start; background: #222; }
        
        #input-area { padding: 15px; background: var(--side); display: flex; gap: 10px; align-items: center; }
        .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:2000; align-items:center; justify-content:center; }
        
        @media (max-width: 700px) {
            #sidebar { position: absolute; left: -100%; z-index: 100; height: 100%; width: 80%; }
            #sidebar.open { left: 0; }
        }
        img { max-width: 100%; border-radius: 10px; margin-top: 5px; }
        audio { width: 100%; height: 35px; margin-top: 5px; }
    </style>
</head>
<body>
    <div id="auth">
        <div class="box">
            <h2 style="color:var(--acc)">G-CHAT</h2>
            <input id="an" placeholder="Логин">
            <input id="ap" type="password" placeholder="Пароль">
            <button class="btn" onclick="sendAuth()">ВОЙТИ / РЕГ</button>
            <p style="font-size:12px; opacity:0.5; margin-top:15px">Если аккаунта нет, он создастся автоматически</p>
        </div>
    </div>
    
    <div id="prof-modal" class="modal">
        <div class="box">
            <h3>МОЙ ПРОФИЛЬ</h3>
            <p id="p-info" style="text-align:left"></p>
            <button class="btn" style="background:#444; margin-bottom:10px" onclick="closeProf()">ЗАКРЫТЬ</button>
            <button class="btn" style="background:#ff3333" onclick="logout()">ВЫЙТИ</button>
        </div>
    </div>

    <div id="sidebar">
        <div style="padding:20px; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center">
            <div><b id="my-name"></b><br><small id="my-id" style="opacity:0.5"></small></div>
            <button onclick="showProf()" style="background:none; border:none; font-size:20px; cursor:pointer">⚙️</button>
        </div>
        <div id="rooms" style="flex:1; overflow-y:auto"></div>
        <div style="padding:15px; display:grid; gap:10px">
            <button class="btn" style="font-size:14px" onclick="addLS()">+ ЛИЧКА</button>
            <button class="btn" style="background:#333; font-size:14px" onclick="createGrp()">+ ГРУППА</button>
        </div>
    </div>

    <div id="chat">
        <div style="padding:15px; background:var(--side); display:flex; align-items:center; gap:15px">
            <button id="mob-btn" style="background:none; border:none; color:white; font-size:20px" onclick="sidebar.classList.toggle('open')">☰</button>
            <b id="chat-title">Выберите чат</b>
            <button id="inv-btn" style="display:none; margin-left:auto; background:var(--acc); border:none; color:white; border-radius:10px; padding:5px 12px; font-size:12px" onclick="invite()">+ ПРИГЛАСИТЬ</button>
        </div>
        <div id="messages"></div>
        <div id="input-area">
            <button style="background:none; border:none; font-size:20px" onclick="f_in.click()">📷</button>
            <input type="file" id="f_in" hidden accept="image/*" onchange="sendImg(this)">
            <button style="background:none; border:none; font-size:20px" id="v_btn" onclick="startVoice()">🎤</button>
            <input id="mi" placeholder="Сообщение..." style="margin:0" onkeypress="if(event.key=='Enter')sendText()">
            <button style="background:none; border:none; font-size:20px; color:var(--acc)" onclick="sendText()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io(); let user, curRoom, rec, chunks = [];
        
        // Пытаемся войти автоматически
        window.onload = () => {
            const saved = localStorage.getItem('gchat_v5');
            if(saved) socket.emit('server_auth', JSON.parse(saved));
        }

        function sendAuth(){
            const name = an.value, pass = ap.value;
            if(!name || !pass) return alert("Заполни поля!");
            socket.emit('server_auth', {name, pass});
        }

        socket.on('auth_success', a => {
            user = a; localStorage.setItem('gchat_v5', JSON.stringify({name:a.name, pass:a.pass}));
            auth.style.display='none'; my_name.innerText=user.name; my_id.innerText="ID: "+user.id;
            socket.emit('register_me', user.id);
        });

        socket.on('auth_error', e => { alert(e); localStorage.removeItem('gchat_v5'); });
        
        function showProf(){ p_info.innerHTML=\`<b>Логин:</b> \${user.name}<br><b>Пароль:</b> \${user.pass}<br><b>Твой ID:</b> \${user.id}\`; prof_modal.style.display='flex'; }
        function closeProf(){ prof_modal.style.display='none'; }
        function logout(){ localStorage.removeItem('gchat_v5'); location.reload(); }

        socket.on('sync_chats', c => {
            rooms.innerHTML='';
            c.forEach(i => {
                let d = document.createElement('div');
                d.className = 'room' + (curRoom === i.room ? ' active' : '');
                d.innerHTML = \`<b>\${i.name}</b>\`;
                d.onclick = () => { curRoom=i.room; chat_title.innerText=i.name; inv_btn.style.display=(i.type==='group'?'block':'none'); messages.innerHTML=''; socket.emit('join_room', i.room); sidebar.classList.remove('open'); };
                rooms.append(d);
            });
        });

        function addLS(){
            let id = prompt("Введите ID друга:"); let n = prompt("Имя для чата:");
            if(id && n){
                let r = [user.id, parseInt(id)].sort().join('_');
                let c = {name: n, room: r, type: 'private', tid: parseInt(id)};
                socket.emit('save_chat_to_server', {uid: user.id, chat: c});
            }
        }

        function createGrp(){
            let n = prompt("Название группы:");
            if(n){
                let r = 'grp_' + Date.now();
                let c = {name: n, room: r, type: 'group'};
                socket.emit('save_chat_to_server', {uid: user.id, chat: c});
            }
        }

        function invite(){
            let id = prompt("Введите ID друга для добавления в этот чат:");
            if(id){
                let c = {name: chat_title.innerText, room: curRoom, type: 'group'};
                socket.emit('invite_to_group', {friendId: parseInt(id), chatObj: c});
                alert("Пользователь добавлен!");
            }
        }

        function sendText(){ if(mi.value && curRoom){ socket.emit('send_msg', {room:curRoom, userId:user.id, userName:user.name, content:mi.value, type:'text'}); mi.value=''; }}
        function sendImg(input){
            let reader = new FileReader();
            reader.onload = () => socket.emit('send_msg', {room:curRoom, userId:user.id, userName:user.name, content:reader.result, type:'img'});
            reader.readAsDataURL(input.files[0]);
        }

        async function startVoice(){
            if(rec && rec.state === "recording"){ rec.stop(); v_btn.style.color='white'; return; }
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
            let del = (m.userId === user.id) ? \`<span style="margin-left:10px; color:red; cursor:pointer" onclick="socket.emit('delete_msg',{id:\${m.id},room:curRoom})">✖</span>\` : '';
            d.innerHTML = \`<div style="font-size:10px; opacity:0.6">\${m.userName}\${del}</div>\${c}\`;
            messages.append(d); messages.scrollTop = messages.scrollHeight;
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
