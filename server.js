const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const convert = require('color-convert');
const fs = require('fs');

app.get('*', function (req, res) {
  if (req.originalUrl === '/')
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

function dist(a1, a2) {
  return Math.sqrt(Math.pow(a1.x - a2.x, 2) + Math.pow(a1.y - a2.y, 2));
}

function clone(a) {
  return {x: parseFloat(a.x), y: parseFloat(a.y)};
}

const HSIZE = 300;
const MAXX = 1600;
const MAXY = 900;
const SPD = 5;
const MAX_ANGLE_SPEED = Math.PI / 32;

const rooms = {};

let updateCount = 0;
let intersectCount = 0;
let playerCount = 0;

setInterval(function () {
  //main loop
  Object.keys(rooms).forEach(function (rname) {
    const room = rooms[rname];
    const pl = Object.keys(room.players);

    if (room.waiting > 0) {
      room.waiting -= 20;
      if (room.waiting <= 0) { //restart
        process.stdout.write(`\rroom #${rname} > restarting game                            \n`);
        room.history = {};
        pl.forEach(function (name) {
          const p = room.players[name];
          room.players[name] = {
            pos: {
              x: randInt(100, MAXX - 100),
              y: randInt(100, MAXY - 100)
            },
            angle: Math.random() * Math.PI,
            angleSpd: 0,
            color: p.color,
            name: p.name,
            alive: true,
            starting: 2000,
            score: p.score
          };
          room.history[name] = {
            i0: -1,
            list: new Array(HSIZE)
          }
        });
        io.to(rname).emit('players', room.players);
        io.to(rname).emit('history', room.history);
        io.to(rname).emit('lock', false);
      }
      return;
    }

    pl.forEach(function (name) {
      const p = room.players[name];
      if (p.alive) {
        const lastpos = clone(p.pos);
        p.pos.x += SPD * Math.cos(p.angle);
        p.pos.y += SPD * Math.sin(p.angle);
        p.angle += p.angleSpd;
        let exempt = false;
        if (p.pos.x > MAXX) {
          p.pos.x = 0;
          exempt = true;
        }
        if (p.pos.x < 0) {
          p.pos.x = MAXX;
          exempt = true;
        }
        if (p.pos.y > MAXY) {
          p.pos.y = 0;
          exempt = true;
        }
        if (p.pos.y < 0) {
          p.pos.y = MAXY;
          exempt = true;
        }

        if (p.starting <= 0) {
          const h = room.history[name];
          h.i0 = (h.i0 + 1) % HSIZE;
          h.list[h.i0] = clone(p.pos);
        }

        if (!exempt && p.starting <= 0) {
          const ds = dist(lastpos, p.pos);
          if (ds <= SPD * 0.9)
            process.stdout.write(`\r${name} moved too slowly : ${ds} [${lastpos.x},${lastpos.y}]->[${p.pos.x},${p.pos.y}]\n`);
          if (ds >= SPD * 1.1)
            process.stdout.write(`\r${name} moved too quickly : ${ds} [${lastpos.x},${lastpos.y}]->[${p.pos.x},${p.pos.y}]\n`);

          Object.keys(room.history).forEach(function (name2) {
            if (p.alive && name !== name2) {
              const h2 = room.history[name2];
              let lastpoint = h2.list[h2.i0];
              if (!lastpoint)
                return;
              for (let di = 1; di < HSIZE; di++) {
                const point = h2.list[(h2.i0 - di + HSIZE) % HSIZE];
                if (point !== undefined) {
                  if (Math.abs(lastpoint.x - point.x) < 1600 * .9 && Math.abs(lastpoint.y - point.y) < 900 * .9) {
                    intersectCount++;
                    if (intersects(lastpos, p.pos, lastpoint, point)) {
                      process.stdout.write(`\rroom #${rname} > ${name} collided with ${name2}                            \n`);
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

        if (p.starting > 0)
          p.starting -= 20;

      }
    });
    const palive = pl.filter(p => room.players[p].alive);

    if (pl.length > 1 && palive.length === 1) { //end of game
      room.players[palive[0]].score++;
      room.waiting = 3000;
      process.stdout.write(`\rroom #${rname} > ${palive[0]} won                            \n`);
      io.to(rname).emit('lock', true);
    }
    io.to(rname).emit('players', room.players);
  });
  updateCount++;
}, 20);

setInterval(function () {
  process.stdout.write(`\rtick ${20 * updateCount * 20 / 1000}/20 ms (${Object.keys(rooms).length} rooms) (${playerCount} players) (${intersectCount} intersect/s)               `);
  updateCount = 0;
  intersectCount = 0;
}, 1000);

io.on('connection', function (socket) {
  socket.name = '#' + ('0000' + randInt(0, 10000)).slice(-4);
  process.stdout.write(`\r${socket.name} connected                            \n`);
  playerCount++;

  socket.on('room', function (name) {
    if (socket.room)
      return;
    if (name) {
      socket.room = name;
    } else {
      socket.room = ('000000' + randInt(0, 1000000)).slice(-4);
    }

    socket.join(socket.room);

    if (!rooms[socket.room]) {
      rooms[socket.room] = {
        waiting: 0,
        players: {},
        history: {}
      }
    }

    rooms[socket.room].players[socket.name] = {
      pos: {
        x: randInt(100, MAXX - 100),
        y: randInt(100, MAXY - 100)
      },
      angle: Math.random() * Math.PI,
      angleSpd: 0,
      color: randomColor(),
      name: socket.name,
      alive: true,
      starting: 2000,
      score: 0
    };
    rooms[socket.room].history[socket.name] = {
      i0: -1,
      list: new Array(HSIZE)
    };

    socket.emit('info', {
      room: socket.room,
      self: rooms[socket.room].players[socket.name],
      players: rooms[socket.room].players,
      history: rooms[socket.room].history,
      hsize: HSIZE
    });

    process.stdout.write(`\rroom #${socket.room} > ${socket.name} connected                            \n`);
  });

  socket.on('history', function () {
    if (socket.room)
      socket.emit('history', rooms[socket.room].history);
  });

  socket.on('disconnect', function () {
    playerCount--;
    if (!socket.room)
      return;
    delete rooms[socket.room].players[socket.name];
    delete rooms[socket.room].history[socket.name];
    process.stdout.write(`\rroom #${socket.room} > ${socket.name} disconnected                            \n`);
    if (Object.keys(rooms[socket.room].players).length === 0) {
      delete rooms[socket.room];
      process.stdout.write(`\rroom #${socket.room} deleted                            \n`);
    }
  });

  socket.on('update', function (newp) {
    if (!socket.room)
      return;
    const p = rooms[socket.room].players[newp.name];
    if (!p) {
      socket.disconnect();
      return;
    }
    if (!p.alive)
      return;
    if (newp.color === 'new')
      rooms[socket.room].players[newp.name].color = randomColor();
    if (newp.angleSpd > 0)
      rooms[socket.room].players[newp.name].angleSpd = MAX_ANGLE_SPEED;
    else if (newp.angleSpd < 0)
      rooms[socket.room].players[newp.name].angleSpd = -MAX_ANGLE_SPEED;
    else
      rooms[socket.room].players[newp.name].angleSpd = 0;
  });
});

http.listen(3001, function () {
  console.log('listening on *:3001\n');
});