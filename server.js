const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const convert = require('color-convert');
const fs = require('fs');

app.get('*', function (req, res) {
  if(req.originalUrl === '/')
    res.sendFile(`${__dirname}/client/index.html`);
  else if (fs.existsSync(`${__dirname}/client${req.originalUrl}`))
    res.sendFile(`${__dirname}/client${req.originalUrl}`);
  else
    res.status(404).send('file not found');
});

function randomColor() {
  return '#' + convert.hsl.hex([randInt(0, 256), randInt(150, 200), 256]);
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

function intersects(a1, a2, b1, b2) {
  let det, gamma, lambda;
  det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
  if (det === 0) {
    return false;
  } else {
    lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
    gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
  }
}

function dist(a1,a2){
  return Math.sqrt(Math.pow(a1.x-a2.x,2)+Math.pow(a1.y-a2.y,2));
}

function clone(a){
  return {x:parseFloat(a.x),y:parseFloat(a.y)};
}

const HSIZE = 300;
const MAXX = 1600;
const MAXY = 900;
const SPD = 5;
const MAX_ANGLE_SPEED = Math.PI / 32;

const players = {};
const history = {};

let upc = 0;
let ic = 0;

setInterval(function () {
  //main loop
  Object.keys(players).forEach(function (name) {
    const p = players[name];
    if (p.alive) {
      const lastpos = clone(p.pos);
      p.pos.x += SPD * Math.cos(p.angle);
      p.pos.y += SPD * Math.sin(p.angle);
      p.angle += p.angleSpd;
      let exempt = false;
      if (p.pos.x > MAXX){
        p.pos.x = 0;
        exempt = true;
      }
      if (p.pos.x < 0){
        p.pos.x = MAXX;
        exempt = true;
      }
      if (p.pos.y > MAXY){
        p.pos.y = 0;
        exempt = true;
      }
      if (p.pos.y < 0){
        p.pos.y = MAXY;
        exempt = true;
      }

      if(p.starting <= 0){
        const h = history[name];
        h.i0 = (h.i0 + 1) % HSIZE;
        h.list[h.i0] = clone(p.pos);
      }

      if(!exempt && p.starting <= 0){
        const ds = dist(lastpos,p.pos);
        if(ds <= SPD*0.9)
          process.stdout.write(`\r${name} moved too slowly : ${ds} [${lastpos.x},${lastpos.y}]->[${p.pos.x},${p.pos.y}]\n`);
        if(ds >= SPD*1.1)
          process.stdout.write(`\r${name} moved too quickly : ${ds} [${lastpos.x},${lastpos.y}]->[${p.pos.x},${p.pos.y}]\n`);

        Object.keys(history).forEach(function (name2) {
          if (p.alive && name !== name2) {
            const h2 = history[name2];
            let lastpoint = h2.list[h2.i0];
            if(!lastpoint)
              return;
            for (let di = 1; di < HSIZE; di++) {
              const point = h2.list[(h2.i0 - di + HSIZE) % HSIZE];
              if (point !== undefined) {
                if(Math.abs(lastpoint.x - point.x) < 1600 * .9 && Math.abs(lastpoint.y - point.y) < 900 * .9){
                  ic++;
                  if (intersects(lastpos, p.pos, lastpoint, point)) {
                    process.stdout.write(`\r${name} collided with ${name2}                            \n`);
                    p.alive = false;
                    break;
                  }
                }
                lastpoint = point;
              } else {
                break;
              }
            }
          }
        });
      }

      if(p.starting > 0)
        p.starting -= 20;

    }
  });
  io.emit('players', players);
  upc++;
}, 20);

setInterval(function () {
  process.stdout.write(`\rtick ${20 * upc * 20 / 1000}/20 ms (${Object.keys(players).length} connected) (${ic} intersect/s)               `);
  upc = 0;
  ic = 0;
}, 1000);

io.on('connection', function (socket) {
  socket.name = '#' + ('0000' + randInt(0, 10000)).slice(-4);
  process.stdout.write(`\r${socket.name} connected                            \n`);
  players[socket.name] = {
    pos: {
      x: randInt(100, MAXX - 100),
      y: randInt(100, MAXY - 100)
    },
    angle: Math.random() * Math.PI,
    angleSpd: 0,
    color: randomColor(),
    name: socket.name,
    alive: true,
    starting: 2000
  };
  history[socket.name] = {
    i0: -1,
    list: new Array(HSIZE)
  };
  socket.emit('info', {
    self:players[socket.name],
    players:players,
    history:history,
    hsize:HSIZE
  });

  socket.on('history', function () {
    socket.emit('history', history);
  });

  socket.on('disconnect', function () {
    delete players[socket.name];
    delete history[socket.name];
    process.stdout.write(`\r${socket.name} disconnected                            \n`);
    io.emit('players', players);
  });
  socket.on('update', function (newp) {
    const p = players[newp.name];
    if (!p) {
      socket.disconnect();
      return;
    }
    if (!p.alive)
      return;
    if (newp.angleSpd > 0)
      players[newp.name].angleSpd = MAX_ANGLE_SPEED;
    else if (newp.angleSpd < 0)
      players[newp.name].angleSpd = -MAX_ANGLE_SPEED;
    else
      players[newp.name].angleSpd = 0;
  });
});

http.listen(3001, function () {
  console.log('listening on *:3001\n');
});