export class ClipNavigation extends Application{
    constructor() {
        super()
      }
    
      static get defaultOptions() {
        return {
          ...super.defaultOptions,
          title: "ClipNavigation",
          id: "clip-navigation",
          template: `modules/levels-3d-preview/templates/ClipNavigation.hbs`,
          resizable: false,
          popOut: false,
        };
      }

      getData() {
        const data = super.getData();
        const levels = (canvas.scene.getFlag("levels","sceneLevels") ?? [])
        .filter((l) => l[1] !== undefined && l[0] !== undefined)
        .sort((a,b)=>{
          return parseFloat(a[0]) - parseFloat(b[0])
        })
        .map(l=>{
          return {
            bottom: parseFloat(l[0]),
            top: parseFloat(l[1]),
            name: l[2]
          }
        })
        this.lowestLevel = levels.reduce((a,b)=>{
          return a.bottom < b.bottom ? a : b
        })
        this.higestLevel = levels.reduce((a,b)=>{
          return a.top > b.top ? a : b
        })
        this.offLevel = {
          bottom: 0,
          top: this.higestLevel.top + 5,
          name: "Disable"
        }
        levels.push(this.offLevel)
        data.levels = levels;
        data.range = {
          min: this.lowestLevel.top,
          max: this.higestLevel.top + 5,
          curr: this.currentRange ?? this.higestLevel.top + 5
        }
        data.isGM = game.user.isGM
        data.showRange = levels.length > 0
        this.max = data.range.max
        this.min = data.range.min
        this.levels = levels
        return data;
      }

      setPosition(){
        const html = $(this.element)
        const sidebar = $("#sidebar");
        html.css({
          position: "absolute",
          top: "5px",
          right: sidebar.width() + 10 + "px",
          height: sidebar.height() + "px", //"10px",
          //width: sidebar.height() + "px",
        });
        html.find("#clip-navigation-range").css({
          width:
            sidebar.height() -
            html.find("#clip-navigation-btns").height() +
            "px",
        });
        //Position Labels

        const totalRange = this.max - this.min
        const rangeSize = html.find("#clip-navigation-range input").width() - 14

        html.find(".clip-navigation-range-label").each((i,e)=>{
          const top = $(e).data("top");
          const percentagePos = (top - this.min)/totalRange
          const pos = rangeSize * percentagePos - $(e).width() + $(e).height()/2
          $(e).css({
            left: pos + "px"
          })
        });
      }

      activateListeners(html) {
          html.on("input", "input", this._onRangeChange.bind(this));
          html.find("#clip-navigation-range input").on("change", this._onRangeSnap.bind(this));
          html.find("#clip-navigation-range input").trigger("change");
          html.on("click", "#clip-navigation-camera", ()=>{
            if(game.Levels3DPreview._active) game.Levels3DPreview.setCameraToControlled()
          });
          html.on("click", "#clip-navigation-sync", ()=>{
            game.Levels3DPreview.socket.executeForEveryone("syncClipNavigator", this.currentRange)
            ui.notifications.info(game.i18n.localize("levels3dpreview.clipNavigator.syncNotification").replace("{{level}}", this.currentLevel.name))
          });
      }

      update(){
        $(this.element).find("#clip-navigation-range input").trigger("change");
      }

      set(val){
        this.currentRange = val
        this.render(true)
      }

      _onRangeSnap(e) {
        const input = $(e.currentTarget)
        const value = parseFloat(input.val())
        const closest = this.levels.reduce((a,b)=>{
          return Math.abs(a.top - value) < Math.abs(b.top - value) ? a : b
        })
        input.val(closest.top)
        this.currentRange = closest.top
        this.currentLevel = closest
        this._onRangeChange(e)
      }

    _onRangeChange(e) {
        const input = $(e.currentTarget)
        const value = parseFloat(input.val())
        const disabled = value == this.offLevel.top


        const closest = this.levels.reduce((a,b)=>{
          return Math.abs(a.top - value) < Math.abs(b.top - value) ? a : b
        })

        $(this.element).find(".clip-navigation-range-label").each((i,e)=>{
          const top = $(e).data("top");
          $(e).toggleClass("level-active", top == closest.top)
        })


        if(disabled){
          game.Levels3DPreview.scene.traverse((c)=>{
            if(c.isMesh){
                c.material.clippingPlanes = null
            }
          })
          return
        }
        const pxUnit = canvas.scene.dimensions.size/canvas.scene.dimensions.distance
        const clipHeight = (pxUnit*value)/game.Levels3DPreview.factor

        const clippingPlane = new game.Levels3DPreview.THREE.Plane( new game.Levels3DPreview.THREE.Vector3( 0, -1, 0 ), clipHeight );

        Object.values(game.Levels3DPreview.tiles).forEach(t => {
            t.mesh.traverse((c)=>{
              if(c.isMesh){
                c.material.clippingPlanes = [clippingPlane]
              }
            })
        })
        Object.values(game.Levels3DPreview.walls).forEach(t => {
          t.mesh.traverse((c)=>{
            if(c.isMesh){
              c.material.clippingPlanes = [clippingPlane]
            }
          })
      })
    }
}