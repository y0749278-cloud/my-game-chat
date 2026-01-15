const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

let messageHistory = [];
try { if (fs.existsSync('messages.json')) messageHistory = JSON.parse(fs.readFileSync('messages.json')); } catch (e) {}
function saveDB() { fs.writeFileSync('messages.json', JSON.stringify(messageHistory.slice(-2000))); }

io.on('connection', (socket) => {
    socket.on('register_me', (myId) => { 
        socket.join("user-" + myId); 
        socket.myId = myId; 
        io.emit('user_status', {id: myId, online: true}); 
    });

    socket.on('join_room', (room) => { 
        socket.join(room); 
        socket.emit('load_history', messageHistory.filter(m => m.room === room)); 
    });

    socket.on('send_msg', (data) => {
        const msg = { id: Date.now() + Math.random(), ...data };
        messageHistory.push(msg); saveDB();
        io.to(data.room).emit('new_msg', msg);
        if(data.toId) io.to("user-" + data.toId).emit('notify_new_contact', msg);
    });

    // СИГНАЛЫ ЗВОНКА
    socket.on('call_user', (data) => { io.to("user-" + data.toId).emit('incoming_call', { fromId: socket.myId, fromName: data.fromName }); });
    socket.on('accept_call', (data) => { io.to("user-" + data.toId).emit('call_accepted', { fromId: socket.myId }); });
    socket.on('decline_call', (data) => { io.to("user-" + data.toId).emit('call_declined'); });
    socket.on('cancel_call', (data) => { io.to("user-" + data.toId).emit('call_cancelled'); });
    socket.on('webrtc_signal', (data) => { io.to("user-" + data.toId).emit('webrtc_signal', { signal: data.signal }); });

    socket.on('disconnect', () => { if(socket.myId) io.emit('user_status', {id: socket.myId, online: false}); });
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>G-CHAT ELITE</title>
    <style>
        :root { --bg: #0b0e14; --panel: #161b22; --accent: #7c3aed; --mine: #6d28d9; --text: #e6edf3; }
        * { box-sizing: border-box; outline:none; -webkit-tap-highlight-color: transparent; }
        body { font-family: sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; height: 100dvh; overflow: hidden; position: fixed; width: 100vw; }
        
        #sidebar { width: 320px; background: var(--panel); border-right: 1px solid #333; display: flex; flex-direction: column; transition: 0.3s; z-index: 1000; }
        .sidebar-header { padding: 20px; background: #0d1117; border-bottom: 1px solid #333; }
        #rooms-list { flex: 1; overflow-y: auto; padding: 10px; }
        
        .room-btn { padding: 15px; margin-bottom: 8px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid #333; cursor:pointer; display:flex; justify-content:space-between; align-items:center; }
        .room-btn.active { border-color: var(--accent); background: rgba(124, 58, 237, 0.2); }
        .online-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; display: inline-block; margin-right: 5px; }

        #chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg); }
        .top-bar { padding: 10px 20px; background: var(--panel); border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between; }
        
        #messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .msg { max-width: 80%; padding: 12px; border-radius: 18px; font-size: 15px; }
        .msg.me { align-self: flex-end; background: var(--mine); }
        .msg.them { align-self: flex-start; background: var(--panel); border: 1px solid #333; }

        #input-zone { padding: 10px; background: #0d1117; display: flex; align-items: center; gap: 10px; padding-bottom: max(15px, env(safe-area-inset-bottom)); }
        #msg-in { flex: 1; background: #000; border: 1px solid #444; color: #fff; padding: 12px 18px; border-radius: 25px; }

        .modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1c2128; padding: 30px; border-radius: 20px; border: 1px solid var(--accent); z-index: 2000; text-align: center; display: none; width: 85%; }
        .modal-btn { padding: 15px; border-radius: 10px; border: none; color: white; font-weight: bold; width: 100%; margin-top: 10px; cursor: pointer; }

        @media (max-width: 768px) { #sidebar { position: fixed; left: -100%; width: 85%; height: 100%; } #sidebar.open { left: 0; } }
    </style>
</head>
<body>
    <div id="sidebar">
        <div class="sidebar-header">
            <b style="color:var(--accent); font-size: 20px;">G-CHAT ELITE</b>
            <div id="my-id-display" style="font-size:12px; opacity:0.6; margin-top:5px;"></div>
        </div>
        <div id="rooms-list"></div>
        <button onclick="addFriend()" style="margin:15px; padding:15px; background:var(--accent); border:none; color:white; border-radius:12px; font-weight:bold;">+ ДОБАВИТЬ ПО ID</button>
    </div>

    <div id="chat-area">
        <div class="top-bar">
            <div style="display:flex; align-items:center; gap:15px;">
                <button onclick="toggleMenu()" style="background:var(--accent); border:none; color:white; padding:8px 12px; border-radius:8px;">☰</button>
                <b id="chat-title">Выберите чат</b>
            </div>
            <div id="call-ui" style="display:none; font-size:24px; cursor:pointer;" onclick="startCall()">📞</div>
        </div>
        <div id="messages"></div>
        <div id="input-zone">
            <label style="font-size:24px; cursor:pointer;">📎<input type="file" id="file-in" hidden onchange="sendFile()"></label>
            <input type="text" id="msg-in" placeholder="Сообщение...">
            <div id="mic-btn" style="font-size:24px; cursor:pointer;">🎤</div>
            <button style="background:var(--accent); border:none; color:white; width:45px; height:45px; border-radius:50%;" onclick="sendTxt()">➤</button>
        </div>
    </div>

    <div id="call-modal" class="modal">
        <h3 id="call-status">Звонок...</h3>
        <div id="call-btns"></div>
    </div>

    <audio id="remote-audio" autoplay></audio>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let userData = JSON.parse(localStorage.getItem('gchat_user')) || {id: Math.floor(100000 + Math.random()*899999), name: "Я"};
        localStorage.setItem('gchat_user', JSON.stringify(userData));

        let friends = JSON.parse(localStorage.getItem('gchat_friends') || '[]');
        let currentRoom = null;
        let onlineUsers = new Set();
        let pc, localStream, partnerId;

        socket.emit('register_me', userData.id);
        document.getElementById('my-id-display').innerText = "Мой ID: " + userData.id;

        function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); }

        function renderFriends() {
            const list = document.getElementById('rooms-list'); list.innerHTML = '';
            friends.forEach(f => {
                const isOnline = onlineUsers.has(f.id);
                const d = document.createElement('div');
                d.className = 'room-btn' + (currentRoom === f.room ? ' active' : '');
                // Исправлено: клик на весь блок открывает чат
                d.onclick = (e) => { if(e.target.tagName !== 'SPAN') switchRoom(f.room); };
                d.innerHTML = \`
                    <div>\${isOnline ? '<span class="online-dot"></span>' : ''}<b>\${f.name}</b><br><small>ID: \${f.id}</small></div>
                    <span onclick="renameFriend(\${f.id})" style="padding:10px; font-size:18px;">✏️</span>\`;
                list.appendChild(d);
            });
        }

        function renameFriend(id) {
            const n = prompt("Введите новое имя:");
            if(n) {
                const f = friends.find(f => f.id === id);
                if(f) {
                    f.name = n;
                    localStorage.setItem('gchat_friends', JSON.stringify(friends));
                    if(currentRoom === f.room) document.getElementById('chat-title').innerText = n;
                    renderFriends();
                }
            }
        }

        function addFriend() {
            const id = prompt("Введите ID:"); if(!id) return;
            const name = prompt("Имя:") || "Друг #" + id;
            const room = [userData.id, parseInt(id)].sort().join('-');
            const idx = friends.findIndex(f => f.id === parseInt(id));
            if(idx === -1) friends.push({id: parseInt(id), name, room});
            localStorage.setItem('gchat_friends', JSON.stringify(friends));
            switchRoom(room);
        }

        function switchRoom(room) {
            currentRoom = room;
            const f = friends.find(f => f.room === room);
            document.getElementById('chat-title').innerText = f ? f.name : "Чат";
            document.getElementById('call-ui').style.display = 'block';
            socket.emit('join_room', room);
            renderFriends();
            if(window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
        }

        // --- ЗВОНКИ ---
        async function startCall() {
            const f = friends.find(f => f.room === currentRoom); if(!f) return;
            partnerId = f.id;
            socket.emit('call_user', {toId: f.id, fromName: userData.name});
            showCallModal("Вызов " + f.name + "...", 'outgoing');
        }

        async function initWebRTC(isOffer) {
            try {
                pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                pc.ontrack = (e) => { document.getElementById('remote-audio').srcObject = e.streams[0]; };
                pc.onicecandidate = (e) => { if(e.candidate) socket.emit('webrtc_signal', {toId: partnerId, signal: e.candidate}); };
                if(isOffer) {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('webrtc_signal', {toId: partnerId, signal: offer});
                }
            } catch(e) { alert("Ошибка микрофона: " + e.message); }
        }

        socket.on('incoming_call', (data) => {
            partnerId = data.fromId;
            showCallModal("Звонит " + data.fromName, 'incoming');
        });

        async function answerCall() {
            showCallModal("Разговор...", 'active');
            await initWebRTC(false);
            socket.emit('accept_call', {toId: partnerId});
        }

        socket.on('call_accepted', async () => {
            showCallModal("Разговор...", 'active');
            await initWebRTC(true);
        });

        socket.on('webrtc_signal', async (data) => {
            if(!pc) return;
            if(data.signal.type) await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
            else await pc.addIceCandidate(new RTCIceCandidate(data.signal));
            if(pc.remoteDescription && pc.remoteDescription.type === 'offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('webrtc_signal', {toId: partnerId, signal: answer});
            }
        });

        socket.on('call_declined', () => { alert("Отклонено"); closeCall(); });
        socket.on('call_cancelled', () => closeCall());

        function showCallModal(txt, mode) {
            document.getElementById('call-status').innerText = txt;
            const container = document.getElementById('call-btns'); container.innerHTML = '';
            if(mode === 'incoming') {
                container.innerHTML = \`<button class="modal-btn" style="background:#22c55e" onclick="answerCall()">ПРИНЯТЬ</button>
                                       <button class="modal-btn" style="background:#ef4444" onclick="socket.emit('decline_call',{toId:partnerId});closeCall()">ОТКЛОНИТЬ</button>\`;
            } else {
                container.innerHTML = \`<button class="modal-btn" style="background:#ef4444" onclick="socket.emit('cancel_call',{toId:partnerId});closeCall()">ЗАВЕРШИТЬ</button>\`;
            }
            document.getElementById('call-modal').style.display = 'block';
        }

        function closeCall() {
            if(localStream) localStream.getTracks().forEach(t => t.stop());
            if(pc) pc.close();
            document.getElementById('call-modal').style.display = 'none';
            pc = null;
        }

        // --- СООБЩЕНИЯ ---
        function sendTxt() {
            const i = document.getElementById('msg-in'); const f = friends.find(f => f.room === currentRoom);
            if(i.value && f) {
                socket.emit('send_msg', { type: 'text', content: i.value, room: currentRoom, userId: userData.id, userName: userData.name, time: new Date().toLocaleTimeString().slice(0,5), toId: f.id });
                i.value = '';
            }
        }
        socket.on('new_msg', (msg) => { if(msg.room === currentRoom) renderMsg(msg); });
        socket.on('notify_new_contact', (msg) => {
            if(!friends.find(f => f.id == msg.userId)) {
                friends.push({id: msg.userId, name: "Незнакомец #" + msg.userId, room: msg.room});
                localStorage.setItem('gchat_friends', JSON.stringify(friends));
                renderFriends();
            }
        });
        function renderMsg(msg) {
            const box = document.getElementById('messages'); const d = document.createElement('div');
            d.className = 'msg ' + (msg.userId == userData.id ? 'me' : 'them');
            let content = msg.type === 'text' ? msg.content : (msg.type === 'image' ? \`<img src="\${msg.content}" width="100%">\` : \`<audio src="\${msg.content}" controls style="width:100%; filter:invert(1)"></audio>\`);
            d.innerHTML = \`<div style="font-size:10px; opacity:0.5;">\${msg.userName}</div>\${content}<div style="font-size:9px; opacity:0.3; text-align:right;">\${msg.time}</div>\`;
            box.appendChild(d); box.scrollTop = box.scrollHeight;
        }
        socket.on('load_history', (msgs) => { document.getElementById('messages').innerHTML = ''; msgs.forEach(m => renderMsg(m)); });
        socket.on('user_status', (data) => { if(data.online) onlineUsers.add(data.id); else onlineUsers.delete(data.id); renderFriends(); });
        renderFriends();
    </script>
</body>
</html>
    `);
});

server.listen(process.env.PORT || 3000);
