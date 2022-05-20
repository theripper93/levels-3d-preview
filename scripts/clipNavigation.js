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

      activateListeners(html) {
          const sidebar = $("#sidebar")
          html.css({
              position: "absolute",
                top: "5px",
                right: (sidebar.width()+25) + "px",
                height: "10px",
                width: sidebar.height() + "px",
          })
          html.on("input", "input", (e) => {
                const input = $(e.currentTarget)
                const value = parseFloat(input.val())
                const pxUnit = canvas.scene.dimensions.size/canvas.scene.dimensions.distance
                const clipHeight = (pxUnit*value)/game.Levels3DPreview.factor

                const clippingPlane = new game.Levels3DPreview.THREE.Plane( new game.Levels3DPreview.THREE.Vector3( 0, -1, 0 ), clipHeight );

                game.Levels3DPreview.scene.traverse((c)=>{
                    if(c.isMesh){
                        c.material.clippingPlanes = [clippingPlane]
                    }
                })

                Object.values(game.Levels3DPreview.tokens).forEach(t => {
                    t.mesh.traverse((c)=>{
                        if(c.isMesh){
                            c.material.clippingPlanes = null
                        }
                    })
                })

                //game.Levels3DPreview.renderer.clippingPlanes[0].constant = clipHeight
          })
      }
}