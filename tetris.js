const COLS = 10,
    ROWS = 20;
const BOARD_W = 320,
    BOARD_H = 640;
const TILE = BOARD_W / COLS;

const COLORS = {
    I: '#00E5FF',
    O: '#F4E409',
    T: '#A974FF',
    S: '#5DFC8A',
    Z: '#FF6B6B',
    J: '#4DABF7',
    L: '#FFB86B',
    ghost: 'rgba(255,255,255,0.25)'
};

const SHAPES = {
    I: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    J: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    L: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
    ],
    O: [
        [1, 1],
        [1, 1]
    ],
    S: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
    ],
    T: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
    ],
    Z: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
    ]
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');

let board, bag, nextType, current;
let dropCounter, dropInterval, lastTime;
let paused = false,
    playing = false;

const ui = {
    score: document.getElementById('score'),
    lines: document.getElementById('lines'),
    level: document.getElementById('level'),
    speed: document.getElementById('speed'),
    overlay: document.getElementById('overlay'),
    startBtn: document.getElementById('startBtn')
};

const scoreState = {
    score: 0,
    lines: 0,
    level: 0
};

function createMatrix(w, h) {
    const m = [];
    while (h--) m.push(new Array(w).fill(0));
    return m;
}

function copyMatrix(m) {
    return m.map(r => r.slice());
}

function rndBag() {
    const types = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
    }
    return types;
}

function takeFromBag() {
    if (bag.length === 0) bag = rndBag();
    return bag.pop();
}

function createPiece(type) {
    return {
        type,
        matrix: copyMatrix(SHAPES[type]),
        x: Math.floor(COLS / 2) - Math.ceil(SHAPES[type][0].length / 2),
        y: -getTopOffset(SHAPES[type])
    };
}

function getTopOffset(matrix) {
    let off = 0;
    for (let r = 0; r < matrix.length; r++) {
        if (matrix[r].some(v => v)) break;
        off++;
    }
    return off;
}

function rotate(matrix, dir) {
    const N = matrix.length;
    const res = createMatrix(N, N);
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            res[x][N - 1 - y] = matrix[y][x];
        }
    }
    if (dir < 0) {
        return rotate(res, 1);
    }
    return res;
}

function collides(board, piece) {
    const m = piece.matrix;
    for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[y].length; x++) {
            if (m[y][x]) {
                const px = piece.x + x,
                    py = piece.y + y;
                if (px < 0 || px >= COLS || py >= ROWS) return true;
                if (py >= 0 && board[py][px]) return true;
            }
        }
    }
    return false;
}

function merge(board, piece) {
    piece.matrix.forEach((row, y) => {
        row.forEach((v, x) => {
            if (v) {
                const py = piece.y + y;
                if (py >= 0) board[py][piece.x + x] = piece.type;
            }
        });
    });
}

function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(v => v !== 0)) {
            board.splice(y, 1);
            board.unshift(new Array(COLS).fill(0));
            cleared++;
            y++;
        }
    }
    if (cleared > 0) {
        const table = [0, 100, 300, 500, 800];
        scoreState.score += table[cleared] * (scoreState.level + 1);
        scoreState.lines += cleared;
        if (scoreState.lines >= (scoreState.level + 1) * 10) {
            scoreState.level++;
            updateSpeed();
        }
        updateUI();
    }
}

function updateSpeed() {
    dropInterval = Math.max(80, Math.floor(1000 * Math.pow(0.92, scoreState.level)));
    ui.speed.textContent = (1000 / dropInterval).toFixed(1) + 'x';
}

function updateUI() {
    ui.score.textContent = scoreState.score.toLocaleString('pt-BR');
    ui.lines.textContent = scoreState.lines;
    ui.level.textContent = scoreState.level;
}

function drawCell(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
}

function drawBoard() {
    if (!board) return;
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (board[y] && board[y][x]) drawCell(x, y, COLORS[board[y][x]]);
        }
    }
    if (current) drawPiece(current);
}

function drawPiece(piece) {
    piece.matrix.forEach((row, y) => {
        row.forEach((v, x) => {
            if (v) {
                const px = piece.x + x,
                    py = piece.y + y;
                if (py >= 0) drawCell(px, py, COLORS[piece.type]);
            }
        });
    });
}

function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextType) return;
    const m = SHAPES[nextType];
    for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[y].length; x++) {
            if (m[y][x]) {
                nextCtx.fillStyle = COLORS[nextType];
                nextCtx.fillRect(x * 20, y * 20, 20, 20);
            }
        }
    }
}

function playerMove(dir) {
    if (!playing || paused) return;
    current.x += dir;
    if (collides(board, current)) current.x -= dir;
}

function playerDrop() {
    if (!playing || paused) return;
    current.y++;
    if (collides(board, current)) {
        current.y--;
        lockPiece();
    }
}

function hardDrop() {
    if (!playing || paused) return;
    while (!collides(board, {
        ...current,
        y: current.y + 1
    })) {
        current.y++;
        scoreState.score += 2;
    }
    lockPiece();
    updateUI();
}

function tryRotate(dir) {
    if (!playing || paused) return;
    const rotated = rotate(padToSquare(current.matrix), dir);
    const oldX = current.x;
    current.matrix = rotated;
    if (collides(board, current)) {
        current.x = oldX;
        current.matrix = rotate(rotated, -dir);
    }
}

function padToSquare(m) {
    const N = Math.max(m.length, m[0].length);
    const sq = createMatrix(N, N);
    for (let y = 0; y < m.length; y++)
        for (let x = 0; x < m[0].length; x++) sq[y][x] = m[y][x];
    return sq;
}

function lockPiece() {
    merge(board, current);
    clearLines();
    spawnPiece();
    if (collides(board, current)) {
        gameOver();
    }
}

function spawnPiece() {
    if (nextType === null) nextType = takeFromBag();
    const type = nextType;
    nextType = takeFromBag();
    current = createPiece(type);
    drawNext();
}

function gameOver() {
    playing = false;
    ui.overlay.classList.add('active');
}

function reset() {
    board = createMatrix(COLS, ROWS);
    bag = [];
    scoreState.score = 0;
    scoreState.lines = 0;
    scoreState.level = 0;
    updateUI();
    updateSpeed();
    nextType = null;
    spawnPiece();
    drawBoard();
    drawNext();
}

function update(time = 0) {
    const dt = time - lastTime;
    lastTime = time;
    if (playing && !paused) {
        dropCounter += dt;
        if (dropCounter > dropInterval) {
            dropCounter = 0;
            current.y++;
            if (collides(board, current)) {
                current.y--;
                lockPiece();
            }
        }
    }
    drawBoard();
    requestAnimationFrame(update);
}

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'ArrowLeft':
            playerMove(-1);
            break;
        case 'ArrowRight':
            playerMove(1);
            break;
        case 'ArrowDown':
            playerDrop();
            scoreState.score++;
            updateUI();
            break;
        case 'ArrowUp':
            tryRotate(1);
            break;
        case 'KeyX':
            tryRotate(1);
            break;
        case 'KeyZ':
            tryRotate(-1);
            break;
        case 'Space':
            hardDrop();
            break;
        case 'KeyP':
            paused = !paused;
            break;
        case 'KeyR':
            startGame();
            break;
    }
});

ui.startBtn.addEventListener('click', startGame);

function startGame() {
    reset();
    paused = false;
    playing = true;
    dropCounter = 0;
    lastTime = performance.now();
    ui.overlay.classList.remove('active');
}

update();