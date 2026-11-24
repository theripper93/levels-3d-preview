import { Sky } from "../../three/Sky.js";

export default {
    id: "realistic",
    order: 0,
    createDome: () => new Sky(),
};
