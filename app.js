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
        * { box-sizing: border-box; outline: none; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); height: 100dvh; display: flex; overflow: hidden; }
        
        #auth-screen, .modal-overlay { position: fixed; inset: 0; background: rgba(7, 8, 12, 0.95); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); padding: 20px; }
        .glass-box { background: var(--panel); padding: 30px; border-radius: 24px; width: 100%; max-width: 320px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 40px rgba(0,0,0,0.6); text-align: center; }
        h2 { color: var(--accent); margin-bottom: 25px; font-size: 28px; letter-spacing: 2px; }
        input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 14px; border-radius: 14px; margin-bottom: 12px; font-size: 15px; }

        #sidebar { width: 260px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid rgba(124, 58, 237, 0.3); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border-radius: 16px; cursor: pointer; }
        .room-btn.active { background: rgba(124, 58, 237, 0.2); border: 1px solid var(--accent); }

        #chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #07080c; }
        .top-bar { height: 65px; padding: 0 20px; background: var(--panel); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        
        .msg { max-width: 80%; padding: 12px 16px; border-radius: 20px; font-size: 14px; position: relative; }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 4px; }
        .msg.them { align-self: flex-start; background: #1e293b; border-bottom-left-radius: 4px; }
        .del-btn { color: var(--danger); cursor: pointer; margin-left: 8px; font-weight: bold; }

        #input-zone { padding: 15px; background: var(--panel); display: flex; gap: 12px; border-top: 1px solid #1e293b; }
        #msg-in { flex: 1; margin-bottom: 0; border-radius: 30px; }
        .btn { background: var(--accent); border: none; color: white; padding: 12px 22px; border-radius: 14px; font-weight: bold; cursor: pointer; }

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
            <b id="m-title" style="display:block; margin-bottom:15px;"></b>
            <input type="text" id="m-i1" placeholder="Имя">
            <input type="text" id="m-i2" placeholder="ID (для ЛС)" style="display:none;">
            <div style="display:flex; gap:10px; justify-content:center;">
                <button onclick="closeM()" class="btn" style="background:#333;">Отмена</button>
                <button id="m-ok" class="btn">ОК</button>
            </div>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <b id="u-name">...</b><br>
            <span id="u-id" style="color:var(--accent); font-size:12px;"></span>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:15px; display:flex; gap:8px;">
            <button onclick="openM('Группа', 1)" class="btn" style="flex:1; font-size:11px;">+ГРУППА</button>
            <button onclick="openM('Личка', 2)" class="btn" style="flex:1; font-size:11px; background:#222;">+ЛС</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <button onclick="document.getElementById('sidebar').classList.toggle('open')" style="background:none; border:none; color:white; font-size:24px;">☰</button>
            <b id="c-title">G-chat</b>
            <button id="add-btn" class="btn" style="display:none; padding:5px 12px;">+</button>
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
        let user = JSON.parse(localStorage.getItem('g_u_v6'));
        let chats = JSON.parse(localStorage.getItem('g_c_v6')) || [];
        let curRoom = null;

        function auth(t) {
            const n = document.getElementById('a-name').value.trim();
            const p = document.getElementById('a-pass').value.trim();
            if(!n || !p) return;
            let db = JSON.parse(localStorage.getItem('G_ACC_DB')) || {};
            if(t === 'reg') {
                if(db[n]) return alert("Занято");
                db[n] = { name:n, pass:p, id: Math.floor(1000+Math.random()*8999) };
                localStorage.setItem('G_ACC_DB', JSON.stringify(db));
                alert("Создано!");
            } else {
                if(db[n] && db[n].pass === p) {
                    user = db[n];
                    localStorage.setItem('g_u_v6', JSON.stringify(user));
                    location.reload();
                } else alert("Ошибка");
            }
        }

        if(user) {
            document.getElementById('auth-screen').style.display='none';
            socket.emit('register_me', user.id);
            upd();
        }

        function openM(t, f) {
            document.getElementById('modal-overlay').style.display='flex';
            document.getElementById('m-title').innerText = t;
            document.getElementById('m-i2').style.display = f===2?'block':'none';
            document.getElementById('m-ok').onclick = () => {
                const n1 = document.getElementById('m-i1').value;
                const n2 = document.getElementById('m-i2').value;
                if(f===1 && n1) {
                    const r = 'grp_'+Date.now();
                    chats.push({name:n1, room:r, type:'group', admin:user.id});
                    save(r);
                } else if(f===2 && n1 && n2) {
                    const r = [user.id, parseInt(n2)].sort().join('_');
                    if(!chats.find(x=>x.room===r)) chats.push({name:n1, room:r, type:'private', tid:parseInt(n2)});
                    save(r);
                }
                closeM();
            };
        }
        function closeM() { document.getElementById('modal-overlay').style.display='none'; }
        function save(r) { localStorage.setItem('g_c_v6', JSON.stringify(chats)); switchR(r); }

        function switchR(r) {
            curRoom = r;
            const c = chats.find(x=>x.room===r);
            document.getElementById('c-title').innerText = c?c.name:'Чат';
            document.getElementById('messages').innerHTML = '';
            const ab = document.getElementById('add-btn');
            if(c && c.type==='group' && c.admin===user.id) {
                ab.style.display='block';
                ab.onclick = () => {
                    const id = prompt("ID?");
                    if(id) socket.emit('invite_to_group', {toId:parseInt(id), room:c.room, groupName:c.name});
                };
            } else ab.style.display='none';
            socket.emit('join_room', r);
            upd();
            document.getElementById('sidebar').classList.remove('open');
        }

        function upd() {
            if(!user) return;
            document.getElementById('u-name').innerText = user.name;
            document.getElementById('u-id').innerText = "ID: "+user.id;
            const l = document.getElementById('rooms-list');
            l.innerHTML = '';
            chats.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (curRoom===c.room?' active':'');
                d.onclick = () => switchR(c.room);
                d.innerHTML = '<b>' + c.name + '</b>';
                l.appendChild(d);
            });
        }

        function send() {
            const i = document.getElementById('msg-in');
            const c = chats.find(x=>x.room===curRoom);
            if(i.value && curRoom) {
                const d = { room:curRoom, userId:user.id, userName:user.name, content:i.value };
                if(c.type==='private') { d.isPrivate=true; d.toId=c.tid; }
                socket.emit('send_msg', d);
                i.value = '';
            }
        }

        socket.on('new_msg', m => { if(m.room===curRoom) render(m); });
        socket.on('load_history', h => h.forEach(render));
        function render(m) {
            if(document.getElementById('m-'+m.id)) return;
            const b = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId==user.id?'me':'them');
            d.id = 'm-'+m.id;
            const del = m.userId==user.id ? '<span class="del-btn" onclick="delM(\\''+m.id+'\\')">✕</span>' : '';
            d.innerHTML = '<div style="font-size:10px; opacity:0.6"><b>'+m.userName+'</b>'+del+'</div>' + m.content;
            b.appendChild(d);
            b.scrollTop = b.scrollHeight;
        }
        function delM(id) { socket.emit('delete_msg', {id, room:curRoom}); }
        socket.on('msg_deleted', id => { const e = document.getElementById('m-'+id); if(e) e.remove(); });
        
        socket.on('private_request', d => {
            const r = [user.id, d.fromId].sort().join('_');
            if(!chats.find(x=>x.room===r)) {
                chats.push({name:d.fromName, room:r, type:'private', tid:d.fromId});
                localStorage.setItem('g_c_v6', JSON.stringify(chats));
                upd();
            }
        });

        socket.on('group_invite', d => {
            if(!chats.find(x=>x.room===d.room)) {
                if(confirm("В группу "+d.name+"?")) {
                    chats.push({name:d.name, room:d.room, type:'group', admin:d.adminId});
                    localStorage.setItem('g_c_v6', JSON.stringify(chats));
                    upd();
                }
            }
        });
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
