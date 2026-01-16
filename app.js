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
        socket.emit('load_history', serverHistory.filter(m => m.room === room));
    });

    socket.on('send_msg', (data) => {
        const msg = { id: Date.now() + Math.random(), ...data };
        serverHistory.push(msg);
        if (serverHistory.length > 1000) serverHistory.shift();
        io.to(data.room).emit('new_msg', msg);
        // Если это ЛС, отправляем уведомление получателю, чтобы у него тоже создался чат
        if(data.isPrivate) {
            io.to("user-" + data.toId).emit('private_request', {
                fromName: data.userName, fromId: data.userId, room: data.room
            });
        }
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
    <title>G-chat Premium</title>
    <style>
        :root { --bg: #0b0e14; --panel: #151921; --accent: #7c3aed; --text: #ffffff; --danger: #ef4444; }
        * { box-sizing: border-box; outline: none; -webkit-tap-highlight-color: transparent; }
        body { font-family: 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); height: 100dvh; margin: 0; display: flex; overflow: hidden; }
        
        /* КРАСИВЫЙ UI / AUTH */
        #auth-screen, .modal-overlay { position: fixed; inset: 0; background: rgba(7, 8, 12, 0.95); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); padding: 20px; }
        .glass-box { background: var(--panel); padding: 30px; border-radius: 24px; width: 100%; max-width: 320px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 40px rgba(0,0,0,0.6); text-align: center; }
        h2 { color: var(--accent); margin-bottom: 25px; font-size: 28px; letter-spacing: 2px; }
        input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 14px; border-radius: 14px; margin-bottom: 12px; font-size: 15px; transition: 0.3s; }
        input:focus { border-color: var(--accent); box-shadow: 0 0 10px rgba(124, 58, 237, 0.3); }

        /* SIDEBAR */
        #sidebar { width: 260px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid rgba(124, 58, 237, 0.3); background: linear-gradient(to bottom, rgba(124, 58, 237, 0.1), transparent); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border-radius: 16px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
        .room-btn.active { background: rgba(124, 58, 237, 0.2); border-color: var(--accent); }
        .room-btn b { font-size: 14px; }

        /* CHAT AREA */
        #chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #07080c; }
        .top-bar { height: 65px; padding: 0 20px; background: var(--panel); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        
        .msg { max-width: 80%; padding: 12px 16px; border-radius: 20px; font-size: 14px; line-height: 1.4; animation: pop 0.3s ease; }
        @keyframes pop { from { opacity:0; transform: scale(0.9); } }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 4px; box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3); }
        .msg.them { align-self: flex-start; background: #1e293b; border-bottom-left-radius: 4px; }
        .msg-meta { font-size: 10px; opacity: 0.6; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center; }
        .del-btn { color: #ff4d4d; cursor: pointer; font-weight: bold; padding: 0 5px; }

        /* INPUT */
        #input-zone { padding: 15px; background: var(--panel); display: flex; align-items: center; gap: 12px; border-top: 1px solid #1e293b; }
        #msg-in { margin-bottom: 0; border-radius: 30px; padding: 12px 20px; }
        
        .btn { background: var(--accent); border: none; color: white; padding: 12px 22px; border-radius: 14px; font-weight: bold; cursor: pointer; transition: 0.3s; }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn:active { transform: translateY(0); }

        @media (max-width: 768px) { #sidebar { position: fixed; left: -260px; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="glass-box">
            <h2>G-CHAT</h2>
            <input type="text" id="a-name" placeholder="Логин">
            <input type="password" id="a-pass" placeholder="Пароль">
            <button onclick="auth('login')" class="btn" style="width:100%; margin-bottom:12px;">ВОЙТИ</button>
            <button onclick="auth('reg')" class="btn" style="width:100%; background:#222;">РЕГИСТРАЦИЯ</button>
        </div>
    </div>

    <div id="modal-overlay" class="modal-overlay" style="display:none;">
        <div class="glass-box">
            <b id="m-title" style="display:block; margin-bottom:15px; font-size:18px;"></b>
            <input type="text" id="m-i1" placeholder="Имя">
            <input type="text" id="m-i2" placeholder="ID (только для ЛС)" style="display:none;">
            <div style="display:flex; gap:10px; justify-content:center;">
                <button onclick="closeM()" class="btn" style="background:#333;">Отмена</button>
                <button id="m-ok" class="btn">Создать</button>
            </div>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <b id="u-name" style="font-size:18px; display:block;">...</b>
            <span id="u-id" style="font-size:12px; color:var(--accent); font-weight:bold;">ID: ...</span>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:15px; display:flex; gap:8px;">
            <button onclick="openM('Группа', 1)" class="btn" style="flex:1; font-size:12px;">+ ГРУППА</button>
            <button onclick="openM('Личный чат', 2)" class="btn" style="flex:1; font-size:12px; background:#222;">+ ЛС</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="document.getElementById('sidebar').classList.toggle('open')" style="background:none; border:none; color:white; font-size:26px;">☰</button>
            <b id="c-title">Выберите чат</b>
            <button id="add-btn" class="btn" style="display:none; padding:5px 15px;">+</button>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <input type="text" id="msg-in" placeholder="Введите сообщение..." autocomplete="off">
            <button onclick="send()" class="btn">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let user = JSON.parse(localStorage.getItem('g_user_v5'));
        let chats = JSON.parse(localStorage.getItem('g_chats_v5')) || [];
        let curRoom = null;

        function auth(type) {
            const name = document.getElementById('a-name').value.trim();
            const pass = document.getElementById('a-pass').value.trim();
            if(!name || !pass) return alert("Заполни поля!");

            let db = JSON.parse(localStorage.getItem('G_ACCOUNTS')) || {};
            if(type === 'reg') {
                if(db[name]) return alert("Имя занято!");
                const id = Math.floor(1000 + Math.random() * 8999);
                db[name] = { name, pass, id };
                localStorage.setItem('G_ACCOUNTS', JSON.stringify(db));
                alert("Успех! Теперь жми Войти");
            } else {
                const acc = db[name];
                if(acc && acc.pass === pass) {
                    user = acc;
                    localStorage.setItem('g_user_v5', JSON.stringify(user));
                    location.reload();
                } else alert("Неверно!");
            }
        }

        if(user) {
            document.getElementById('auth-screen').style.display = 'none';
            socket.emit('register_me', user.id);
            updateUI();
        }

        function openM(title, fields) {
            document.getElementById('modal-overlay').style.display = 'flex';
            document.getElementById('m-title').innerText = title;
            document.getElementById('m-i1').value = '';
            document.getElementById('m-i2').style.display = fields === 2 ? 'block' : 'none';
            document.getElementById('m-i2').value = '';
            document.getElementById('m-ok').onclick = () => {
                const n = document.getElementById('m-i1').value;
                const id = document.getElementById('m-i2').value;
                if(fields === 1 && n) createGroup(n);
                if(fields === 2 && n && id) createPrivate(n, id);
                closeM();
            };
        }
        function closeM() { document.getElementById('modal-overlay').style.display = 'none'; }

        function createGroup(name) {
            const room = 'grp_' + Date.now();
            chats.push({name, room, type:'group', admin: user.id});
            save(); switchRoom(room);
        }

        function createPrivate(name, id) {
            const targetId = parseInt(id);
            const room = [user.id, targetId].sort().join('_');
            if(!chats.find(c => c.room === room)) {
                chats.push({name, room, type:'private', targetId});
                save();
            }
            switchRoom(room);
        }

        function save() { localStorage.setItem('g_chats_v5', JSON.stringify(chats)); updateUI(); }

        function switchRoom(room) {
            curRoom = room;
            const c = chats.find(x => x.room === room);
            document.getElementById('c-title').innerText = c ? c.name : "Чат";
            document.getElementById('messages').innerHTML = '';
            
            const addBtn = document.getElementById('add-btn');
            if(c && c.type === 'group' && c.admin === user.id) {
                addBtn.style.display = 'block';
                addBtn.onclick = () => {
                    const id = prompt("Введите ID игрока:");
                    if(id) socket.emit('invite_to_group', {toId: parseInt(id), room: c.room, groupName: c.name});
                };
            } else addBtn.style.display = 'none';

            socket.emit('join_room', room);
            updateUI();
            document.getElementById('sidebar').classList.remove('open');
        }

        function send() {
            const i = document.getElementById('msg-in');
            const c = chats.find(x => x.room === curRoom);
            if(i.value && curRoom) {
                const data = {
                    room: curRoom, userId: user.id, userName: user.name, content: i.value
                };
                if(c.type === 'private') {
                    data.isPrivate = true;
                    data.toId = c.targetId;
                }
                socket.emit('send_msg', data);
                i.value = '';
            }
        }

        socket.on('new_msg', m => {
            if(m.room !== curRoom) return;
            renderMsg(m);
        });

        socket.on('load_history', h => h.forEach(renderMsg));

        function renderMsg(m) {
            if(document.getElementById('m-'+m.id)) return;
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId == user.id ? 'me' : 'them');
            d.id = 'm-' + m.id;
            const del = m.userId == user.id ? \`<span class="del-btn" onclick="deleteMsg('\\${m.id}')">✕</span>\` : '';
            d.innerHTML = \`<div class="msg-meta"><b>\\${m.userName}</b>\\${del}</div><div>\\${m.content}</div>\`;
            box.appendChild(d);
            box.scrollTop = box.scrollHeight;
        }

        function deleteMsg(id) { socket.emit('delete_msg', {id, room: curRoom}); }
        socket.on('msg_deleted', id => { const el = document.getElementById('m-'+id); if(el) el.remove(); });

        socket.on('private_request', d => {
            // Если нам написали в ЛС, а у нас еще нет этого чата - создаем автоматически!
            const room = [user.id, d.fromId].sort().join('_');
            if(!chats.find(c => c.room === room)) {
                chats.push({name: d.fromName, room: room, type:'private', targetId: d.fromId});
                save();
            }
        });

        socket.on('group_invite', d => {
            if(!chats.find(c => c.room === d.room)) {
                if(confirm("Приглашение в группу " + d.name)) {
                    chats.push({name: d.name, room: d.room, type: 'group', admin: d.adminId});
                    save();
                }
            }
        });

        function updateUI() {
            if(!user) return;
            document.getElementById('u-name').innerText = user.name;
            document.getElementById('u-id').innerText = "ID: " + user.id;
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
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
