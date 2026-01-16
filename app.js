const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

let serverHistory = []; 

io.on('connection', (socket) => {
    socket.on('register_me', (id) => { 
        socket.myId = id; 
        socket.join("user-" + id); 
    });
    
    socket.on('join_room', (room) => { 
        socket.join(room); 
        // Отправляем историю конкретно этому сокету
        const roomHistory = serverHistory.filter(m => m.room === room);
        socket.emit('load_history', roomHistory);
    });

    socket.on('send_msg', (data) => {
        const msg = { id: Date.now() + Math.random(), ...data };
        serverHistory.push(msg);
        if (serverHistory.length > 1000) serverHistory.shift();
        // Рассылаем ВСЕМ в комнате
        io.to(data.room).emit('new_msg', msg);
    });

    socket.on('delete_msg', (data) => {
        serverHistory = serverHistory.filter(m => m.id !== data.id);
        io.emit('msg_deleted', data.id);
    });

    socket.on('invite_to_group', (data) => {
        io.to("user-" + data.toId).emit('group_invite', { room: data.room, name: data.groupName, adminId: socket.myId });
    });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-chat</title>
    <style>
        :root { --bg: #07080c; --panel: #0f1117; --accent: #6d28d9; --text: #f3f4f6; --danger: #ff4444; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; outline: none; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); height: 100dvh; display: flex; overflow: hidden; font-size: 14px; }
        
        /* Модалки и Регистрация */
        #auth-screen, #modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(5px); }
        .ui-box { background: var(--panel); padding: 25px; border-radius: 20px; width: 100%; max-width: 300px; border: 1px solid #222; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 12px; border-radius: 12px; margin-bottom: 12px; font-size: 14px; }
        input:focus { border-color: var(--accent); }

        /* Интерфейс */
        #sidebar { width: 240px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid var(--accent); background: rgba(109, 40, 217, 0.05); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 12px; margin-bottom: 8px; background: #161b22; border-radius: 12px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
        .room-btn.active { border-color: var(--accent); background: rgba(109, 40, 217, 0.15); }

        #chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; position: relative; }
        .top-bar { height: 55px; padding: 0 15px; background: var(--panel); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 8px; background: #07080c; }
        
        /* Сообщения */
        .msg { max-width: 85%; padding: 10px 14px; border-radius: 16px; font-size: 13.5px; position: relative; animation: fadeIn 0.2s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 4px; }
        .msg.them { align-self: flex-start; background: #1e293b; border-bottom-left-radius: 4px; }
        .msg-meta { font-size: 10px; opacity: 0.5; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .del-msg { color: var(--danger); cursor: pointer; font-weight: bold; font-size: 12px; padding: 2px; }

        /* Ввод */
        #input-zone { padding: 12px; background: var(--panel); display: flex; align-items: center; gap: 10px; border-top: 1px solid #1e293b; }
        #msg-in { flex: 1; margin-bottom: 0; border-radius: 25px; padding: 10px 18px; height: 42px; }
        
        .btn { background: var(--accent); border: none; color: white; padding: 10px 18px; border-radius: 12px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn:active { transform: scale(0.95); opacity: 0.8; }
        .icon-btn { font-size: 22px; cursor: pointer; color: #888; transition: 0.2s; }
        .icon-btn:hover { color: var(--accent); }
        
        .rec-controls { display: none; gap: 15px; background: #000; padding: 8px 20px; border-radius: 25px; align-items: center; }

        @media (max-width: 768px) { 
            #sidebar { position: fixed; left: -240px; height: 100%; box-shadow: 10px 0 30px rgba(0,0,0,0.5); } 
            #sidebar.open { left: 0; }
        }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="ui-box">
            <h2 style="margin-bottom:15px; text-align:center;">G-chat</h2>
            <input type="text" id="auth-name" placeholder="Ваше имя">
            <input type="password" id="auth-pass" placeholder="Ваш пароль">
            <button onclick="doAuth('login')" class="btn" style="width:100%; margin-bottom:10px;">Войти</button>
            <button onclick="doAuth('reg')" class="btn" style="width:100%; background:#222;">Регистрация</button>
        </div>
    </div>

    <div id="modal-overlay" style="display:none;">
        <div class="ui-box">
            <b id="modal-title" style="display:block; margin-bottom:12px;"></b>
            <input type="text" id="modal-i1">
            <input type="text" id="modal-i2" style="display:none;">
            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button onclick="closeModal()" style="background:none; border:none; color:#777;">Отмена</button>
                <button id="modal-ok" class="btn">ОК</button>
            </div>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <b id="my-name" style="font-size:16px;">...</b>
            <div id="my-id" style="font-size:11px; color:var(--accent); font-weight:bold;">ID: ...</div>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:15px; display:flex; gap:8px;">
            <button onclick="askGroup()" class="btn" style="flex:1; padding:10px 5px;">+Группа</button>
            <button onclick="askFriend()" class="btn" style="flex:1; background:#222; padding:10px 5px;">+Друг</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="document.getElementById('sidebar').classList.toggle('open')" style="background:none; border:none; color:white; font-size:24px;">☰</button>
            <b id="chat-title">G-chat</b>
            <button id="add-btn" class="btn" style="display:none; padding:5px 12px;">+</button>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <span class="icon-btn" onclick="document.getElementById('file-in').click()">📎</span>
            <input type="file" id="file-in" hidden onchange="uploadFile()">
            <input type="text" id="msg-in" placeholder="Напишите..." autocomplete="off">
            
            <div id="voice-ui" class="rec-controls">
                <span onclick="cancelVoice()" style="color:var(--danger); cursor:pointer;">🗑️</span>
                <span onclick="stopVoice()" style="color:#22c55e; cursor:pointer;">🛑 Отправить</span>
            </div>
            
            <span id="mic-btn" class="icon-btn" onclick="startVoice()">🎤</span>
            <button onclick="sendText()" class="btn">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let me = JSON.parse(localStorage.getItem('g_user'));
        let myChats = JSON.parse(localStorage.getItem('g_chats')) || [];
        let curRoom = null;
        let recorder, chunks = [], isCancel = false;

        if(me) {
            document.getElementById('auth-screen').style.display = 'none';
            init();
        }

        function doAuth(type) {
            const name = document.getElementById('auth-name').value;
            const pass = document.getElementById('auth-pass').value;
            if(!name || !pass) return alert("Введите данные!");

            if(type === 'reg') {
                const id = Math.floor(1000 + Math.random() * 8999);
                const user = { name, pass, id };
                localStorage.setItem('db_'+name, JSON.stringify(user));
                alert("Готово! Войдите.");
            } else {
                const user = JSON.parse(localStorage.getItem('db_'+name));
                if(user && user.pass === pass) {
                    me = user;
                    localStorage.setItem('g_user', JSON.stringify(me));
                    location.reload();
                } else alert("Ошибка!");
            }
        }

        function openModal(title, f2, cb) {
            document.getElementById('modal-overlay').style.display = 'flex';
            document.getElementById('modal-title').innerText = title;
            document.getElementById('modal-i1').value = '';
            document.getElementById('modal-i1').placeholder = f2 ? "Имя" : "Название";
            const i2 = document.getElementById('modal-i2');
            i2.style.display = f2 ? 'block' : 'none';
            i2.value = ''; i2.placeholder = "ID";
            document.getElementById('modal-ok').onclick = () => {
                cb(document.getElementById('modal-i1').value, i2.value);
                closeModal();
            };
        }
        function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

        function askGroup() {
            openModal("Создать группу", false, (name) => {
                if(!name) return;
                const r = 'grp_'+Date.now();
                myChats.push({name, room: r, type:'group', admin: me.id});
                save(); switchRoom(r);
            });
        }

        function askFriend() {
            openModal("Добавить друга", true, (name, id) => {
                if(!name || !id) return;
                const r = [me.id, parseInt(id)].sort().join('-');
                if(!myChats.find(c => c.room === r)) {
                    myChats.push({name, room: r, type:'private'});
                    save();
                }
                switchRoom(r);
            });
        }

        function save() { localStorage.setItem('g_chats', JSON.stringify(myChats)); updateUI(); }

        function switchRoom(room) {
            curRoom = room;
            const c = myChats.find(x => x.room === room);
            document.getElementById('chat-title').innerText = c ? c.name : "G-chat";
            document.getElementById('messages').innerHTML = '';
            
            const addBtn = document.getElementById('add-btn');
            if(c && c.type === 'group' && c.admin === me.id) {
                addBtn.style.display = 'block';
                addBtn.onclick = () => {
                    openModal("Пригласить по ID", false, (id) => {
                        if(id) socket.emit('invite_to_group', {toId: parseInt(id), room: c.room, groupName: c.name});
                    });
                };
            } else addBtn.style.display = 'none';

            socket.emit('join_room', room);
            updateUI();
            document.getElementById('sidebar').classList.remove('open');
        }

        function renderMsg(m) {
            if(document.getElementById('m-'+m.id)) return;
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId == me.id ? 'me' : 'them');
            d.id = 'm-' + m.id;
            
            let html = m.content;
            if(m.type === 'voice') html = \`<audio src="\${m.content}" controls style="width:160px; height:35px;"></audio>\`;
            if(m.type === 'file') html = \`<a href="\${m.content}" download="\${m.fileName}" style="color:#fff; text-decoration:underline;">📄 \${m.fileName}</a>\`;
            
            const del = m.userId == me.id ? \`<span class="del-msg" onclick="deleteMsg('\${m.id}')">✕</span>\` : '';
            d.innerHTML = \`<div class="msg-meta"><b>\${m.userName} (ID:\${m.userId})</b>\${del}</div><div>\${html}</div>\`;
            box.appendChild(d);
            box.scrollTop = box.scrollHeight;
        }

        function deleteMsg(id) { socket.emit('delete_msg', {id, room: curRoom}); }
        socket.on('msg_deleted', id => { const el = document.getElementById('m-'+id); if(el) el.remove(); });
        socket.on('new_msg', m => { if(m.room === curRoom) renderMsg(m); });
        socket.on('load_history', h => h.forEach(renderMsg));

        function sendText() {
            const i = document.getElementById('msg-in');
            if(i.value && curRoom) {
                socket.emit('send_msg', { room: curRoom, userId: me.id, userName: me.name, type:'text', content: i.value });
                i.value = '';
            }
        }

        async function startVoice() {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recorder = new MediaRecorder(stream);
            chunks = []; isCancel = false;
            document.getElementById('voice-ui').style.display = 'flex';
            document.getElementById('mic-btn').style.display = 'none';
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = () => {
                if(!isCancel && chunks.length > 0) {
                    const blob = new Blob(chunks, { type: 'audio/ogg' });
                    const r = new FileReader();
                    r.onload = () => socket.emit('send_msg', { room: curRoom, userId: me.id, userName: me.name, type:'voice', content: r.result });
                    r.readAsDataURL(blob);
                }
                document.getElementById('voice-ui').style.display = 'none';
                document.getElementById('mic-btn').style.display = 'flex';
            };
            recorder.start();
        }
        function stopVoice() { recorder.stop(); }
        function cancelVoice() { isCancel = true; recorder.stop(); }

        function uploadFile() {
            const f = document.getElementById('file-in').files[0];
            const r = new FileReader();
            r.onload = () => socket.emit('send_msg', { room: curRoom, userId: me.id, userName: me.name, type:'file', content: r.result, fileName: f.name });
            r.readAsDataURL(f);
        }

        function updateUI() {
            document.getElementById('my-name').innerText = me.name;
            document.getElementById('my-id').innerText = "ID: " + me.id;
            const l = document.getElementById('rooms-list'); l.innerHTML = '';
            myChats.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (curRoom === c.room ? ' active' : '');
                d.onclick = () => switchRoom(c.room);
                d.innerHTML = \`<b>\${c.name}</b>\`;
                l.appendChild(d);
            });
        }

        socket.on('group_invite', d => {
            if(!myChats.find(c => c.room === d.room)) {
                if(confirm("Вас добавили в группу: " + d.name)) {
                    myChats.push({name: d.name, room: d.room, type: 'group', admin: d.adminId});
                    save();
                }
            }
        });

        function init() {
            socket.emit('register_me', me.id);
            updateUI();
        }
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
