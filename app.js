app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-Chat Eternal</title>
    <style>
        :root { --bg: #0b0e14; --panel: #151921; --accent: #7c3aed; --text: #ffffff; }
        * { box-sizing: border-box; outline: none; margin: 0; padding: 0; }
        body { display: flex; background: var(--bg); color: var(--text); height: 100vh; font-family: sans-serif; overflow: hidden; }
        #auth-screen { position: fixed; inset: 0; background: #07080c; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .glass-box { background: var(--panel); padding: 30px; border-radius: 28px; width: 100%; max-width: 320px; text-align: center; border: 1px solid #333; }
        input { width: 100%; background: #000; border: 1px solid #444; color: #fff; padding: 15px; border-radius: 15px; margin-bottom: 12px; }
        #sidebar { width: 260px; background: var(--panel); border-right: 1px solid #1e293b; display: flex; flex-direction: column; }
        .sidebar-header { padding: 20px; border-bottom: 2px solid var(--accent); display: flex; justify-content: space-between; align-items: center; }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        .room-btn { padding: 15px; margin-bottom: 10px; background: #1e293b; border-radius: 18px; cursor: pointer; }
        .room-btn.active { border: 1px solid var(--accent); background: #2d1b4d; }
        #chat-area { flex: 1; display: flex; flex-direction: column; background: #07080c; }
        .top-bar { height: 60px; padding: 0 20px; background: var(--panel); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 80%; padding: 12px; border-radius: 18px; position: relative; }
        .msg.me { align-self: flex-end; background: var(--accent); }
        .msg.them { align-self: flex-start; background: #1e293b; }
        #input-zone { padding: 15px; background: var(--panel); display: flex; gap: 10px; align-items: center; }
        #msg-in { flex: 1; background: #000; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 25px; }
        .btn { background: var(--accent); border: none; color: #fff; padding: 10px 20px; border-radius: 15px; font-weight: bold; cursor: pointer; }
        .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:2000; align-items:center; justify-content:center; }
    </style>
</head>
<body>
    <div id="auth-screen">
        <div class="glass-box">
            <h2 style="margin-bottom:20px; color:var(--accent)">G-CHAT</h2>
            <input type="text" id="a-name" placeholder="Логин">
            <input type="password" id="a-pass" placeholder="Пароль">
            <button onclick="auth('login')" class="btn" style="width:100%; margin-bottom:10px">ВОЙТИ</button>
            <button onclick="auth('reg')" class="btn" style="width:100%; background:#222">РЕГИСТРАЦИЯ</button>
        </div>
    </div>

    <div id="sidebar">
        <div class="sidebar-header">
            <div><b id="u-name">...</b><br><span id="u-id" style="font-size:10px"></span></div>
            <button onclick="logout()" style="background:none; border:none; cursor:pointer">🚪</button>
        </div>
        <div id="rooms-list"></div>
        <div style="padding:10px;">
            <button onclick="openM('Создать Группу', 1)" class="btn" style="width:100%">+ ГРУППА</button>
        </div>
    </div>

    <div id="chat-area">
        <div class="top-bar"><b id="c-title">Выберите чат</b></div>
        <div id="messages"></div>
        <div id="input-zone">
            <input type="text" id="msg-in" placeholder="Сообщение...">
            <button onclick="sendMsg()" class="btn">➤</button>
        </div>
    </div>

    <div id="gen-modal" class="modal">
        <div class="glass-box">
            <h3 id="m-title"></h3><br>
            <input type="text" id="m-i1" placeholder="Название">
            <button id="m-ok" class="btn" style="width:100%">ОК</button>
            <button onclick="document.getElementById('gen-modal').style.display='none'" class="btn" style="width:100%; background:#222; margin-top:10px">ОТМЕНА</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let user = null, chats = [], curRoom = null;

        function auth(type) {
            const name = document.getElementById('a-name').value;
            const pass = document.getElementById('a-pass').value;
            socket.emit('server_auth', { name, pass, type });
        }

        socket.on('auth_success', acc => {
            user = acc;
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('u-name').innerText = user.name;
            document.getElementById('u-id').innerText = "ID: " + user.id;
            socket.emit('register_me', user.id);
        });

        socket.on('sync_chats', c => { chats = c; upd(); });
        socket.on('auth_error', e => alert(e));

        function openM(t, mode) {
            document.getElementById('gen-modal').style.display='flex';
            document.getElementById('m-title').innerText = t;
            document.getElementById('m-ok').onclick = () => {
                const v = document.getElementById('m-i1').value;
                if(v) {
                    const r = 'grp_' + Date.now();
                    const c = {name: v, room: r, type: 'group'};
                    chats.push(c);
                    socket.emit('save_chat_to_server', {uid: user.id, chat: c});
                    switchR(r);
                }
                document.getElementById('gen-modal').style.display='none';
            };
        }

        function switchR(r) {
            curRoom = r;
            const c = chats.find(x => x.room === r);
            document.getElementById('c-title').innerText = c ? c.name : "Чат";
            document.getElementById('messages').innerHTML = '';
            socket.emit('join_room', r);
            upd();
        }

        function sendMsg() {
            const i = document.getElementById('msg-in');
            if(i.value && curRoom) {
                socket.emit('send_msg', { room: curRoom, userId: user.id, userName: user.name, content: i.value });
                i.value = '';
            }
        }

        socket.on('load_history', h => { h.forEach(render); });
        socket.on('new_msg', m => { if(m.room === curRoom) render(m); });

        function render(m) {
            const b = document.getElementById('messages');
            const d = document.createElement('div');
            d.className = 'msg ' + (m.userId === user.id ? 'me' : 'them');
            d.innerHTML = \`<div style="font-size:10px; opacity:0.6">\${m.userName}</div>\${m.content}\`;
            b.appendChild(d);
            b.scrollTop = b.scrollHeight;
        }

        function upd() {
            const l = document.getElementById('rooms-list');
            l.innerHTML = '';
            chats.forEach(c => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (curRoom === c.room ? ' active' : '');
                d.innerHTML = \`<b>\${c.name}</b>\`;
                d.onclick = () => switchR(c.room);
                l.appendChild(d);
            });
        }
        function logout() { location.reload(); }
    </script>
</body>
</html>
    `);
});
