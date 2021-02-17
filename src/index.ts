var game;
window.onload = () => {
    game = new Game('#canvas', 4);
    game.invalidate();
};

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

    constructor(size: number, init: T) {
        this.size = size;
        this.rawData = new Array(size * size).fill(init);
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

    contains(value: T): boolean {
        for (const v of this.rawData) {
            if (v == value) {
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

function randomInt(min: number, max_exclusive: number) {
    return Math.floor(Math.random() * (max_exclusive - min)) + min;
}

class TileAnimation {
    running: boolean = false;

    tick(time: number) {

    }
}

const transforms = {
    'left': (grid: Grid<number>) => grid.transpose().reverseColumns(),
    'up': (grid: Grid<number>) => grid.reverseRows().reverseColumns(),
    'right': (grid: Grid<number>) => grid.transpose().reverseRows(),
    'down': (grid: Grid<number>) => {},
};

const inverseTransforms = {
    'left': transforms['right'],
    'up': transforms['up'],
    'right': transforms['left'],
    'down': transforms['down'],
};

class Game extends AbstractGame {
    private _grid: Grid<number>;
    private _gameOver: boolean = false;
    private _animations: Grid<TileAnimation>;

    constructor(canvasSelector: string, gridSize: number) {
        super(canvasSelector);
        this._grid = new Grid(gridSize, 0);
        this._animations = new Grid(gridSize, new TileAnimation());
        this.dropTile(2);
        this.dropTile(2);
    }

    move(direction: 'left' | 'up' | 'right' | 'down') {
        let moves = false;
        transforms[direction](this._grid);
        for (let x = 0; x < this._grid.size; x += 1) {
            let lastTileY = this._grid.size - 1;
            let currentTileY = lastTileY - 1;
            while (currentTileY >= 0 && lastTileY >= 0) {
                const currentTile = this._grid.get(x, currentTileY);
                const lastTile = this._grid.get(x, lastTileY);
                if (currentTile > 0) {
                    if (lastTile === 0) {
                        // Slide into empty
                        this._grid.set(x, lastTileY, currentTile);
                        this._grid.set(x, currentTileY, 0);
                        currentTileY -= 1;
                        moves = true;
                    } else if (lastTile === currentTile) {
                        // Multiply
                        this._grid.set(x, lastTileY, currentTile * 2);
                        this._grid.set(x, currentTileY, 0);
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
        } else if (!this._grid.contains(0)) {
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
            if (rawData[idx] === 0) {
                rawData[idx] = value;
                return true;
            }
        }
        return false;
    }

    render(ctx: CanvasRenderingContext2D) {
        const clientWidth = ctx.canvas.width;
        const clientHeight = ctx.canvas.height;
        const tileSize = Math.floor(Math.min((clientWidth / this._grid.size), (clientHeight / this._grid.size)));
        const halfTile = Math.floor(tileSize * 0.5);
        ctx.clearRect(0, 0, clientWidth, clientHeight);

        ctx.save();
        ctx.strokeStyle = '1px solid black';
        ctx.fillStyle = 'red';
        ctx.beginPath();
        for (let y = 0; y < this._grid.size; y += 1) {
            for (let x = 0; x < this._grid.size; x += 1) {
                switch (this._grid.get(x, y)) {
                    case 0: break;
                    default: {
                        ctx.rect(x * tileSize, y * tileSize, tileSize, tileSize);
                        break;
                    }
                }
            }
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = 'black';
        ctx.font = '78pt Verdana';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.beginPath();
        for (let y = 0; y < this._grid.size; y += 1) {
            for (let x = 0; x < this._grid.size; x += 1) {
                const tile = this._grid.get(x, y);
                if (tile > 0) {
                    const centerX = (x * tileSize) + halfTile;
                    const centerY = (y * tileSize) + halfTile;
                    ctx.fillText(tile.toString(), centerX, centerY, tileSize);
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

