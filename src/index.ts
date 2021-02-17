window.onload = () => {
    new Game('#canvas').invalidate();
};

class Game {
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
    }

    drop() {
        this._resizeObserver.disconnect();
    }

    invalidate() {
        if (this._requestAnimationFrameId === null) {
            this._requestAnimationFrameId = window.requestAnimationFrame(this._renderImpl);
        }
    }

    _renderImpl() {
        this._requestAnimationFrameId = null;
        const ctx = this._ctx;
        const clientWidth = ctx.canvas.width;
        const clientHeight = ctx.canvas.height;
        ctx.clearRect(0, 0, clientWidth, clientHeight);
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, clientWidth, clientHeight);
    }
}

