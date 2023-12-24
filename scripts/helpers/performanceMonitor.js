export class PerformanceMonitor{
    constructor (canvas3d) {
        this.canvas3d = canvas3d;
        this.FPS_AVERAGE_INTERVAL_MAX = 30000;
        this.FPS_AVERAGE_INTERVAL_INCREASE = 100;
        this.FPS_AVERAGE_INTERVAL = 1000;
        this.TARGET_FPS = 70;
        this.FPS_THRESHOLD = 20;
        this.WANTS_TO_INCREASE_THRESHOLD = 10;
        this.wantsToIncrease = 0;
        this._timeSinceLastAverage = 0;
        this._framesSinceLastAverage = 0;
        this.intervalAverages = [];
        this.DEBUG = true;
        this.DEBUG_OUTPUT = document.querySelector("#chat-message");
        this.renderer = canvas3d.renderer;
        this._initialResolution = this.renderer.getPixelRatio();
    }

    update(delta) {
        delta*=1000;
        this._timeSinceLastAverage += delta;
        this._framesSinceLastAverage++;
        /*if (this.DEBUG) {
            this.DEBUG_OUTPUT.innerHTML = `Average FPS: ${this.intervalAverages.reduce((a, b) => a + b, 0) / this.intervalAverages.length}
            Last Average FPS: ${this.intervalAverages.at(-1)}`;
        }*/
        if (this._timeSinceLastAverage > this.FPS_AVERAGE_INTERVAL) {
            if(this.FPS_AVERAGE_INTERVAL < this.FPS_AVERAGE_INTERVAL_MAX) this.FPS_AVERAGE_INTERVAL += this.FPS_AVERAGE_INTERVAL_INCREASE;
            const fps = this._framesSinceLastAverage / (this._timeSinceLastAverage / 1000);
            this._framesSinceLastAverage = 0;
            this._timeSinceLastAverage = 0;
            this.intervalAverages.push(fps);
            if(fps < this.TARGET_FPS || fps > this.TARGET_FPS + this.FPS_THRESHOLD) this.updateDynamicResolution(fps < this.TARGET_FPS);
            if (this.intervalAverages.length > 10) this.intervalAverages.shift();
        }
    }

    updateDynamicResolution(decrease = true) {
        const ratio = this.renderer.getPixelRatio();
        if (decrease) {
            this.renderer.setPixelRatio(ratio - 0.1);
            this.canvas3d.resolutionMulti = ratio - 0.1;
        } else {
            this.wantsToIncrease++;
            if (this.wantsToIncrease < this.WANTS_TO_INCREASE_THRESHOLD) return;
            this.wantsToIncrease = 0;
            this.renderer.setPixelRatio(ratio + 0.1);
            this.canvas3d.resolutionMulti = ratio + 0.1;
        }


        if (this.DEBUG) {
            ChatMessage.create({
                content: `Dynamic Resolution: ${ratio} -> ${this.renderer.getPixelRatio()}<br>Because FPS: ${this.intervalAverages.at(-1)}`,
                speaker: ChatMessage.getSpeaker({ alias: "Canvas3D" }),
            });
        }
    }

}