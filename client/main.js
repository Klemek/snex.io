const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let hsize = 300;
let current;
let players;

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

function drawPlayer(ratio, p) {
  ctx.fillStyle = p.color;
  ctx.fillText(p.name, p.pos.x, p.pos.y - ratio * 10);
  ellipse(p.pos.x, p.pos.y, ratio * 3, ratio * 3);
  if(p.starting > 0)
    return;
  if (!history[p.name])
    history[p.name] = {
      i0: 0,
      list: new Array(hsize)
    };
  else
    history[p.name].i0 = (history[p.name].i0 + 1) % hsize;
  history[p.name].list[history[p.name].i0] = p.pos;
}

function drawHistory(p) {
  if (history[p.name]) {
    const h = history[p.name];
    ctx.strokeStyle = p.color;
    ctx.beginPath();
    if(!h.list[h.i0])
      return;
    ctx.moveTo(h.list[h.i0].x, h.list[h.i0].y);
    let last = h.list[h.i0];
    for (let di = 1; di < hsize; di++) {
      const point = h.list[(h.i0 - di + hsize) % hsize];
      if (point){
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
      }else{
        break;
      }
    }
    ctx.stroke();
  }
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ratio = canvas.height / window.innerHeight;

  ctx.font = `bold ${ratio * 120}px Roboto`;
  ctx.textAlign = 'center';

  ctx.fillStyle = '#4b4b4b';
  ctx.fillText('snex.io', canvas.width/2 - ratio * 3, canvas.height/2 + ratio*37);
  ctx.fillStyle = '#545454';
  ctx.fillText('snex.io', canvas.width/2, canvas.height/2 + ratio*40);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;

  ctx.textAlign = 'left';
  ctx.font = `normal ${ratio * 10}px Roboto`;
  const names = Object.keys(players);
  names.forEach(function (name) {
    const p = players[name];
    if(p.alive)
      drawPlayer(ratio, players[name]);
    if (name === current.name)
      current = players[name];
    drawHistory(players[name]);
  });

  requestAnimationFrame(drawGame);
}

const socket = io({
  'reconnection': true,
  'reconnectionDelay': 1000,
  'reconnectionDelayMax': 5000
});
socket.on('connect', function () {
  console.log('connected');
});
socket.on('disconnect', function () {
  console.log('disconnected');
});

socket.on('info', function(res){
  current = res.self;
  history = res.history;
  hsize = res.hsize;
  players = res.players;
  drawGame()
});

socket.on('players', function (p) {
  players = p;
});

$(document).on('keydown', function (e) {
  switch (e.keyCode) {
    case 32://space;
      current.color = 'new';
      socket.emit('update', current);
      return;
    case 37://left;
      current.angleSpd = -1;
      socket.emit('update', current);
      break;
    case 38://up;
      break;
    case 39://right;
      current.angleSpd = 1;
      socket.emit('update', current);
      break;
    case 40://down;
      break;
  }
});

$(document).on('keyup', function (e) {
  switch (e.keyCode) {
    case 32://space;
      current.color = 'new';
      socket.emit('update', current);
      return;
    case 37://left;
      current.angleSpd = 0;
      socket.emit('update', current);
      break;
    case 38://up;
      break;
    case 39://right;
      current.angleSpd = 0;
      socket.emit('update', current);
      break;
    case 40://down;
      break;
  }
});