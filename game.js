const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const panelTitle = document.getElementById("panelTitle");
const statusText = document.getElementById("statusText");
const startBtn = document.getElementById("startBtn");
const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("highScore");
const nameInput = document.getElementById("nameInput");
const saveBtn = document.getElementById("saveBtn");
const gameOverSection = document.getElementById("gameOverSection");
const finalScoreEl = document.getElementById("finalScore");
const lbTable = document.getElementById("lbTable");
const lbHeader = document.querySelector("#leaderboard h2");

const SPEED = 120;
const BOOST_SPEED = 200;
const SLOW_SPEED = 70;
const TURN_SPEED = 3.5;
const SEGMENT_DIST = 6;
const SNAKE_RADIUS = 8;
const FOOD_RADIUS = 8;
const GROW_AMOUNT = 8;
const INITIAL_LENGTH = 15;
const SELF_COLLISION_SKIP = 80;

const keyState = {
  left: false,
  right: false,
  boost: false,
  slow: false
};

let segments;
let dirAngle;
let food;
let score;
let highScore;
let running;
let animId;
let lastTime;
let turnDir;
let boosting;
let slowing;
let lastSavedIndex;

function loadLeaderboard() {
  try {
    const saved = JSON.parse(localStorage.getItem("snakeLeaderboard") || "[]");
    return Array.isArray(saved) ? normalizeLeaderboard(saved) : [];
  } catch {
    return [];
  }
}

function saveLeaderboard(lb) {
  localStorage.setItem("snakeLeaderboard", JSON.stringify(normalizeLeaderboard(lb)));
}

function getPlayerName(value) {
  const name = String(value || "").trim();
  return name || "Anonymous";
}

function getPlayerKey(value) {
  return getPlayerName(value).toLocaleLowerCase();
}

function normalizeLeaderboard(entries) {
  const byName = new Map();

  entries.forEach(entry => {
    const scoreValue = Number(entry && entry.score);
    if (!Number.isFinite(scoreValue)) return;

    const name = getPlayerName(entry && entry.name);
    const score = Math.max(0, Math.floor(scoreValue));
    const key = getPlayerKey(name);
    const existing = byName.get(key);

    if (!existing || score > existing.score) {
      byName.set(key, { name, score });
    }
  });

  return Array.from(byName.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

function renderLeaderboard(highlightIdx = -1) {
  const lb = loadLeaderboard();
  lbHeader.textContent = lb.length ? "Top 10" : "No scores yet";
  if (!lb.length) {
    lbTable.innerHTML = "";
    return;
  }

  let html = "<tr><th>#</th><th>Name</th><th>Score</th></tr>";
  const top = lb.slice(0, 10);
  top.forEach((entry, i) => {
    const cls = i === highlightIdx ? " class=\"lb-highlight\"" : "";
    html += `<tr${cls}><td class="lb-rank">${i + 1}</td><td class="lb-name">${escHtml(entry.name)}</td><td class="lb-score">${entry.score}</td></tr>`;
  });
  lbTable.innerHTML = html;
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function resetInputState() {
  keyState.left = false;
  keyState.right = false;
  keyState.boost = false;
  keyState.slow = false;
  turnDir = 0;
  boosting = false;
  slowing = false;
}

function refreshMovementState() {
  turnDir = 0;
  if (keyState.left && !keyState.right) turnDir = -1;
  else if (keyState.right && !keyState.left) turnDir = 1;

  boosting = keyState.boost;
  slowing = keyState.slow && !keyState.boost;
}

function mapKey(key) {
  switch (key) {
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    case "ArrowUp":
    case "w":
    case "W":
      return "boost";
    case "ArrowDown":
    case "s":
    case "S":
      return "slow";
    default:
      return "";
  }
}

function init() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  dirAngle = 0;
  resetInputState();
  segments = [];
  for (let i = 0; i < INITIAL_LENGTH; i++) {
    segments.push({ x: cx - i * SEGMENT_DIST, y: cy });
  }
  score = 0;
  scoreEl.textContent = 0;
  placeFood();
}

function placeFood() {
  const margin = FOOD_RADIUS + 4;
  let attempts = 0;
  do {
    food = {
      x: margin + Math.random() * (canvas.width - margin * 2),
      y: margin + Math.random() * (canvas.height - margin * 2)
    };
    attempts++;
  } while (attempts < 50 && segments.some(s => {
    const dx = s.x - food.x;
    const dy = s.y - food.y;
    return dx * dx + dy * dy < (SNAKE_RADIUS + FOOD_RADIUS) * (SNAKE_RADIUS + FOOD_RADIUS);
  }));
}

function update(dt) {
  refreshMovementState();
  dirAngle += turnDir * TURN_SPEED * dt;

  const speed = boosting ? BOOST_SPEED : slowing ? SLOW_SPEED : SPEED;
  const head = segments[0];
  head.x += Math.cos(dirAngle) * speed * dt;
  head.y += Math.sin(dirAngle) * speed * dt;

  if (head.x < SNAKE_RADIUS || head.x > canvas.width - SNAKE_RADIUS ||
      head.y < SNAKE_RADIUS || head.y > canvas.height - SNAKE_RADIUS) {
    gameOver();
    return;
  }

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    const dx = prev.x - curr.x;
    const dy = prev.y - curr.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > SEGMENT_DIST) {
      curr.x = prev.x - (dx / dist) * SEGMENT_DIST;
      curr.y = prev.y - (dy / dist) * SEGMENT_DIST;
    }
  }

  let skipDist = 0;
  for (let i = 1; i < segments.length - 1; i++) {
    skipDist += SEGMENT_DIST;
    if (skipDist < SELF_COLLISION_SKIP) continue;
    const dx = head.x - segments[i].x;
    const dy = head.y - segments[i].y;
    if (dx * dx + dy * dy < (SNAKE_RADIUS * 1.4) * (SNAKE_RADIUS * 1.4)) {
      gameOver();
      return;
    }
  }

  const fdx = head.x - food.x;
  const fdy = head.y - food.y;
  if (fdx * fdx + fdy * fdy < (SNAKE_RADIUS + FOOD_RADIUS) * (SNAKE_RADIUS + FOOD_RADIUS)) {
    score++;
    scoreEl.textContent = score;
    const tail = segments[segments.length - 1];
    for (let i = 0; i < GROW_AMOUNT; i++) {
      segments.push({ x: tail.x, y: tail.y });
    }
    placeFood();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = segments.length - 1; i >= 0; i--) {
    const ratio = 1 - i / segments.length * 0.5;
    const r = i === 0 ? SNAKE_RADIUS + 2 : SNAKE_RADIUS * (0.6 + 0.4 * ratio);
    ctx.fillStyle = `rgb(${Math.round(0 * ratio)}, ${Math.round(230 * ratio)}, ${Math.round(118 * ratio)})`;
    ctx.beginPath();
    ctx.arc(segments[i].x, segments[i].y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const head = segments[0];
  const perpAngle = dirAngle + Math.PI / 2;
  const eyeForward = SNAKE_RADIUS * 0.35;
  const eyeSide = SNAKE_RADIUS * 0.4;
  const eyeR = 3;

  ctx.fillStyle = "#fff";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(
      head.x + Math.cos(dirAngle) * eyeForward + Math.cos(perpAngle) * eyeSide * side,
      head.y + Math.sin(dirAngle) * eyeForward + Math.sin(perpAngle) * eyeSide * side,
      eyeR, 0, Math.PI * 2
    );
    ctx.fill();
  }

  ctx.fillStyle = "#000";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(
      head.x + Math.cos(dirAngle) * (eyeForward + 1.5) + Math.cos(perpAngle) * eyeSide * side,
      head.y + Math.sin(dirAngle) * (eyeForward + 1.5) + Math.sin(perpAngle) * eyeSide * side,
      1.5, 0, Math.PI * 2
    );
    ctx.fill();
  }

  ctx.fillStyle = "#e65f4e";
  ctx.shadowColor = "#e65f4e";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(food.x, food.y, FOOD_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function stopLoop() {
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
}

function gameOver() {
  running = false;
  stopLoop();
  resetInputState();
  if (score > highScore) {
    highScore = score;
    highScoreEl.textContent = highScore;
    localStorage.setItem("snakeHigh", highScore);
  }
  panelTitle.textContent = "Game Over";
  statusText.textContent = `Score: ${score}`;
  finalScoreEl.textContent = `Final score: ${score}`;
  startBtn.textContent = "Play Again";
  gameOverSection.style.display = "flex";
  saveBtn.disabled = false;
  saveBtn.textContent = "Save Result";
  nameInput.value = "";
  lastSavedIndex = -1;
  renderLeaderboard(-1);
  setTimeout(() => nameInput.focus(), 100);
}

function saveResult() {
  if (saveBtn.disabled || lastSavedIndex !== -1) return;

  const name = getPlayerName(nameInput.value);
  const playerKey = getPlayerKey(name);
  const lb = loadLeaderboard();
  const existing = lb.find(entry => getPlayerKey(entry.name) === playerKey);
  const keepsPreviousBest = existing && score < existing.score;

  if (existing) {
    if (score >= existing.score) {
      existing.name = name;
      existing.score = score;
    }
  } else {
    lb.push({ name, score });
  }

  const normalized = normalizeLeaderboard(lb);
  saveLeaderboard(normalized);

  const idx = normalized.findIndex(entry => getPlayerKey(entry.name) === playerKey);
  lastSavedIndex = idx;
  saveBtn.disabled = true;
  saveBtn.textContent = keepsPreviousBest ? "Best Kept" : "Saved!";
  renderLeaderboard(idx);
}

function gameLoop(time) {
  if (!running) return;
  if (!lastTime) lastTime = time;
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  update(dt);
  if (running) {
    draw();
    animId = requestAnimationFrame(gameLoop);
  }
}

function start() {
  stopLoop();
  init();
  panelTitle.textContent = "Snake";
  statusText.textContent = "Playing";
  startBtn.textContent = "Restart";
  gameOverSection.style.display = "none";
  running = true;
  lastTime = null;
  animId = requestAnimationFrame(gameLoop);
}

function showWelcome() {
  panelTitle.textContent = "Snake";
  statusText.textContent = "Use arrow keys or WASD to steer";
  startBtn.textContent = "Start Game";
  gameOverSection.style.display = "none";
  renderLeaderboard();
}

function handleKeyDown(e) {
  if (document.activeElement === nameInput) return;

  const mapped = mapKey(e.key);
  if (!mapped) return;
  e.preventDefault();
  if (!running) return;

  keyState[mapped] = true;
  refreshMovementState();
}

function handleKeyUp(e) {
  const mapped = mapKey(e.key);
  if (!mapped) return;
  e.preventDefault();

  keyState[mapped] = false;
  refreshMovementState();
}

const savedHighScore = parseInt(localStorage.getItem("snakeHigh") || "0", 10);
highScore = Number.isFinite(savedHighScore) ? savedHighScore : 0;
highScoreEl.textContent = highScore;

saveBtn.addEventListener("click", saveResult);

nameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") saveResult();
  e.stopPropagation();
});

startBtn.addEventListener("click", start);
document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", handleKeyUp);

init();
draw();
showWelcome();
