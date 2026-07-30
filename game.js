import {fx} from "./audio.js";

const game = document.querySelector("#game");
const board = document.querySelector("#board");
const score = document.querySelector("#score");
const levelDisplay = document.querySelector("#level");
const highScore = document.querySelector("#high-score");
const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];
const CONTROLS = {ArrowUp:0,w:0,ArrowRight:1,d:1,ArrowDown:2,s:2,ArrowLeft:3,a:3};
const CUBE = '<div class="cube"><i></i><i></i><i></i></div>';
const PYRAMID = '<div class="pyramid"><i></i><i></i></div>';
const key = (x,y) => `${x},${y}`;
const pointHit = (p,dx,dy) => dx === -DIRS[p.d][0] && dy === -DIRS[p.d][1];

let level = 1;
let kills = 0;
let high = Number(localStorage.cubeFighterHigh) || 0;
let state, cells, fitFrame, locked = false;

function showScores() {
  score.value = String(kills).padStart(3,"0");
  highScore.value = String(high).padStart(3,"0");
}

function connected(n,walls,start,open) {
  const queue = [start];
  const seen = new Set([key(start.x,start.y)]);
  for (let i = 0; i < queue.length; i++) {
    for (const [dx,dy] of DIRS) {
      const x = queue[i].x + dx;
      const y = queue[i].y + dy;
      const k = key(x,y);
      if (x > 0 && y > 0 && x < n-1 && y < n-1 && !walls.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push({x,y});
      }
    }
  }
  return seen.size === open;
}

function buildBoard(n) {
  const fragment = document.createDocumentFragment();
  cells = [];
  board.style.setProperty("--n",n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.tabIndex = -1;
      cell.dataset.x = x;
      cell.dataset.y = y;
      cells.push(cell);
      fragment.append(cell);
    }
  }
  board.replaceChildren(fragment);
  fitBoard(n);
}

function fitBoard(n = state.n) {
  const ratio = devicePixelRatio || 1;
  const line = Math.max(1,Math.round(ratio));
  const limit = Math.min(innerWidth * .88,innerHeight - 100,560) * ratio;
  const cell = Math.max(1,Math.floor((limit - (n + 1) * line) / n));
  game.style.width = (n * cell + (n + 1) * line) / ratio + "px";
  board.style.setProperty("--line",line / ratio + "px");
  board.style.transform = "";
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    const rect = board.getBoundingClientRect();
    const x = (Math.round(rect.left * ratio) - rect.left * ratio) / ratio;
    const y = (Math.round(rect.top * ratio) - rect.top * ratio) / ratio;
    board.style.transform = `translate(${x}px,${y}px)`;
  });
}

function render() {
  const pyramidAt = new Map();
  for (const pyramid of state.pyramids)
    pyramidAt.set(key(pyramid.x,pyramid.y),pyramid);
  for (let y = 0; y < state.n; y++) {
    for (let x = 0; x < state.n; x++) {
      const cell = cells[y * state.n + x];
      const k = key(x,y);
      const wall = state.walls.has(k);
      const pyramid = pyramidAt.get(k);
      const dx = x - state.player.x;
      const dy = y - state.player.y;
      const adjacent = Math.abs(dx) + Math.abs(dy) === 1;
      const player = !wall && !pyramid && !dx && !dy;
      const sprite = player ? "cube" : pyramid ? "pyramid" : "";
      let classes = wall ? "cell wall" : "cell";

      if (adjacent && !wall)
        classes += pyramid ? (pointHit(pyramid,dx,dy) ? " danger" : " kill") : " open";
      if (cell.className !== classes) cell.className = classes;
      if (cell.dataset.sprite !== sprite) {
        cell.dataset.sprite = sprite;
        cell.innerHTML = sprite === "cube" ? CUBE : sprite ? PYRAMID : "";
      }
      if (pyramid)
        cell.firstElementChild.style.transform = `rotate(${pyramid.d * 90 + 13}deg)`;
    }
  }
}

function start() {
  locked = false;
  board.className = "";
  levelDisplay.value = String(level).padStart(2,"0");
  const n = 10 + Math.floor((level - 1) / 3);
  const player = {x: Math.floor(n / 2), y: Math.floor(n / 2)};
  const walls = new Set();

  for (let i = 0; i < n; i++) {
    walls.add(key(i,0)); walls.add(key(i,n-1));
    walls.add(key(0,i)); walls.add(key(n-1,i));
  }

  const area = (n-2) ** 2;
  const wallTarget = Math.round(area * .08 + level);
  let placed = 0, attempts = 0;
  while (placed < wallTarget && attempts++ < wallTarget * 50) {
    const x = 1 + Math.floor(Math.random() * (n - 2));
    const y = 1 + Math.floor(Math.random() * (n - 2));
    const k = key(x,y);
    if (Math.abs(x-player.x) + Math.abs(y-player.y) <= 2 || walls.has(k)) continue;
    walls.add(k);
    if (connected(n,walls,player,area-placed-1)) placed++;
    else walls.delete(k);
  }

  const pyramids = [];
  const occupied = new Set();
  while (pyramids.length < level) {
    const x = 1 + Math.floor(Math.random() * (n - 2));
    const y = 1 + Math.floor(Math.random() * (n - 2));
    const k = key(x,y);
    if (!walls.has(k) && !occupied.has(k) && Math.abs(x-player.x) + Math.abs(y-player.y) > 2) {
      pyramids.push({x,y,d:Math.floor(Math.random() * 4)});
      occupied.add(k);
    }
  }

  state = {n,player,walls,pyramids};
  buildBoard(n);
  render();
}

function burst(x,y,type) {
  const cell = cells[y * state.n + x];
  if (!cell) return;
  const particle = document.createElement("i");
  particle.className = `burst ${type}`;
  particle.style.left = cell.offsetLeft + cell.offsetWidth / 2 - 2 + "px";
  particle.style.top = cell.offsetTop + cell.offsetHeight / 2 - 2 + "px";
  particle.addEventListener("animationend",() => particle.remove(),{once:true});
  board.append(particle);
}

function lose() {
  locked = true;
  board.classList.add("dead");
  cells[state.player.y * state.n + state.player.x].firstElementChild?.classList.add("popped");
  burst(state.player.x,state.player.y,"player");
  fx.die();
  setTimeout(() => {
    level = 1;
    kills = 0;
    showScores();
    start();
  },350);
}

function win() {
  locked = true;
  fx.clear();
  setTimeout(() => {
    level++;
    start();
  },350);
}

function routesToPlayer() {
  const n = state.n;
  const routes = new Int16Array(n * n).fill(-1);
  const queue = [state.player.y * n + state.player.x];
  routes[queue[0]] = 0;

  for (let i = 0; i < queue.length; i++) {
    const x = queue[i] % n;
    const y = Math.floor(queue[i] / n);
    for (const [dx,dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const next = ny * n + nx;
      if (nx >= 0 && ny >= 0 && nx < n && ny < n &&
          routes[next] < 0 && !state.walls.has(key(nx,ny))) {
        routes[next] = routes[queue[i]] + 1;
        queue.push(next);
      }
    }
  }
  return routes;
}

function enemyTurn() {
  const routes = routesToPlayer();
  const n = state.n;
  const occupied = new Set(state.pyramids.map(p => p.y * n + p.x));
  let turned = false;

  for (const pyramid of state.pyramids) {
    const here = pyramid.y * n + pyramid.x;
    occupied.delete(here);
    let choices = [];

    for (let d = 0; d < 4; d++) {
      const [dx,dy] = DIRS[d];
      const x = pyramid.x + dx;
      const y = pyramid.y + dy;
      const tile = y * n + x;
      if (routes[tile] < 0 || routes[tile] >= routes[here]) continue;
      const turn = Math.min((d-pyramid.d+4)%4,(pyramid.d-d+4)%4);
      choices.push({d,x,y,tile,turn});
    }

    if (choices.length > 1) {
      const open = choices.filter(choice => !occupied.has(choice.tile));
      if (open.length) choices = open;
    }

    let next, best = Infinity;
    for (const choice of choices)
      if (choice.turn < best || choice.turn === best && Math.random() < .5) {
        best = choice.turn;
        next = choice;
      }

    if (!next) {
      occupied.add(here);
      continue;
    }
    if (pyramid.d !== next.d) {
      const turn = (next.d - pyramid.d + 4) % 4;
      if (turn === 2) {
        const left = (pyramid.d + 3) % 4;
        const right = (pyramid.d + 1) % 4;
        const distance = d => {
          const [dx,dy] = DIRS[d];
          const route = routes[(pyramid.y+dy)*n+pyramid.x+dx];
          return route < 0 ? Infinity : route;
        };
        const leftDistance = distance(left);
        const rightDistance = distance(right);
        pyramid.d = leftDistance === rightDistance
          ? (Math.random() < .5 ? left : right)
          : (leftDistance < rightDistance ? left : right);
      } else pyramid.d = next.d;
      turned = true;
    } else {
      if (state.player.x === next.x && state.player.y === next.y) return lose();
      if (!occupied.has(next.tile)) {
        pyramid.x = next.x;
        pyramid.y = next.y;
      }
    }
    occupied.add(pyramid.y * n + pyramid.x);
  }

  locked = false;
  if (turned) fx.turn();
  render();
}

function move(d) {
  if (locked) return;
  const [dx,dy] = DIRS[d];
  const x = state.player.x + dx;
  const y = state.player.y + dy;
  let destroyed = false;

  if (state.walls.has(key(x,y))) return fx.wall();
  const i = state.pyramids.findIndex(p => p.x === x && p.y === y);
  if (i >= 0) {
    if (pointHit(state.pyramids[i],dx,dy)) return lose();
    state.pyramids.splice(i,1);
    destroyed = true;
    fx.kill();
    kills++;
    if (kills > high) {
      high = kills;
      localStorage.cubeFighterHigh = high;
    }
    showScores();
  } else fx.step();

  state.player = {x,y};
  render();
  if (destroyed) burst(x,y,"enemy");
  if (!state.pyramids.length) return win();
  locked = true;
  setTimeout(enemyTurn,destroyed ? 260 : 100);
}

board.addEventListener("click",event => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const dx = Number(cell.dataset.x) - state.player.x;
  const dy = Number(cell.dataset.y) - state.player.y;
  const d = DIRS.findIndex(([x,y]) => x === dx && y === dy);
  if (d >= 0) move(d);
});

addEventListener("keydown",event => {
  if (event.target.id === "volume") return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const d = CONTROLS[key];
  if (d !== undefined) {
    event.preventDefault();
    move(d);
  } else if (event.code === "Space" && !locked) {
    event.preventDefault();
    fx.wait();
    locked = true;
    setTimeout(enemyTurn,100);
  }
});
addEventListener("resize",() => fitBoard());

showScores();
start();
