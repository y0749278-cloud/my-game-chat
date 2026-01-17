const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log("БАЗА ПОДКЛЮЧЕНА"));

const User = mongoose.model('User', new mongoose.Schema({ name: String, pass: String, id: Number }));
const ChatList = mongoose.model('ChatList', new mongoose.Schema({ uid: Number, chats: Array }));
const Msg = mongoose.model('Msg', new mongoose.Schema({ room: String, userId: Number, userName: String, content: String, type: String, date: Date }));

io.on('connection', (socket) => {
    
    socket.on('server_auth', async (data) => {
        const { name, pass, type } = data;
        
        if (type === 'reg') {
            // ЛОГИКА РЕГИСТРАЦИИ
            const exist = await User.findOne({ name });
            if (exist) return socket.emit('auth_error', 'Имя уже занято другим челом!');
            
            const newId = Math.floor(10000 + Math.random() * 89999);
            const newUser = await new User({ name, pass, id: newId }).save();
            await new ChatList({ uid: newId, chats: [] }).save();
            
            socket.emit('auth_success', { name: newUser.name, id: newUser.id, pass: newUser.pass });
        } else {
            // ЛОГИКА ВХОДА
            const acc = await User.findOne({ name, pass });
            if (acc) {
                socket.emit('auth_success', { name: acc.name, id: acc.id, pass: acc.pass });
                const list = await ChatList.findOne({ uid: acc.id });
                socket.emit('sync_chats', list ? list.chats : []);
            } else {
                socket.emit('auth_error', 'Неверный логин или пароль!');
            }
        }
    });

    socket.on('register_me', (id) => socket.join("user-" + id));
    
    socket.on('join_room', async (room) => {
        socket.join(room);
        const history = await Msg.find({ room }).sort({date: 1}).limit(50);
        socket.emit('load_history', history);
    });

    socket.on('send_msg', async (data) => {
        const msgData = { date: new Date(), ...data };
        await new Msg(msgData).save();
        io.to(data.room).emit('new_msg', msgData);
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
            const newList = await ChatList.findOne({ uid: data.uid });
            socket.emit('sync_chats', newList.chats);
        }
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>G-Chat Pro</title>
    <style>
        body { margin: 0; background: #0b0e14; color: white; font-family: sans-serif; display: flex; height: 100vh; overflow: hidden; }
        #auth { position: fixed; inset: 0; background: #07080c; z-index: 100; display: flex; align-items: center; justify-content: center; }
        .box { background: #151921; padding: 30px; border-radius: 20px; width: 300px; text-align: center; border: 1px solid #333; }
        input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 10px; margin-bottom: 10px; }
        button { background: #7c3aed; color: white; border: none; padding: 10px; border-radius: 10px; cursor: pointer; }
        #sidebar { width: 250px; border-right: 1px solid #222; display: flex; flex-direction: column; background: #151921; }
        #chat { flex: 1; display: flex; flex-direction: column; background: #07080c; }
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 8px; }
        .msg { padding: 10px; border-radius: 10px; max-width: 80%; word-break: break-word; }
        .me { background: #7c3aed; align-self: flex-end; }
        .them { background: #222; align-self: flex-start; }
        #input-area { padding: 15px; display: flex; gap: 8px; background: #151921; align-items: center; }
        .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:200; align-items:center; justify-content:center; }
        img { max-width: 200px; border-radius: 10px; display: block; margin-top: 5px; }
        .active-room { border-left: 4px solid #7c3aed; background: #1e2530; }
        .room-item { padding: 15px; border-bottom: 1px solid #222; cursor: pointer; transition: 0.2s; }
        .room-item:hover { background: #222; }
    </style>
</head>
<body>
    <div id="auth"><div class="box"><h2>G-CHAT</h2>
        <input id="an" placeholder="Логин">
        <input id="ap" type="password" placeholder="Пароль">
        <button onclick="auth('login')" style="width:100%; margin-bottom: 10px;">ВХОД</button>
        <button style="background:#222; width:100%" onclick="auth('reg')">РЕГИСТРАЦИЯ</button>
    </div></div>
    
    <div id="prof-modal" class="modal"><div class="box"><h3>ПРОФИЛЬ</h3><p id="p-info"></p><button onclick="logout()" style="background:red; width:100%">Выйти</button><br><br><button onclick="prof_modal.style.display='none'" style="width:100%">Закрыть</button></div></div>

    <div id="sidebar">
        <div style="padding:15px; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center">
            <div><b id="my-name"></b><br><small id="my-id"></small></div>
            <button onclick="showProf()" style="background:none; font-size:20px; border:none; color:white; cursor:pointer">⚙️</button>
        </div>
        <div id="rooms" style="flex:1; overflow-y:auto"></div>
        <div style="padding:10px; display:grid; gap:5px">
            <button onclick="addLS()">+ Личка (ID)</button>
            <button onclick="createGrp()">+ Группа</button>
            <button id="inv-btn" style="display:none; background:#222" onclick="invite()">+ Добавить друга</button>
        </div>
    </div>

    <div id="chat">
        <div id="messages"></div>
        <div id="input-area">
            <button onclick="f_in.click()">📷</button>
            <input type="file" id="f_in" hidden accept="image/*" onchange="sendImg(this)">
            <button id="v_btn" onclick="startVoice()">🎤</button>
            <input id="mi" style="margin:0" placeholder="Сообщение...">
            <button onclick="sendText()">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io(); let user, curRoom, rec, chunks = [];
        
        window.onload = () => {
            const saved = localStorage.getItem('gchat_user');
            if(saved) {
                const data = JSON.parse(saved);
                socket.emit('server_auth', {name: data.name, pass: data.pass, type:'login'});
            }
        }

        function auth(t){
            const name = document.getElementById('an').value;
            const pass = document.getElementById('ap').value;
            if(!name || !pass) return alert("Введи данные!");
            socket.emit('server_auth', {name, pass, type:t});
        }

        socket.on('auth_success', a => {
            user = a;
            localStorage.setItem('gchat_user', JSON.stringify({name:a.name, pass:a.pass}));
            document.getElementById('auth').style.display='none';
            document.getElementById('my-name').innerText = user.name;
            document.getElementById('my-id').innerText = "ID: " + user.id;
            socket.emit('register_me', user.id);
        });

        socket.on('auth_error', e => { 
            alert(e); 
            localStorage.removeItem('gchat_user');
        });
        
        function showProf(){ 
            document.getElementById('p-info').innerHTML = "ID: "+user.id+"<br>Логин: "+user.name+"<br>Пароль: "+user.pass; 
            document.getElementById('prof-modal').style.display='flex'; 
        }

        function logout(){ 
            localStorage.removeItem('gchat_user'); 
            location.reload(); 
        }

        socket.on('sync_chats', c => {
            const container = document.getElementById('rooms');
            container.innerHTML = '';
            c.forEach(i => {
                let d = document.createElement('div');
                d.className = 'room-item' + (curRoom === i.room ? ' active-room' : '');
                d.innerText = i.name;
                d.onclick = () => join(i);
                container.append(d);
            });
        });

        function addLS(){
            let id = prompt("ID друга");
            let n = prompt("Имя для чата (как он будет виден у тебя)");
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
            let id = prompt("Введите ID друга, чтобы добавить его в текущий чат:");
            if(id){
                let c = {name: document.title, room: curRoom, type: 'group'}; 
                socket.emit('invite_to_group', {friendId: parseInt(id), chatObj: c});
                alert("ID " + id + " добавлен!");
            }
        }

        function join(c){
            curRoom = c.room;
            document.title = c.name;
            document.getElementById('inv-btn').style.display = (c.type === 'group') ? 'block' : 'none';
            document.getElementById('messages').innerHTML = '';
            socket.emit('join_room', c.room);
            const items = document.getElementsByClassName('room-item');
            for(let item of items) {
                item.classList.remove('active-room');
                if(item.innerText === c.name) item.classList.add('active-room');
            }
        }

        function sendText(){ 
            const mi = document.getElementById('mi');
            if(mi.value && curRoom){ 
                socket.emit('send_msg', {room:curRoom, userId:user.id, userName:user.name, content:mi.value, type:'text'}); 
                mi.value = ''; 
            } 
        }
        
        function sendImg(input){
            let file = input.files[0];
            let reader = new FileReader();
            reader.onload = () => { socket.emit('send_msg', {room:curRoom, userId:user.id, userName:user.name, content:reader.result, type:'img'}); };
            reader.readAsDataURL(file);
        }

        async function startVoice(){
            if(rec && rec.state === "recording"){ 
                rec.stop(); 
                document.getElementById('v_btn').style.background='#7c3aed'; 
                return; 
            }
            let s = await navigator.mediaDevices.getUserMedia({audio:true});
            rec = new MediaRecorder(s); chunks = [];
            rec.ondataavailable = e => chunks.push(e.data);
            rec.onstop = () => {
                let blob = new Blob(chunks, {type:'audio/webm'});
                let r = new FileReader();
                r.onload = () => socket.emit('send_msg', {room:curRoom, userId:user.id, userName:user.name, content:r.result, type:'audio'});
                r.readAsDataURL(blob);
            };
            rec.start(); 
            document.getElementById('v_btn').style.background='red';
        }

        socket.on('load_history', h => h.forEach(render));
        socket.on('new_msg', m => { if(m.room === curRoom) render(m); });
        
        function render(m){
            const container = document.getElementById('messages');
            let d = document.createElement('div'); 
            d.className = 'msg ' + (m.userId === user.id ? 'me' : 'them');
            let content = m.content;
            if(m.type === 'img') content = '<img src="'+m.content+'">';
            if(m.type === 'audio') content = '<audio src="'+m.content+'" controls style="width:200px"></audio>';
            d.innerHTML = '<small style="opacity:0.6">' + m.userName + '</small><br>' + content;
            container.append(d); 
            container.scrollTop = container.scrollHeight;
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
