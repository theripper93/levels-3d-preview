class miniCanvas extends Application {
    constructor(actor) {
      super();
      this.actor = actor;
    }
  
    static get defaultOptions() {
      return {
        ...super.defaultOptions,
        title: "Canvas",
        id: "miniCanvas",
        template: `modules/levels-3d-preview/templates/minicanvas.hbs`,
        resizable: true,
        width: 300,
        height: window.innerHeight > 400 ? 400 : window.innerHeight - 100,
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
  
    close() {
      $(".vtt ").append($(this.element).find("#board"))
      super.close();
    }
  }