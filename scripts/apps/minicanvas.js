export class miniCanvas extends Application {
    constructor(actor) {
      super();
      this.actor = actor;
      this.positionCalls = 0;
      this.savePosition = foundry.utils.debounce(() => {
        game.settings.set("levels-3d-preview", "minicanvasposition", this.position);
      }, 100);
    }
  
    static get defaultOptions() {
      const aspectRatio = window.innerWidth / window.innerHeight;
      const position = game.settings.get("levels-3d-preview", "minicanvasposition");
      return {
        ...super.defaultOptions,
        title: "Canvas",
        id: "miniCanvas",
        template: `modules/levels-3d-preview/templates/minicanvas.hbs`,
        resizable: true,
        width: position.width ?? 300*aspectRatio,
        height: position.height ?? 300,
        left: position.left,
        top: position.top,
      };
    }

    setPosition({left, top, width, height, scale}={}) {
      const aspectRatio = window.innerWidth / window.innerHeight;
      height = width / aspectRatio;
      super.setPosition({left, top, width, height, scale});
      this.savePosition();
    }
  
    getData() {
      return {};
    }
  
    async activateListeners(html) {
      this.updateControls(true);
      html.find(".canvas-container").append($("#board"))
      $("#board").css({
        "width": "100%",
        "height": "100%",
      })
      $("#board").show()
      canvas.stage.renderable = true;
    }

    resize(){
      $("#board").css({
        "width": "100%",
        "height": "100%",
      })
    }

    _onResize(e){
      super._onResize(e);
      
    }

    updateControls(toggle){
      return;
      $(`li[data-tool="miniCanvas"]`).toggleClass("active", toggle);
      ui.controls.controls.find(c=>c.name=="token").tools.find(t=>t.name == "miniCanvas").active = toggle;
    }
  
    close() {
      $(".vtt ").append($(this.element).find("#board"))
      if(game.Levels3DPreview._active) {
        $("#board").hide()
        canvas.stage.renderable = false;
      }
      super.close();
      this.updateControls(false);
    }

    static toggle(){
      const currentInstance = Object.values(ui.windows)?.find(w => w.id === "miniCanvas")
      if(currentInstance){
        currentInstance.close()
      }else{
        new miniCanvas().render(true)
      }
    }
  }

  