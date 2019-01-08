const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let hsize = 300;
let current;
let players;
let room;
let lastScores;
let leaderboard;
let lock;
let history = {};

function ellipse(cx, cy, rx, ry) {
  ctx.save(); // save state
  ctx.beginPath();

  ctx.translate(cx - rx, cy - ry);
  ctx.scale(rx, ry);
  ctx.arc(1, 1, 1, 0, 2 * Math.PI, false);

  ctx.restore(); // restore to original state
  ctx.fill();
}

function clone(a) {
  return {x: parseFloat(a.x), y: parseFloat(a.y)};
}

setInterval(function () {
  //main loop
  Object.keys(players).forEach(function (name) {
    const p = players[name];
    if (p.alive) {
      if (p.starting <= 0 && !lock) {
        if (!history[p.name])
          history[p.name] = {
            i0: 0,
            list: new Array(hsize)
          };
        else
          history[p.name].i0 = (history[p.name].i0 + 1) % hsize;
        history[p.name].list[history[p.name].i0] = clone(p.pos);
      } else {
        history[p.name] = {
          i0: 0,
          list: new Array(hsize)
        };
        history[p.name].list[0] = clone(p.pos);
      }
    }
  });

}, 20);

function drawPlayer(ratio, p) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;

  ctx.fillStyle = p.alive ? p.color : '#757575';
  ctx.fillText(p.name, p.pos.x, p.pos.y - ratio * 10);
  if (p.alive)
    ellipse(p.pos.x, p.pos.y, ratio * 3, ratio * 3);

  if (history[p.name]) {
    const h = history[p.name];
    ctx.strokeStyle = p.alive ? p.color : '#757575';
    console.log('h', h.list.length);
    ctx.beginPath();
    if (!h.list[h.i0])
      return;
    ctx.moveTo(h.list[h.i0].x, h.list[h.i0].y);
    let last = h.list[h.i0];
    for (let di = 1; di < hsize; di++) {
      const point = h.list[(h.i0 - di + hsize) % hsize];
      if (point) {
        if (Math.abs(last.x - point.x) >= 1600 * .9) {
          ctx.stroke();
          ctx.moveTo(point.x, point.y);
        } else if (Math.abs(last.y - point.y) >= 900 * .9) {
          ctx.stroke();
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y)
        }
        last = point;
      } else {
        break;
      }
    }
    ctx.stroke();
  }

}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ratio = canvas.height / window.innerHeight;

  const writeText = function (txt, size, x, y, font) {
    ctx.font = `${font} ${size}px Roboto`;
    const lines = txt.split('\n');
    lines.forEach(function (line, i) {
      ctx.fillStyle = '#4b4b4b';
      ctx.fillText(line, x - size / 40, y + size / 2 - (size * lines.length) / 2 + size * i - size / 40);
      ctx.fillStyle = '#545454';
      ctx.fillText(line, x, y + size / 2 - (size * lines.length) / 2 + size * i);
    });
  };

  ctx.textAlign = 'center';
  writeText(`snex.io\n#${room}`, 120, canvas.width / 2, canvas.height / 2, 'bold');

  ctx.textAlign = 'left';
  writeText(leaderboard, 30, canvas.width / 30, canvas.height / 15, 'normal');

  ctx.textAlign = 'left';
  ctx.font = `normal ${ratio * 15}px Roboto`;
  const names = Object.keys(players);
  names.forEach(function (name) {
    drawPlayer(ratio, players[name]);
    if (name === current.name)
      current = players[name];
  });

  requestAnimationFrame(drawGame);
}

function updateLeaderboard() {
  const pl = Object.keys(players);
  const scores = pl.map(p => `${players[p].score} - ${p}`).join('\n');
  if (!lastScores || scores !== lastScores) {
    lastScores = scores;
    pl.sort((p1, p2) => players[p2].score - players[p1].score);
    leaderboard = pl.map(p => `${players[p].score} - ${p}` + (p === current.name ? ' *' : '')).join('\n');
  }
}

const socket = io({
  'reconnection': true,
  'reconnectionDelay': 1000,
  'reconnectionDelayMax': 5000
});
socket.on('connect', function () {
  console.log('connected');
  if (window.location.hash) {
    socket.emit('room', window.location.hash.slice(1));
  } else {
    socket.emit('room', undefined);
  }
});
socket.on('disconnect', function () {
  console.log('disconnected');
});

socket.on('info', function (res) {
  current = res.self;
  history = res.history;
  players = res.players;
  room = res.room;
  window.location.hash = '#' + room;
  updateLeaderboard();
  drawGame();
  $(window).focus(function () {
    socket.emit('history', current);
  });
});

socket.on('history', function (h) {
  history = h;
});

socket.on('lock', function (l) {
  lock = l;
});

socket.on('players', function (p) {
  players = p;
  updateLeaderboard();
});

const keys = {};
let currentAngleSpd = 0;

function changeAngle(spd) {
  if (currentAngleSpd !== spd) {
    current.angleSpd = spd;
    currentAngleSpd = spd;
    socket.emit('update', current);
  }
}

$(document).on('keydown', function (e) {
  switch (e.keyCode) {
    case 37://left;
      changeAngle(-1);
      break;
    case 39://right;
      changeAngle(1);
      break;
  }
  keys[e.keyCode] = true;
});

$(document).on('keyup', function (e) {
  switch (e.keyCode) {
    case 32://space;
      current.color = 'new';
      socket.emit('update', current);
      return;
    case 37://left;
      if (keys[39])
        changeAngle(1);
      else
        changeAngle(0);
      break;
    case 39://right;
      if (keys[37])
        changeAngle(-1);
      else
        changeAngle(0);
      break;
  }
  keys[e.keyCode] = false;
});