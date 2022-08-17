/*Example

export const GettingStartedTour = () => { return new GenericTour("your-tour-id", [
    `myselector1`,
    `#myselector2`, //Only the selectors are needed in this list
    `.my-button`, //Steps are computed in order so your selector number 2 in the array will be the "step-2" in the localization
],
{
    moduleId: "yourmoduleid",
    localizationRoot: "root of your tours localization",
    display: true,
    restricted: false,
    autoRegister: true,
    requires: () => { // Optional function to check if the tour should be displayed. Return true to display. False to cancel.}
        //You can use this to check if the user has a module installed or a window open.
    init: () => { // Optional function to run when the tour is initialized.}
        //You can use this to open a window or perform any kind of operation.
})}

example localization file

"localizationRoot": {
    "your-tour-id":
        {
            "title": "My Tour",
            "description": "This is my tour.",
            "step-0": {
                "title": "Step 1",
                "content": "Do something."
            },
            "step-1": {
                "title": "Step 2",
                "content": "Do something else."
            }
            .......
            "step-n": {
                "title": "My final step",
                "content": "Do something else."
            }
        }
} 

*/

export class GenericTour{
    constructor(tourId, selectors, {moduleId = "", localizationRoot = "", display = true, restricted = true, autoRegister = true, init = ()=>{}, onComplete = ()=>{}, requires = ()=>{ return true }}){
        this.id = tourId;
        this.moduleId = moduleId;
        this.localizationRoot = localizationRoot;
        const steps = selectors.map((step, index) => this.createStep(`step-${index}`, step));
    
        this._tourData = {
            title: game.i18n.localize(`${this.localizationRoot}.${this.id}.title`),
            description: game.i18n.localize(`${this.localizationRoot}.${this.id}.description`),
            display: display,
            restricted: restricted,
            steps : steps,
        }

        this._tour = new TourEnhanced(this._tourData);
        this._tour.localizationRoot = this.localizationRoot;
        this._tour.moduleId = this.moduleId;
        this._tour.tourId = this.id;
        this._tour.init = init.bind(this._tour);
        this._tour.requires = requires.bind(this._tour);
        this._tour.onComplete = onComplete.bind(this._tour);

        if(autoRegister){
            this.register();
        }
    }

    createStep(stepId, selector){
        return {
            id: this.id,
            selector: selector,
            title: game.i18n.localize(`${this.localizationRoot}.${this.id}.${stepId}.title`),
            content: game.i18n.localize(`${this.localizationRoot}.${this.id}.${stepId}.content`),
        }
    }

    register(){
        game.tours.register(this.moduleId, this.id, this._tour);
    }
}

class TourEnhanced extends Tour{
    constructor(...args){
        super(...args);
    }

    async start(...args){
        const requires = await this.requires();
        if(!requires){
            const errorLocaleString = `${this.localizationRoot}.${this.id}.requires`;
            const errorMessage = game.i18n.localize(errorLocaleString);
            if(errorLocaleString != errorMessage) ui.notifications.error(errorMessage);
            return;
        }
        await this.init();
        await super.start(...args);
        Object.values(ui.windows).find(w => w instanceof ToursManagement)?.minimize();
    }

    async complete(...args){
        await super.complete(...args);
        this.onComplete();
        Object.values(ui.windows).find(w => w instanceof ToursManagement)?.maximize();
    }

    exit(...args){
        super.exit(...args);
        Object.values(ui.windows).find(w => w instanceof ToursManagement)?.maximize();
    }

    async _renderStep(...args){
        await super._renderStep(...args);
        this.overlayElement.style.zIndex = "calc(var(--z-index-tooltip) - 3)";
        $(this.fadeElement).on("click", async ()=>{
            const nextStep = this.steps[this.stepIndex + 1];
            const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const timeout = 5000;
            let currentWait = 0;
            $(this.currentStep.selector)[0]?.click()
            if(!nextStep) return this.next();
            await wait(100);
            while(!$(nextStep.selector + ":visible").length && currentWait < timeout) {
                await wait(50);
                currentWait += 50;
            }
            this.next();
         });
    }

    _getTargetElement(selector){
        return $(selector)[0];
    }

}

export function promptForTour(){
    Dialog.confirm({
        title: game.i18n.localize(`levels3dpreview.tours.dialog.title`),
        content: game.i18n.localize(`levels3dpreview.tours.dialog.content`),
        defaultYes: true,
        yes: () => {
            game.tours.get(`levels-3d-preview.getting-started`).start();
        }, 
    })
}