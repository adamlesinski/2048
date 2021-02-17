var game;
window.onload = () => {
    game = new Game('#canvas', 4);
    game.invalidate();
};

const DEBUG_ANIMATION_MULTIPLIER = 10;

class AbstractGame {
    private _ctx: CanvasRenderingContext2D;
    private _requestAnimationFrameId: number | null = null;
    private _resizeObserver: ResizeObserver;

    constructor(canvasSelector: string) {
        const canvas = document.querySelector(canvasSelector)! as HTMLCanvasElement;
        this._resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                this._ctx.canvas.width = entry.borderBoxSize[0].inlineSize;
                this._ctx.canvas.height = entry.borderBoxSize[0].blockSize;
            }
            this.invalidate();
        });
        this._resizeObserver.observe(canvas);
        this._ctx = canvas.getContext('2d')!;
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

    private _renderImpl(time: number) {
        this._requestAnimationFrameId = null;
        this.tick(time);
        this.render(this._ctx);
    }

    private _handleInput(event: KeyboardEvent) {
        this.handleInput(event);
    }

    protected tick(time: number) {}
    protected render(ctx: CanvasRenderingContext2D) {}
    protected handleInput(event: KeyboardEvent) {}
}

class Grid<T> {
    rawData: T[];
    readonly size: number;

    constructor(size: number, init: () => T) {
        this.size = size;
        this.rawData = new Array(size * size);
        for (let i = 0; i < this.rawData.length; i += 1) {
            this.rawData[i] = init();
        }
    }

    get(x: number, y: number): T {
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
            throw new Error(`Index out of bounds (${x}, ${y})`);
        }
        return this.rawData[(y * this.size) + x];
    }

    set(x: number, y: number, value: T) {
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
            throw new Error(`Index out of bounds (${x}, ${y})`);
        }
        this.rawData[(y * this.size) + x] = value;
    }

    contains(pred: (v: T) => boolean): boolean {
        for (const v of this.rawData) {
            if (pred(v)) {
                return true;
            }
        }
        return false;
    }

    transpose() {
        for (let y = 0; y <= this.size; y += 1) {
            for (let x = y; x < this.size; x += 1) {
                const tmp = this.get(x, y);
                this.set(x, y, this.get(y, x));
                this.set(y, x, tmp);
            }
        }
        return this;
    }
    
    reverseColumns() {
        const pivot = Math.floor(this.size * 0.5);
        for (let x = 0; x < this.size; x += 1) {
            for (let y = 0; y < pivot; y += 1) {
                const tmp = this.get(x, y);
                this.set(x, y, this.get(x, this.size - y - 1));
                this.set(x, this.size - y - 1, tmp);
            }
        }
        return this;
    }
    
    reverseRows() {
        const pivot = Math.floor(this.size * 0.5);
        for (let y = 0; y < this.size; y += 1) {
            for (let x = 0; x < pivot; x += 1) {
                const tmp = this.get(x, y);
                this.set(x, y, this.get(this.size - x - 1, y));
                this.set(this.size - x - 1, y, tmp);
            }
        }
        return this;
    }
}

type Direction = 'left' | 'up' | 'right' | 'down';

function randomInt(min: number, max_exclusive: number) {
    return Math.floor(Math.random() * (max_exclusive - min)) + min;
}

function easeOutBack(x: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function easeInOutBack(x: number): number {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    
    return x < 0.5
      ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
      : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
}

type AnimationKind = 'none' | 'pulse' | 'slide' | 'slideAndMultiply' | 'disappear';

const animations = {
    'pulse': (tile: Tile, t: number) => tile.scale = 0.5 + (easeInOutBack(t) * 0.5),
    'slide': (tile: Tile, t: number) => tile.translation = 1.0 - easeOutBack(t),
    'slideAndMultiply': (tile: Tile, t: number) => {
        tile.translation = 1.0 - easeOutBack(t);
        if (t >= 0.5) {
            tile.animatingValue = null;
        }
    },
    'disappear': (tile: Tile, t: number) => {
        if (t === 1.0) {
            tile.animatingValue = null;
            tile.translation = 0.0;
        }
    }
};

class Tile {
    animation: AnimationKind = 'none';
    animationStart: number = 0;
    animationDuration: number = 0;

    translateX: number = 0;
    translateY: number = 0;
    translation: number = 0.0;
    scale: number = 1.0;

    value: number;
    animatingValue: number | null;

    constructor(value: number) {
        this.value = value;
        this.animatingValue = null;
    }

    cancelPreviousAnimation() {
        if (this.animation === 'none') {
            return;
        }
        animations[this.animation](this, 1.0);
        this.animation = 'none';
    }

    animateSlide(now: number, direction: Direction, amount: number) {
        this.cancelPreviousAnimation();
        this.animation = 'slide';
        this.animationStart = now;
        this.animationDuration = 300 * DEBUG_ANIMATION_MULTIPLIER;
        this.translateX = this.translateY = 0;
        this.translation = 1.0;
        switch (direction) {
            case 'left': this.translateX = amount; break;
            case 'up': this.translateY = amount; break;
            case 'right': this.translateX = -amount; break;
            case 'down': this.translateY = -amount; break;
        }
    }

    animateSlideAndMultiply(now: number, direction: Direction, amount: number, value: number) {
        this.cancelPreviousAnimation();
        this.animation = 'slideAndMultiply';
        this.animationStart = now;
        this.animationDuration = 300 * DEBUG_ANIMATION_MULTIPLIER;
        this.translateX = this.translateY = 0;
        this.translation = 1.0;
        switch (direction) {
            case 'left': this.translateX = amount; break;
            case 'up': this.translateY = amount; break;
            case 'right': this.translateX = -amount; break;
            case 'down': this.translateY = -amount; break;
        }
        this.animatingValue = value;
    }

    animatePulse(now: number) {
        this.cancelPreviousAnimation();
        this.animation = 'pulse';
        this.animationStart = now;
        this.animationDuration = 300 * DEBUG_ANIMATION_MULTIPLIER;
        this.scale = 0.0;
    }

    animateDisappear(now: number, direction: Direction, amount: number, value: number) {
        this.cancelPreviousAnimation();
        this.animation = 'disappear';
        this.animationStart = now;
        this.animationDuration = 300 * DEBUG_ANIMATION_MULTIPLIER;
        this.translateX = this.translateY = 0;
        this.translation = 1.0;
        switch (direction) {
            case 'left': this.translateX = amount; break;
            case 'up': this.translateY = amount; break;
            case 'right': this.translateX = -amount; break;
            case 'down': this.translateY = -amount; break;
        }
        this.animatingValue = value;
    }
}

const transforms = {
    'left': (grid: Grid<any>) => grid.transpose().reverseColumns(),
    'up': (grid: Grid<any>) => grid.reverseRows().reverseColumns(),
    'right': (grid: Grid<any>) => grid.transpose().reverseRows(),
    'down': (grid: Grid<any>) => {},
};

const inverseTransforms = {
    'left': transforms['right'],
    'up': transforms['up'],
    'right': transforms['left'],
    'down': transforms['down'],
};

class Game extends AbstractGame {
    private _grid: Grid<Tile>;
    private _gameOver: boolean = false;

    constructor(canvasSelector: string, gridSize: number) {
        super(canvasSelector);
        this._grid = new Grid(gridSize, () => new Tile(0));
        this.dropTile(2);
        this.dropTile(2);
    }

    move(direction: Direction) {
        const now = performance.now();
        let moves = false;
        transforms[direction](this._grid);
        for (let x = 0; x < this._grid.size; x += 1) {
            let lastTileY = this._grid.size - 1;
            let currentTileY = lastTileY - 1;
            while (currentTileY >= 0 && lastTileY >= 0) {
                const currentTile = this._grid.get(x, currentTileY);
                const lastTile = this._grid.get(x, lastTileY);
                if (currentTile.value > 0) {
                    if (lastTile.value === 0) {
                        // Slide into empty
                        lastTile.value = currentTile.value;
                        currentTile.value = 0;
                        lastTile.animateSlide(now, direction, lastTileY - currentTileY);
                        currentTileY -= 1;
                        moves = true;
                    } else if (lastTile.value === currentTile.value) {
                        // Multiply
                        lastTile.value = lastTile.value * 2;
                        lastTile.animateSlideAndMultiply(now, direction, lastTileY - currentTileY, currentTile.value);
                        currentTile.animateDisappear(now, direction, currentTileY - lastTileY, currentTile.value);
                        currentTile.value = 0;
                        currentTileY -= 1;
                        lastTileY -= 1;
                        moves = true;
                    } else {
                        // Immoveable
                        lastTileY -= 1;
                        if (lastTileY === currentTileY) {
                            currentTileY -= 1;
                        }
                    }
                } else {
                    // Empty
                    currentTileY -= 1;
                }
            }
        }
        inverseTransforms[direction](this._grid);

        if (moves) {
            this.dropTile(2);
        } else if (!this._grid.contains(tile => tile.value === 0)) {
            this._gameOver = true;
        }
        this.invalidate();
    }

    dropTile(value: number) {
        // Check to see if there is an open space.
        const rawData = this._grid.rawData;
        const start = randomInt(0, rawData.length);
        for (let i = 0; i < rawData.length; i += 1) {
            const idx = (i + start) % rawData.length;
            if (rawData[idx].value === 0) {
                rawData[idx].value = value;
                rawData[idx].animatePulse(performance.now());
                this.invalidate();
                return true;
            }
        }
        return false;
    }

    tick(time: number) {
        let requestFrame = false;
        for (const tile of this._grid.rawData) {
            if (tile.animation === 'none') {
                continue;
            }
            const elapsed = time - tile.animationStart;
            const progress = Math.max(0.0, Math.min(1.0, elapsed / tile.animationDuration));
            animations[tile.animation](tile, progress);
            if (progress === 1.0) {
                tile.animation = 'none';
            } else {
                requestFrame = true;
            }
        }
        if (requestFrame) {
            this.invalidate();
        }
    }

    render(ctx: CanvasRenderingContext2D) {
        const clientWidth = ctx.canvas.width;
        const clientHeight = ctx.canvas.height;
        const tileSize = Math.floor(Math.min((clientWidth / this._grid.size), (clientHeight / this._grid.size)));
        const halfTile = Math.floor(tileSize * 0.5);
        ctx.clearRect(0, 0, clientWidth, clientHeight);

        ctx.save();
        ctx.strokeStyle = '1px solid black';
        ctx.font = '78pt Verdana';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let y = 0; y < this._grid.size; y += 1) {
            for (let x = 0; x < this._grid.size; x += 1) {
                const tile = this._grid.get(x, y);
                if (tile.value > 0 || tile.animatingValue) {
                    ctx.save();
                    ctx.fillStyle = 'red';
                    ctx.beginPath();
                    ctx.translate((x * tileSize) + halfTile, (y * tileSize) + halfTile);
                    ctx.translate(tile.translation * (tile.translateX * tileSize), tile.translation * (tile.translateY * tileSize));
                    ctx.scale(tile.scale, tile.scale);
                    ctx.rect(-halfTile, -halfTile, tileSize, tileSize);
                    ctx.fill();
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.fillStyle = 'black';
                    if (tile.animatingValue !== null) {
                        ctx.fillText(tile.animatingValue.toString(), 0, 0, tileSize);
                    } else {
                        ctx.fillText(tile.value.toString(), 0, 0, tileSize);
                    }
                    ctx.restore();
                }
            }
        }
        ctx.restore();
    }

    handleInput(event: KeyboardEvent) {
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
        }
    }
}

