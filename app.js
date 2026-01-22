const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- 1. НАСТРОЙКИ СЕРВЕРА И БД ---
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/g-chat-pro';
mongoose.connect(mongoURI).then(() => console.log('✅ База данных готова'));

// Папка для фото и голосовых
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static('uploads'));
app.use(express.json());

// --- 2. ДЛЯ МОДЕРАЦИИ GOOGLE ---
app.get('/health', (req, res) => res.status(200).json({ status: 'running' }));

// Схемы данных
const Message = mongoose.model('Message', {
    room: String, userId: String, userName: String,
    content: String, type: String, id: String, date: { type: Date, default: Date.now }
});
const Room = mongoose.model('Room', { name: String, room: String, type: String, adminId: String });

// Загрузка файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

app.post('/upload', upload.single('file'), (req, res) => {
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, type: req.file.mimetype.includes('image') ? 'img' : 'voice' });
});

// --- 3. ИНТЕРФЕЙС (HTML/CSS/JS) ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>G-Chat v1.0</title>
    <style>
        :root { --accent: #7b2dfa; --bg: #0b0b0b; --panel: #161616; --text: #eee; --danger: #ff4d4d; }
        body { margin: 0; background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; overflow: hidden; }

        /* ФИКС ДЛЯ SAMSUNG A15 */
        #app { 
            display: flex; height: 100vh; 
            padding-bottom: env(safe-area-inset-bottom, 24px); 
        }

        /* САЙДБАР */
        #sidebar { width: 300px; background: var(--panel); border-right: 1px solid #222; display: flex; flex-direction: column; }
        .s-head { padding: 20px; font-size: 1.2em; font-weight: bold; border-bottom: 1px solid #333; display: flex; justify-content: space-between; }
        #rooms { flex: 1; overflow-y: auto; }
        .room-btn { padding: 15px 20px; border-bottom: 1px solid #222; cursor: pointer; transition: 0.3s; }
        .room-btn:hover { background: #1e1e1e; }
        .room-btn.active { background: #1a1a1a; border-left: 4px solid var(--accent); }

        /* ОКНО ЧАТА */
        #main { flex: 1; display: flex; flex-direction: column; position: relative; }
        #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
        
        .msg { padding: 10px 14px; border-radius: 12px; max-width: 70%; position: relative; line-height: 1.4; animation: slide 0.2s ease; }
        @keyframes slide { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        .me { align-self: flex-end; background: var(--accent); color: white; border-bottom-right-radius: 2px; }
        .them { align-self: flex-start; background: #262626; border-bottom-left-radius: 2px; }
        
        .m-info { font-size: 10px; opacity: 0.6; margin-bottom: 4px; display: flex; justify-content: space-between; }
        .del-btn { color: var(--danger); cursor: pointer; margin-left: 8px; font-weight: bold; }

        /* ВВОД СООБЩЕНИЯ */
        .input-box { padding: 15px; background: var(--panel); display: flex; gap: 10px; border-top: 1px solid #333; }
        input { flex: 1; background: #222; border: 1px solid #444; color: white; padding: 12px; border-radius: 8px; outline: none; }
        button { background: var(--accent); border: none; color: white; padding: 10px 20px; border-radius: 8px; cursor: pointer; }

        /* ЗАГЛУШКА ОФФЛАЙН */
        #offline { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.9); z-index: 1000; flex-direction: column; justify-content: center; align-items: center; }
    </style>
</head>
<body>
    <div id="offline">
        <h1 style="color:var(--accent)">🔌 Связь потеряна</h1>
        <p>Пытаемся восстановить подключение...</p>
    </div>

    <div id="app">
        <div id="sidebar">
            <div class="s-head">G-Chat <span id="user-status" style="font-size: 10px; color: #555;">ID: ...</span></div>
            <div id="rooms"></div>
        </div>
        <div id="main">
            <div id="messages"></div>
            <div class="input-box">
                <button onclick="takePhoto()" id="cam-btn">📷</button>
                <input id="m-inp" placeholder="Напишите что-нибудь...">
                <button onclick="sendMsg()">➤</button>
            </div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let curR = 'global', me = { id: '', name: 'User-' + Math.floor(Math.random()*1000) };

        socket.on('connect', () => {
            me.id = socket.id;
            document.getElementById('user-status').innerText = 'ID: ' + me.id;
            document.getElementById('offline').style.display = 'none';
            socket.emit('get_rooms');
        });

        socket.on('disconnect', () => { document.getElementById('offline').style.display = 'flex'; });

        // Работа с комнатами
        socket.on('rooms_list', list => {
            const rDiv = document.getElementById('rooms');
            rDiv.innerHTML = '';
            list.forEach(r => {
                const d = document.createElement('div');
                d.className = 'room-btn' + (curR === r.room ? ' active' : '');
                d.innerHTML = '<b># ' + r.name + '</b>';
                d.onclick = () => {
                    curR = r.room;
                    document.getElementById('messages').innerHTML = '';
                    socket.emit('join_room', r.room);
                    Array.from(document.querySelectorAll('.room-btn')).forEach(b => b.classList.remove('active'));
                    d.classList.add('active');
                };
                rDiv.appendChild(d);
            });
        });

        // Логика сообщений
        socket.on('load_history', h => h.forEach(render));
        socket.on('new_msg', m => { if(m.room === curR) render(m); });
        socket.on('msg_deleted', id => document.getElementById('m-'+id)?.remove());

        function render(m) {
            const box = document.getElementById('messages');
            const d = document.createElement('div');
            d.id = 'm-' + m.id;
            d.className = 'msg ' + (m.userId === me.id ? 'me' : 'them');
            
            let html = '<div class="m-info"><span>'+m.userName+'</span>';
            if(m.userId === me.id) html += '<span class="del-btn" onclick="del(\\''+m.id+'\\')">✕</span>';
            html += '</div>';

            if(m.type === 'img') html += '<img src="'+m.content+'" style="max-width:100%; border-radius:8px;">';
            else if(m.type === 'voice') html += '<audio controls src="'+m.content+'" style="width:200px; height:35px;"></audio>';
            else html += m.content;

            d.innerHTML = html;
            box.appendChild(d);
            box.scrollTop = box.scrollHeight;
        }

        function sendMsg() {
            const inp = document.getElementById('m-inp');
            if(inp.value.trim()) {
                socket.emit('send_msg', { room: curR, content: inp.value, userName: me.name, type: 'text' });
                inp.value = '';
            }
        }

        function del(id) { socket.emit('delete_msg', { id, room: curR }); }

        // Эмуляция камеры (для модераторов)
        function takePhoto() {
            alert("Камера активна. Выберите файл для эмуляции снимка.");
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = e => {
                const file = e.target.files[0];
                const fd = new FormData();
                fd.append('file', file);
                fetch('/upload', { method: 'POST', body: fd })
                    .then(r => r.json())
                    .then(data => {
                        socket.emit('send_msg', { room: curR, content: data.url, userName: me.name, type: data.type });
                    });
            };
            input.click();
        }
    </script>
</body>
</html>
    `);
});

// --- 4. ЛОГИКА SOCKET.IO (BACKEND) ---
io.on('connection', (socket) => {
    socket.on('get_rooms', async () => {
        let list = await Room.find();
        if (list.length === 0) {
            await new Room({ name: 'Общий чат', room: 'global', type: 'group' }).save();
            list = await Room.find();
        }
        socket.emit('rooms_list', list);
    });

    socket.on('join_room', async (roomId) => {
        socket.join(roomId);
        const history = await Message.find({ room: roomId }).sort({ date: -1 }).limit(50);
        socket.emit('load_history', history.reverse());
    });

    socket.on('send_msg', async (data) => {
        const msg = new Message({
            room: data.room, userId: socket.id, userName: data.userName,
            content: data.content, type: data.type, id: Date.now().toString()
        });
        await msg.save();
        io.to(data.room).emit('new_msg', msg);
    });

    socket.on('delete_msg', async (data) => {
        await Message.deleteOne({ id: data.id });
        io.to(data.room).emit('msg_deleted', data.id);
    });
});

server.listen(process.env.PORT || 3000, () => console.log('🚀 Server started'));
