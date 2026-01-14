const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;overflow:hidden;background:#1a1a1a;color:white;font-family:sans-serif;">
    <canvas id="c"></canvas>
    <input id="i" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:70%;padding:12px;border-radius:20px;border:none;" placeholder="Enter = Чат, WASD = Ходить">
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    <script>
        const socket=io(), canvas=document.getElementById('c'), ctx=canvas.getContext('2d'), input=document.getElementById('i');
        canvas.width=window.innerWidth; canvas.height=window.innerHeight;
        let p={}, my={x:100,y:100,c:'hsl('+Math.random()*360+',70%,60%)'};
        const k={};
        window.onkeydown=e=>{if(document.activeElement!==input)k[e.code]=true;if(e.code==='Enter')input.focus()};
        window.onkeyup=e=>k[e.code]=false;
        input.onkeydown=e=>{if(e.code==='Enter'&&input.value){socket.emit('chat',input.value);input.value='';input.blur()}};
        socket.on('s',d=>p=d);
        function L(){
            if(k.KeyW)my.y-=5;if(k.KeyS)my.y+=5;if(k.KeyA)my.x-=5;if(k.KeyD)my.x+=5;
            socket.emit('move',my); ctx.clearRect(0,0,canvas.width,canvas.height);
            for(let id in p){
                ctx.fillStyle=p[id].c; ctx.fillRect(p[id].x,p[id].y,30,30);
                if(p[id].m&&p[id].t>0){ctx.fillStyle='white';ctx.textAlign='center';ctx.fillText(p[id].m,p[id].x+15,p[id].y-10)}
            }
            requestAnimationFrame(L);
        }
        L();
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(html));

let players = {}; // Переменная теперь на месте!

io.on('connection', (socket) => {
    players[socket.id] = {x: 100, y: 100, c: 'orange', m: '', t: 0};
    socket.on('move', (data) => { if (players[socket.id]) Object.assign(players[socket.id], data); });
    socket.on('chat', (msg) => { if (players[socket.id]) { players[socket.id].m = msg; players[socket.id].t = 100; } });
    socket.on('disconnect', () => { delete players[socket.id]; });
});

setInterval(() => {
    for (let id in players) { if (players[id].t > 0) players[id].t--; }
    io.emit('s', players);
}, 50);

http.listen(3000, '0.0.0.0', () => console.log('СЕРВЕР РАБОТАЕТ на http://localhost:3000'));