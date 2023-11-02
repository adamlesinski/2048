"use strict";
var game;
window.onload = () => {
    game = new Game('#canvas', '.undo', 4);
    game.invalidate();
};
const DEBUG_ANIMATION_MULTIPLIER = 1;
class AbstractGame {
    constructor(canvasSelector) {
        this._requestAnimationFrameId = null;
        const canvas = document.querySelector(canvasSelector);
        this._resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                this._ctx.canvas.width = entry.contentRect.width;
                this._ctx.canvas.height = entry.contentRect.height;
            }
            this.invalidate();
        });
        this._resizeObserver.observe(canvas);
        this._ctx = canvas.getContext('2d');
        this._renderImpl = this._renderImpl.bind(this);
        this._handleInput = this._handleInput.bind(this);
        window.addEventListener('keydown', this._handleInput);
    }
    drop() {
        this._resizeObserver.disconnect();
        window.removeEventListener('keydown', this._handleInput);
    }
    invalidate() {
        if (this._requestAnimationFrameId === null) {
            this._requestAnimationFrameId = window.requestAnimationFrame(this._renderImpl);
        }
    }
    _renderImpl(time) {
        this._requestAnimationFrameId = null;
        this.tick(time);
        this.render(this._ctx);
    }
    _handleInput(event) {
        this.handleInput(event);
    }
    tick(time) { }
    render(ctx) { }
    handleInput(event) { }
}
function newArray(size, init) {
    const array = new Array(size);
    for (let i = 0; i < array.length; i += 1) {
        array[i] = init();
    }
    return array;
}
class Grid {
    constructor(size, init) {
        this.size = size;
        this.rawData = new Array(size * size).fill(init);
        this._line = new Array(size);
    }
    get(x, y) {
        return this.rawData[(y * this.size) + x];
    }
    set(x, y, value) {
        this.rawData[(y * this.size) + x] = value;
    }
    contains(needle) {
        return this.rawData.indexOf(needle) !== -1;
    }
    forEachLine(direction, f) {
        let moved = false;
        switch (direction) {
            case 'left': {
                for (let y = 0; y < this.size; y += 1) {
                    for (let x = 0; x < this.size; x += 1) {
                        this._line[x] = this.get(x, y);
                    }
                    moved = f(this._line, 0, y, 1, 0) || moved;
                    for (let x = 0; x < this.size; x += 1) {
                        this.set(x, y, this._line[x]);
                    }
                }
                break;
            }
            case 'up': {
                for (let x = 0; x < this.size; x += 1) {
                    for (let y = 0; y < this.size; y += 1) {
                        this._line[y] = this.get(x, y);
                    }
                    moved = f(this._line, x, 0, 0, 1) || moved;
                    for (let y = 0; y < this.size; y += 1) {
                        this.set(x, y, this._line[y]);
                    }
                }
                break;
            }
            case 'right': {
                for (let y = 0; y < this.size; y += 1) {
                    for (let x = 0; x < this.size; x += 1) {
                        this._line[this.size - 1 - x] = this.get(x, y);
                    }
                    moved = f(this._line, this.size - 1, y, -1, 0) || moved;
                    for (let x = 0; x < this.size; x += 1) {
                        this.set(x, y, this._line[this.size - 1 - x]);
                    }
                }
                break;
            }
            case 'down': {
                for (let x = 0; x < this.size; x += 1) {
                    for (let y = 0; y < this.size; y += 1) {
                        this._line[this.size - 1 - y] = this.get(x, y);
                    }
                    moved = f(this._line, x, this.size - 1, 0, -1) || moved;
                    for (let y = 0; y < this.size; y += 1) {
                        this.set(x, y, this._line[this.size - 1 - y]);
                    }
                }
                break;
            }
        }
        return moved;
    }
}
function randomInt(min, max_exclusive) {
    return Math.floor(Math.random() * (max_exclusive - min)) + min;
}
function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function easeInOutBack(x) {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return x < 0.5
        ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
        : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
}
const animations = {
    'pulse': (tile, t) => tile.scale = 0.5 + (easeInOutBack(t) * 0.5),
    'slide': (tile, t) => tile.translation = 1.0 - easeOutBack(t),
    'slideAndMultiply': (tile, t) => {
        tile.translation = 1.0 - easeOutBack(t);
        if (t >= 0.5) {
            tile.overlayValue = null;
        }
    },
    'slideAndDisappear': (tile, t) => {
        tile.translation = 1.0 - easeOutBack(t);
        if (t === 1.0) {
            tile.visible = false;
        }
    },
    'disappear': (tile, t) => tile.visible = t === 1.0 ? false : true,
};
const COLORS = new Map([
    [2, '#c5e7e2ff'],
    [4, '#a1cda8ff'],
    [8, '#627264ff'],
    [16, '#c5e7e2ff'],
    [32, '#ad9baaff'],
    [64, '#8be8cbff'],
    [128, '#7ea2aaff'],
    [256, '#888da7ff'],
    [512, '#9c7a97ff'],
    [1024, '#da5552ff'],
    [2048, '#df7373ff'],
    [4096, '#a9e190ff'],
    [8192, '#a5aa52ff'],
    [16384, '#c589e8ff'],
]);
const OVERFLOW_COLOR = '#963d5aff';
class Tile {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.value = 0;
        // Animation
        this.animation = 'none';
        this.animationStart = 0;
        this.animationDuration = 0;
        // Animated properties
        this.translateX = 0;
        this.translateY = 0;
        this.translation = 0.0;
        this.scale = 1.0;
        this.visible = true;
        this.overlayValue = null;
    }
    cancelPreviousAnimation() {
        if (this.animation === 'none') {
            return;
        }
        animations[this.animation](this, 1.0);
        this.animation = 'none';
    }
    animateSlide(now, dx, dy) {
        this.cancelPreviousAnimation();
        this.animation = 'slide';
        this.animationStart = now;
        this.animationDuration = 100 * (Math.max(Math.abs(dx), Math.abs(dy))) * DEBUG_ANIMATION_MULTIPLIER;
        this.translateX = dx;
        this.translateY = dy;
        this.translation = 1.0;
    }
    animateSlideAndMultiply(now, dx, dy, value) {
        this.cancelPreviousAnimation();
        this.animation = 'slideAndMultiply';
        this.animationStart = now;
        this.animationDuration = 100 * (Math.max(Math.abs(dx), Math.abs(dy))) * DEBUG_ANIMATION_MULTIPLIER;
        this.translateX = dx;
        this.translateY = dy;
        this.translation = 1.0;
        this.overlayValue = value;
    }
    animatePulse(now) {
        this.cancelPreviousAnimation();
        this.animation = 'pulse';
        this.animationStart = now;
        this.animationDuration = 300 * DEBUG_ANIMATION_MULTIPLIER;
        this.scale = 0.0;
    }
    animateDisappear(now) {
        this.cancelPreviousAnimation();
        this.animation = 'disappear';
        this.animationStart = now;
        this.animationDuration = 300 * DEBUG_ANIMATION_MULTIPLIER;
        this.visible = true;
    }
    animateSlideAndDisappear(now, dx, dy) {
        this.cancelPreviousAnimation();
        this.animation = 'slideAndDisappear';
        this.animationStart = now;
        this.animationDuration = 100 * (Math.max(Math.abs(dx), Math.abs(dy))) * DEBUG_ANIMATION_MULTIPLIER;
        this.translateX = dx;
        this.translateY = dy;
        this.translation = 1.0;
        this.visible = true;
    }
}
class Game extends AbstractGame {
    constructor(canvasSelector, undoButtonSelector, gridSize) {
        super(canvasSelector);
        this._gameOver = false;
        this._canUndo = false;
        this._nextRenderTile = 0;
        this.moveColumn = this.moveColumn.bind(this);
        this._renderTiles = newArray(gridSize * gridSize * 2, () => new Tile());
        this._grid = new Grid(gridSize, 0);
        this._previousGrid = new Grid(gridSize, 0);
        this.reset();
        document.querySelectorAll(undoButtonSelector).forEach((button) => {
            button.addEventListener('click', (_event) => this.undo());
        });
    }
    reset() {
        this._grid.rawData.fill(0);
        this._canUndo = false;
        this._nextRenderTile = 0;
        this.dropTile(2);
        this.dropTile(2);
    }
    move(direction) {
        this._nextRenderTile = 0;
        this._copyGrid();
        const moved = this._grid.forEachLine(direction, this.moveColumn);
        if (moved) {
            this.dropTile(2);
            if (!this._gameOver && this.checkGameOver()) {
                this._gameOver = true;
                document.querySelector('.game-over').classList.add('enabled');
            }
        }
        this.invalidate();
    }
    undo() {
        if (!this._canUndo) {
            return;
        }
        for (let i = 0; i < this._grid.rawData.length; i++) {
            this._grid.rawData[i] = this._previousGrid.rawData[i];
        }
        this._canUndo = false;
        this._nextRenderTile = 0;
        const now = performance.now();
        for (let y = 0; y < this._grid.size; y++) {
            for (let x = 0; x < this._grid.size; x++) {
                const value = this._grid.get(x, y);
                if (value > 0) {
                    const tile = this.newRenderTile(x, y);
                    tile.value = value;
                    tile.animatePulse(now);
                }
            }
        }
        document.querySelectorAll('.undo').forEach((button) => button.setAttribute('disabled', 'true'));
        document.querySelector('.game-over').classList.remove('enabled');
        this.invalidate();
    }
    _copyGrid() {
        for (let i = 0; i < this._grid.rawData.length; i++) {
            this._previousGrid.rawData[i] = this._grid.rawData[i];
        }
        this._canUndo = true;
        document.querySelectorAll('.undo').forEach((button) => button.removeAttribute('disabled'));
    }
    moveColumn(column, originX, originY, dx, dy) {
        const now = performance.now();
        let moved = false;
        let wall = 0;
        while (true) {
            // Find the first non-zero tile.
            let first = wall;
            while (first < column.length && column[first] === 0) {
                first += 1;
            }
            if (first === column.length) {
                // No tiles remaining in this column.
                return moved;
            }
            // Find the second non-zero tile.
            let second = first + 1;
            while (second < column.length && column[second] === 0) {
                second += 1;
            }
            if (second === column.length) {
                // Only the first tile was found. Slide it to the wall if not already there.
                const tile = this.newRenderTile(originX + (wall * dx), originY + (wall * dy));
                tile.value = column[first];
                if (first !== wall) {
                    column[wall] = column[first];
                    column[first] = 0;
                    tile.animateSlide(now, (first - wall) * dx, (first - wall) * dy);
                    return true;
                }
                return moved;
            }
            if (column[first] === column[second]) {
                // Two tiles match, slide them both to the wall and merge.
                const bottomTile = this.newRenderTile(originX + (wall * dx), originY + (wall * dy));
                bottomTile.value = column[first];
                column[wall] = column[first] * 2;
                if (wall !== first) {
                    column[first] = 0;
                    bottomTile.animateSlideAndDisappear(now, (first - wall) * dx, (first - wall) * dy);
                }
                else {
                    bottomTile.animateDisappear(now);
                }
                const topTile = this.newRenderTile(originX + (wall * dx), originY + (wall * dy));
                topTile.value = column[wall];
                topTile.animateSlideAndMultiply(now, (second - wall) * dx, (second - wall) * dy, column[second]);
                column[second] = 0;
                moved = true;
            }
            else {
                // No match. Slide the first tile anyways.
                const tile = this.newRenderTile(originX + (wall * dx), originY + (wall * dy));
                tile.value = column[first];
                if (first !== wall) {
                    column[wall] = column[first];
                    column[first] = 0;
                    tile.animateSlide(now, (first - wall) * dx, (first - wall) * dy);
                    moved = true;
                }
            }
            // Move the virtual wall to just after the last slid tile.
            wall += 1;
        }
    }
    newRenderTile(x, y) {
        const tile = this._renderTiles[this._nextRenderTile];
        this._nextRenderTile += 1;
        tile.x = x;
        tile.y = y;
        tile.animation = 'none';
        tile.scale = 1.0;
        tile.translation = 0.0;
        tile.visible = true;
        tile.overlayValue = null;
        return tile;
    }
    dropTile(value) {
        // Check to see if there is an open space.
        const rawData = this._grid.rawData;
        const start = randomInt(0, rawData.length);
        for (let i = 0; i < rawData.length; i += 1) {
            const idx = (i + start) % rawData.length;
            if (rawData[idx] === 0) {
                rawData[idx] = value;
                const tile = this.newRenderTile(idx % this._grid.size, Math.floor(idx / this._grid.size));
                tile.value = value;
                tile.animatePulse(performance.now());
                this.invalidate();
                return true;
            }
        }
        return false;
    }
    checkGameOver() {
        const grid = this._grid;
        for (let y = 0; y < grid.size; y += 1) {
            for (let x = 0; x < grid.size; x += 1) {
                const thisTile = grid.get(x, y);
                if (thisTile === 0
                    || (x + 1 < grid.size && thisTile === grid.get(x + 1, y))
                    || (y + 1 < grid.size && thisTile === grid.get(x, y + 1))) {
                    return false;
                }
            }
        }
        return true;
    }
    tick(time) {
        let requestFrame = false;
        for (let i = 0; i < this._nextRenderTile; i += 1) {
            const tile = this._renderTiles[i];
            if (tile.animation === 'none') {
                continue;
            }
            const elapsed = time - tile.animationStart;
            const progress = Math.max(0.0, Math.min(1.0, elapsed / tile.animationDuration));
            animations[tile.animation](tile, progress);
            if (progress === 1.0) {
                tile.animation = 'none';
            }
            else {
                requestFrame = true;
            }
        }
        if (requestFrame) {
            this.invalidate();
        }
    }
    render(ctx) {
        const clientWidth = ctx.canvas.width;
        const clientHeight = ctx.canvas.height;
        const tileSize = Math.floor(Math.min((clientWidth / this._grid.size), (clientHeight / this._grid.size)));
        const halfTile = Math.floor(tileSize * 0.5);
        ctx.clearRect(0, 0, clientWidth, clientHeight);
        ctx.save();
        ctx.strokeStyle = '0.5px solid black';
        ctx.font = `${halfTile}px Verdana`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < this._nextRenderTile; i += 1) {
            const tile = this._renderTiles[i];
            const value = tile.overlayValue || tile.value;
            if (tile.visible) {
                ctx.save();
                ctx.fillStyle = COLORS.get(value) || OVERFLOW_COLOR;
                ctx.beginPath();
                ctx.translate((tile.x * tileSize) + halfTile, (tile.y * tileSize) + halfTile);
                ctx.translate(tile.translation * (tile.translateX * tileSize), tile.translation * (tile.translateY * tileSize));
                ctx.scale(tile.scale, tile.scale);
                ctx.rect(-halfTile, -halfTile, tileSize, tileSize);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.fillStyle = 'black';
                ctx.fillText(value.toString(), 0, 0, tileSize);
                ctx.restore();
            }
        }
        ctx.restore();
    }
    handleInput(event) {
        switch (event.keyCode) {
            case 37:
                // Left
                event.preventDefault();
                this.move('left');
                break;
            case 38:
                // Up
                event.preventDefault();
                this.move('up');
                break;
            case 39:
                // Right
                event.preventDefault();
                this.move('right');
                break;
            case 40:
                // Down
                event.preventDefault();
                this.move('down');
                break;
            case 32:
                // Space
                event.preventDefault();
                if (this._gameOver) {
                    this.reset();
                    document.querySelector('.game-over').classList.remove('enabled');
                }
                break;
        }
    }
}
//# sourceMappingURL=index.js.map