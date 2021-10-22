class miniCanvas extends Application {
    constructor(actor) {
      super();
      this.actor = actor;
    }
  
    static get defaultOptions() {
      const aspectRatio = window.innerWidth / window.innerHeight;
      return {
        ...super.defaultOptions,
        title: "Canvas",
        id: "miniCanvas",
        template: `modules/levels-3d-preview/templates/minicanvas.hbs`,
        resizable: true,
        width: 300*aspectRatio,
        height: 300,
      };
    }
  
    getData() {
      return {};
    }
  
    async activateListeners(html) {
      html.find(".canvas-container").append($("#board"))
      $("#board").css({
        "width": "100%",
        "height": "100%",
      })
    }

    resize(){
      $("#board").css({
        "width": "100%",
        "height": "100%",
      })
    }
  
    close(preventPropagation = false) {
      $(".vtt ").append($(this.element).find("#board"))
      if(!preventPropagation) game.Levels3DPreview.close(true);
      super.close();
    }
  }