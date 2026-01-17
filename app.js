const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

// Ссылка из твоего скриншота
const MONGO_URI = "mongodb+srv://y0749278_db_user:11048011Aa@cluster0.nnrsbjx.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("БАЗА ПОДКЛЮЧЕНА!"))
    .catch(err => console.log("ОШИБКА БАЗЫ:", err));

// Схемы для хранения в MongoDB
const userSchema = new mongoose.Schema({ name: String, pass: String, id: Number });
const chatSchema = new mongoose.Schema({ uid: Number, chats: Array });
const msgSchema = new mongoose.Schema({
    room: String, userId: Number, userName: String,
    content: String, type: String, id: Number, date: Date
});

const User = mongoose.model('User', userSchema);
const ChatList = mongoose.model('ChatList', chatSchema);
const Msg = mongoose.model('Msg', msgSchema);

io.on('connection', (socket) => {
    socket.on('server_auth', async (data) => {
        const { name, pass, type } = data;
        if (type === 'reg') {
            const exist = await User.findOne({ name });
            if (exist) return socket.emit('auth_error', 'Имя занято!');
            const newId = Math.floor(10000 + Math.random() * 89999);
            await new User({ name, pass, id: newId }).save();
            await new ChatList({ uid: newId, chats: [] }).save();
            socket.emit('auth_success', { name, id: newId, pass });
        } else {
            const acc = await User.findOne({ name, pass });
            if (acc) {
                socket.emit('auth_success', { name: acc.name, id: acc.id, pass: acc.pass });
                const list = await ChatList.findOne({ uid: acc.id });
                socket.emit('sync_chats', list ? list.chats : []);
            } else socket.emit('auth_error', 'Неверный пароль!');
        }
    });

    socket.on('register_me', (id) => { socket.join("user-" + id); });

    socket.on('join_room', async (room) => { 
        socket.join(room); 
        const history = await Msg.find({ room }).sort({date: 1}).limit(100);
        socket.emit('load_history', history);
    });

    socket.on('send_msg', async (data) => {
        const msgData = { id: Date.now() + Math.random(), date: new Date(), ...data };
        await new Msg(msgData).save();
        io.to(data.room).emit('new_msg', msgData);
    });

    socket.on('save_chat_to_server', async (data) => {
        let list = await ChatList.findOne({ uid: data.uid });
        if(list && !list.chats.find(c => c.room === data.chat.room)) {
            list.chats.push(data.chat);
            await ChatList.updateOne({ uid: data.uid }, { chats: list.chats });
        }
    });
});

app.get('/', (req, res) => {
    res.send('<h1>Сервер G-Chat Eternal запущен!</h1>');
});

server.listen(process.env.PORT || 3000);
