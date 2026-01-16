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
        const roomHistory = serverHistory.filter(m => m.room === room);
        socket.emit('load_history', roomHistory);
    });

    socket.on('send_msg', (data) => {
        const msg = { id: Date.now() + Math.random(), ...data };
        serverHistory.push(msg);
        if (serverHistory.length > 1000) serverHistory.shift();
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
        body { font-family: sans-serif; background: var(--bg); color: var(--text); height: 100dvh; display: flex; overflow: hidden; }
        
        #auth-screen { position: fixed; inset: 0; background: var(--bg); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .ui-box { background: var(--panel); padding: 25px; border-radius: 20px; width: 100%; max-width: 320px; border: 1px solid #222; box-shadow: 0 10px 30px #000; }
        input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 12px; border-radius: 12px; margin-bottom: 12px; font-size: 14px; }
        
        #sidebar { width: 250px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid var(--accent); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 8px; background: #161b22; border-radius: 12px; cursor: pointer; border: 1px solid transparent; }
        .room-btn.active { border-color: var(--accent); background: rgba(109, 40, 217, 0.1); }

        #chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .top-bar { height: 60px; padding: 0 20px; background: var(--panel); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 8px; }
        
        .msg { max-width: 85%; padding: 10px 15px; border-radius: 18px; font-size: 14px; position: relative; }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 2px; }
        .msg.them { align-self: flex-start; background: #1e293b; border-bottom-left-radius: 2px; }
        .msg-meta { font-size: 10px; opacity: 0.5; margin-bottom: 4px; display: flex; justify-content: space-between; }
        .del-msg { color: var(--danger); cursor: pointer; padding: 0 5px; font-weight: bold; }

        #input-zone { padding: 15px; background: var(--panel); display: flex; align-items: center; gap: 10px; border-top: 1px solid #1e293b; }
        #msg-in { flex: 1; margin-bottom: 0; border-radius: 25px; }
        
        .btn { background: var(--accent); border: none; color: white; padding: 12px 20px; border-radius: 12px; font-weight: bold; cursor: pointer; }
        .btn:disabled { opacity: 0.5; }
        
        @media (max-width: 768px) { #sidebar { position: fixed; left: -250px; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="ui-box">
            <h2 style="text-align:center; margin-bottom:20px; color:var(--accent);">G-chat</h2>
            <input type="text" id="auth-name" placeholder="Логин">
            <input type="password" id="auth-pass" placeholder="Пароль">
            <button onclick="auth('login')" class="btn" style="width:100%; margin-bottom:10px;">Войти</button>
            <button onclick="auth('reg')" class="btn" style="width:100%; background:#222;">Регистрация</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <b id="user-display" style="font-size:18px;">...</b>
            <div id="id-display" style="font-size:12px; color:var(--accent); font-weight:bold;">ID: ...</div>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:15px; display:flex; gap:10px;">
            <button onclick="newGroup()" class="btn" style="flex:1">+ Группа</button>
            <button onclick="newFriend()" class="btn" style="flex:1; background:#222;">+ ЛС</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="document.getElementById('sidebar').classList.toggle('open')" style="background:none; border:none; color:white; font-size:24px;">☰</button>
            <b id="chat-title" style="font-size:16px;">G-chat</b>
            <button id="add-btn" class="btn" style="display:none; padding:5px 15px;">+</button>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            <button onclick="send()" class="btn">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let user = JSON.parse(localStorage.getItem('current_g_user'));
        let chats = JSON.parse(localStorage.getItem('g_chats_v2')) || [];
        let curRoom = null;

        // --- ИСПРАВЛЕННАЯ АВТОРИЗАЦИЯ ---
        function auth(type) {
            const name = document.getElementById('auth-name').value.trim();
            const pass = document.getElementById('auth-pass').value.trim();
            if(!name || !pass) return alert("Заполни все поля!");

            let accounts = JSON.parse(localStorage.getItem('G_CHAT_ACCOUNTS')) || {};

            if(type === 'reg') {
                if(accounts[name]) return alert("Это имя уже занято!");
                const id = Math.floor(1000 + Math.random() * 8999);
                accounts[name] = { name, pass, id };
                localStorage.setItem('G_CHAT_ACCOUNTS', JSON.stringify(accounts));
                alert("Аккаунт создан! Теперь нажми 'Войти'");
            } else {
                const acc = accounts[name];
                if(acc && acc.pass === pass) {
                    user = acc;
                    localStorage.setItem('current_g_user', JSON.stringify(user));
                    location.reload();
                } else {
                    alert("Ошибка: Неверный логин или пароль!");
                }
            }
        }

        if(user) {
            document.getElementById('auth-screen').style.display = 'none';
            socket.emit('register_me', user.id);
            renderUI();
        }

        function renderUI() {
            document.getElementById('user-display').innerText = user.name;
            document.getElementById('id-display').innerText = "ID: " + user.id;
            const list = document.getElementById('rooms-list');
            list.innerHTML = '';
            chats.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (curRoom === c.room ? ' active' : '');
                d.onclick = () => switchRoom(c.room);
                d.innerHTML = \`<b>\${c.name}</b>\`;
                list.appendChild(d);
            });
        }

        function switchRoom(room) {
            curRoom = room;
            const c = chats.find(x => x.room === room);
            document.getElementById('chat-title').innerText = c ? c.name : "Чат";
            document.getElementById('messages').innerHTML = '';
            
            const addBtn = document.getElementById('add-btn');
            if(c && c.type === 'group' && c.admin === user.id) {
                addBtn.style.display = 'block';
                addBtn.onclick = () => {
                    const id = prompt("Введите ID друга для приглашения:");
                    if(id) socket.emit('invite_to_group', {toId: parseInt(id), room: c.room, groupName: c.name});
                };
            } else addBtn.style.display = 'none';

            socket.emit('join_room', room);
            renderUI();
            document.getElementById('sidebar').classList.remove('open');
        }

        function send() {
            const i = document.getElementById('msg-in');
            if(i.value && curRoom) {
                socket.emit('send_msg', { room: curRoom, userId: user.id, userName: user.name, type:'text', content: i.value });
                i.value = '';
            }
        }

        socket.on('new_msg', m => {
            if(m.room !== curRoom) return;
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId == user.id ? 'me' : 'them');
            d.id = 'm-' + m.id;
            const del = m.userId == user.id ? \`<span class="del-msg" onclick="deleteMsg('\${m.id}')">✕</span>\` : '';
            d.innerHTML = \`<div class="msg-meta"><b>\${m.userName}</b>\${del}</div><div>\${m.content}</div>\`;
            box.appendChild(d);
            box.scrollTop = box.scrollHeight;
        });

        function deleteMsg(id) { socket.emit('delete_msg', {id, room: curRoom}); }
        socket.on('msg_deleted', id => { const el = document.getElementById('m-'+id); if(el) el.remove(); });
        socket.on('load_history', h => h.forEach(m => {
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId == user.id ? 'me' : 'them');
            d.id = 'm-' + m.id;
            const del = m.userId == user.id ? \`<span class="del-msg" onclick="deleteMsg('\${m.id}')">✕</span>\` : '';
            d.innerHTML = \`<div class="msg-meta"><b>\${m.userName}</b>\${del}</div><div>\${m.content}</div>\`;
            box.appendChild(d);
            box.scrollTop = box.scrollHeight;
        }));

        function newGroup() {
            const name = prompt("Название группы:");
            if(name) {
                const room = 'grp_' + Date.now();
                chats.push({name, room, type:'group', admin: user.id});
                localStorage.setItem('g_chats_v2', JSON.stringify(chats));
                switchRoom(room);
            }
        }

        function newFriend() {
            const name = prompt("Имя друга:");
            const id = prompt("ID друга:");
            if(name && id) {
                const room = [user.id, parseInt(id)].sort().join('-');
                if(!chats.find(c => c.room === room)) {
                    chats.push({name, room, type:'private'});
                    localStorage.setItem('g_chats_v2', JSON.stringify(chats));
                }
                switchRoom(room);
            }
        }

        socket.on('group_invite', d => {
            if(confirm("Приглашение в группу: " + d.name)) {
                chats.push({name: d.name, room: d.room, type: 'group', admin: d.adminId});
                localStorage.setItem('g_chats_v2', JSON.stringify(chats));
                renderUI();
            }
        });
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
