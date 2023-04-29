export class GradientPicker{
    constructor (colorEl1, colorEl2, gradients = []) {
        this.colorEl1 = colorEl1;
        this.colorEl2 = colorEl2;
        this.gradients = gradients.length ? gradients : this.defaultGradients;
        this.createEl();
    }

    createEl() {
        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.flexDirection = "row";
        div.style.justifyContent = "space-evenly";
        div.style.alignItems = "center";
        div.style.width = "100%";
        div.style.padding = "0.5rem";

        for(let i = 0; i < this.gradients.length; i++) {
            const gradient = this.gradients[i];
            const gradientEl = document.createElement("div");
            gradientEl.style.width = "2rem";
            gradientEl.style.height = "1rem";
            gradientEl.style.background = `linear-gradient(to right, ${gradient.color1}, ${gradient.color2})`;
            gradientEl.style.borderRadius = "0.25rem";
            gradientEl.style.margin = "0 0.25rem";
            gradientEl.style.cursor = "pointer";
            gradientEl.style.boxShadow = "0 0 2px black";
            gradientEl.dataset.index = i;
            gradientEl.addEventListener("click", (event) => {
                const index = event.currentTarget.dataset.index;
                this.colorEl1.value = this.gradients[index].color1;
                this.colorEl2.value = this.gradients[index].color2;
            });
            div.appendChild(gradientEl);
        }
        this.el = div;
        return div;
    }


    get defaultGradients() {
        return [
            {
                color1: "#ffcd42",
                color2: "#ff7b00",
            },
            {
                color1: "#1CB5E0",
                color2: "#000851",
            },
            {
                color1: "#FDBB2D",
                color2: "#3A1C71",
            },
            {
                color1: "#9ebd13",
                color2: "#008552",
            },
            {
                color1: "#d53369",
                color2: "#daae51",
            },
            {
                color1: "#f8ff00",
                color2: "#3ad59f",
            },
            {
                color1: "#fcff9e",
                color2: "#c67700",
            },
            {
                color1: "#ff930f",
                color2: "#fff95b",
            },
            {
                color1: "#a9ff68",
                color2: "#ff8989",
            },
            {
                color1: "#ebf4f5",
                color2: "#b5c6e0",
            },
            {
                color1: "#42047e",
                color2: "#07f49e",
            },
            {
                color1: "#f7ba2c",
                color2: "#ea5459",
            },
            {
                color1: "#95ecb0",
                color2: "#f3f98a",
            },






        ]
    }

    static create(colorEl1, colorEl2, gradients = []) {
        const cg = new GradientPicker(colorEl1, colorEl2, gradients);
        return cg.el;
    }
}