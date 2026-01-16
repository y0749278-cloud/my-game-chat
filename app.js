const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs'); // Для записи в файл
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

const DB_FILE = './accounts.json';
let serverAccounts = {};
let serverHistory = [];

// Загрузка базы из файла при старте
if (fs.existsSync(DB_FILE)) {
    try {
        serverAccounts = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) { serverAccounts = {}; }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(serverAccounts, null, 2));
}

io.on('connection', (socket) => {
    socket.on('server_register', (data) => {
        if (serverAccounts[data.name]) {
            socket.emit('auth_error', 'Имя уже занято!');
        } else {
            const newUser = { name: data.name, pass: data.pass, id: Math.floor(1000 + Math.random() * 8999) };
            serverAccounts[data.name] = newUser;
            saveDB(); // Сохраняем в файл
            socket.emit('auth_success', newUser);
        }
    });

    socket.on('server_login', (data) => {
        const acc = serverAccounts[data.name];
        if (acc && acc.pass === data.pass) {
            socket.emit('auth_success', acc);
        } else {
            socket.emit('auth_error', 'Неверный логин или пароль!');
        }
    });

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
        if (serverHistory.length > 500) serverHistory.shift();
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
        
        /* ФИКС ПЕРЕЗАГРУЗКИ ПРИ СКРОЛЛЕ */
        body, html { 
            overscroll-behavior-y: contain; 
            background: var(--bg); 
            color: var(--text); 
            height: 100%; 
            overflow: hidden; 
        }
        
        body { font-family: 'Segoe UI', sans-serif; display: flex; }
        
        #auth-screen, .modal-overlay { position: fixed; inset: 0; background: rgba(7, 8, 12, 0.95); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); padding: 20px; }
        .glass-box { background: var(--panel); padding: 30px; border-radius: 24px; width: 100%; max-width: 320px; border: 1px solid rgba(255,255,255,0.1); text-align: center; }
        input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 14px; border-radius: 14px; margin-bottom: 12px; }

        #sidebar { width: 260px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid var(--accent); }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border-radius: 16px; cursor: pointer; border: 1px solid transparent; }
        .room-btn.active { background: rgba(124, 58, 237, 0.2); border-color: var(--accent); }

        #chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #07080c; position: relative; }
        .top-bar { height: 65px; padding: 0 20px; background: var(--panel); border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; }
        
        /* СКРОЛЛ ЧАТА БЕЗ ПЕРЕЗАГРУЗОК */
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; overscroll-behavior-y: contain; }
        
        .msg { max-width: 80%; padding: 12px 16px; border-radius: 20px; font-size: 14px; position: relative; word-wrap: break-word; }
        .msg.me { align-self: flex-end; background: var(--accent); border-bottom-right-radius: 4px; }
        .msg.them { align-self: flex-start; background: #1e293b; border-bottom-left-radius: 4px; }
        .del-btn { color: var(--danger); cursor: pointer; margin-left: 8px; font-weight: bold; }

        #input-zone { padding: 15px; background: var(--panel); display: flex; gap: 12px; align-items: center; border-top: 1px solid #1e293b; }
        #msg-in { flex: 1; border-radius: 30px; height: 42px; padding: 0 15px; background: #000; border: 1px solid #333; color: #fff; }
        .btn { background: var(--accent); border: none; color: white; padding: 10px 18px; border-radius: 14px; font-weight: bold; cursor: pointer; }
        .icon-btn { font-size: 22px; cursor: pointer; color: #888; padding: 5px; }
        
        .rec-active { display: none; background: #000; padding: 5px 15px; border-radius: 20px; gap: 15px; color: #fff; align-items: center; }

        @media (max-width: 768px) { #sidebar { position: fixed; left: -260px; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>

    <div id="auth-screen">
        <div class="glass-box">
            <h2 style="color:var(--accent); margin-bottom:20px;">G-CHAT</h2>
            <input type="text" id="a-name" placeholder="Логин">
            <input type="password" id="a-pass" placeholder="Пароль">
            <button onclick="handleAuth('login')" class="btn" style="width:100%; margin-bottom:10px;">ВОЙТИ</button>
            <button onclick="handleAuth('reg')" class="btn" style="width:100%; background:#222;">РЕГИСТРАЦИЯ</button>
        </div>
    </div>

    <div id="modal-overlay" class="modal-overlay" style="display:none;">
        <div class="glass-box">
            <b id="m-title" style="display:block; margin-bottom:15px;"></b>
            <input type="text" id="m-i1" placeholder="Имя">
            <input type="text" id="m-i2" placeholder="ID друга" style="display:none;">
            <div style="display:flex; gap:10px; justify-content:center;">
                <button onclick="closeM()" class="btn" style="background:#333;">Отмена</button>
                <button id="m-ok" class="btn">ОК</button>
            </div>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <b id="u-name">...</b><br>
            <span id="u-id" style="color:var(--accent); font-size:12px; font-weight:bold;"></span>
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
            <span class="icon-btn" onclick="document.getElementById('file-in').click()">📎</span>
            <input type="file" id="file-in" hidden onchange="upFile()">
            <input type="text" id="msg-in" placeholder="Сообщение..." autocomplete="off">
            
            <div id="rec-ui" class="rec-active">
                <span id="btn-cancel" style="color:var(--danger); cursor:pointer;">🗑️</span>
                <span id="btn-stop" style="color:#22c55e; cursor:pointer;">🛑 Отправить</span>
            </div>
            
            <span id="mic-btn" class="icon-btn">🎤</span>
            <button onclick="send()" class="btn">➤</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let user = JSON.parse(localStorage.getItem('g_u_saved'));
        let chats = JSON.parse(localStorage.getItem('g_c_saved')) || [];
        let curRoom = null;
        let recorder, chunks = [];

        function handleAuth(type) {
            const name = document.getElementById('a-name').value.trim();
            const pass = document.getElementById('a-pass').value.trim();
            if(!name || !pass) return;
            socket.emit(type === 'reg' ? 'server_register' : 'server_login', {name, pass});
        }

        socket.on('auth_success', (acc) => {
            user = acc;
            localStorage.setItem('g_u_saved', JSON.stringify(user));
            document.getElementById('auth-screen').style.display='none';
            socket.emit('register_me', user.id);
            upd();
        });

        socket.on('auth_error', (msg) => alert(msg));

        if(user) {
            document.getElementById('auth-screen').style.display='none';
            socket.emit('register_me', user.id);
            upd();
        }

        // --- МОБИЛЬНЫЙ МИКРОФОН (ФИКС) ---
        const micBtn = document.getElementById('mic-btn');
        micBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRec(); });
        micBtn.addEventListener('click', () => { if(!recorder) startRec(); }); // Для ПК

        document.getElementById('btn-stop').onclick = () => stopRec(false);
        document.getElementById('btn-cancel').onclick = () => stopRec(true);

        async function startRec() {
            try {
                const s = await navigator.mediaDevices.getUserMedia({audio:true});
                recorder = new MediaRecorder(s);
                chunks = [];
                document.getElementById('rec-ui').style.display='flex';
                micBtn.style.display='none';
                recorder.ondataavailable = e => chunks.push(e.data);
                recorder.onstop = () => {
                    if(chunks.length > 0) {
                        const blob = new Blob(chunks, {type:'audio/ogg'});
                        const r = new FileReader();
                        r.onload = () => {
                            const c = chats.find(x=>x.room===curRoom);
                            socket.emit('send_msg', {
                                room:curRoom, userId:user.id, userName:user.name, 
                                content:r.result, type:'voice', isPrivate: c.type==='private', toId: c.tid
                            });
                        };
                        r.readAsDataURL(blob);
                    }
                    document.getElementById('rec-ui').style.display='none';
                    micBtn.style.display='block';
                    recorder = null;
                };
                recorder.start();
            } catch(e) { alert("Ошибка микрофона: " + e); }
        }
        function stopRec(cancel) { if(cancel) chunks = []; recorder.stop(); }

        // --- ОСТАЛЬНОЕ ---
        function openM(t, f) {
            document.getElementById('modal-overlay').style.display='flex';
            document.getElementById('m-title').innerText = t;
            document.getElementById('m-i1').value = '';
            document.getElementById('m-i2').style.display = f===2?'block':'none';
            document.getElementById('m-i2').value = '';
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
        function save(r) { localStorage.setItem('g_c_saved', JSON.stringify(chats)); switchR(r); }

        function switchR(r) {
            curRoom = r;
            const c = chats.find(x=>x.room===r);
            document.getElementById('c-title').innerText = c?c.name:'Чат';
            document.getElementById('messages').innerHTML = '';
            const ab = document.getElementById('add-btn');
            if(c && c.type==='group' && c.admin===user.id) {
                ab.style.display='block';
                ab.onclick = () => {
                    const id = prompt("ID друга?");
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
                const d = { room:curRoom, userId:user.id, userName:user.name, content:i.value, type:'text' };
                if(c.type==='private') { d.isPrivate=true; d.toId=c.tid; }
                socket.emit('send_msg', d);
                i.value = '';
            }
        }

        function upFile() {
            const f = document.getElementById('file-in').files[0];
            const r = new FileReader();
            r.onload = () => {
                const c = chats.find(x=>x.room===curRoom);
                socket.emit('send_msg', {
                    room:curRoom, userId:user.id, userName:user.name, 
                    content:r.result, type:'file', fileName:f.name, isPrivate: c.type==='private', toId: c.tid
                });
            };
            r.readAsDataURL(f);
        }

        socket.on('new_msg', m => { if(m.room===curRoom) render(m); });
        socket.on('load_history', h => h.forEach(render));

        function render(m) {
            if(document.getElementById('m-'+m.id)) return;
            const b = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId==user.id?'me':'them');
            d.id = 'm-'+m.id;
            let html = m.content;
            if(m.type==='voice') html = '<audio src="'+m.content+'" controls style="max-width:200px; height:35px;"></audio>';
            if(m.type==='file') {
                if(m.content.startsWith('data:image')) html = '<img src="'+m.content+'" style="max-width:100%; border-radius:10px;">';
                else html = '<a href="'+m.content+'" download="'+m.fileName+'" style="color:#fff">📄 '+m.fileName+'</a>';
            }
            const del = m.userId==user.id ? '<span class="del-btn" onclick="delM(\\''+m.id+'\\')">✕</span>' : '';
            d.innerHTML = '<div style="font-size:10px; opacity:0.6"><b>'+m.userName+'</b>'+del+'</div>' + html;
            b.appendChild(d);
            b.scrollTop = b.scrollHeight;
        }
        function delM(id) { socket.emit('delete_msg', {id, room:curRoom}); }
        socket.on('msg_deleted', id => { const e = document.getElementById('m-'+id); if(e) e.remove(); });
        
        socket.on('private_request', d => {
            const r = [user.id, d.fromId].sort().join('_');
            if(!chats.find(x=>x.room===r)) {
                chats.push({name:d.fromName, room:r, type:'private', tid:d.fromId});
                localStorage.setItem('g_c_saved', JSON.stringify(chats));
                upd();
            }
        });

        socket.on('group_invite', d => {
            if(!chats.find(x=>x.room===d.room)) {
                if(confirm("Приглашение в группу "+d.name)) {
                    chats.push({name:d.name, room:d.room, type:'group', admin:d.adminId});
                    localStorage.setItem('g_c_saved', JSON.stringify(chats));
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
