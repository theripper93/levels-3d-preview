Hooks.once("init",()=>{
      libWrapper.register(
    "levels-3d-preview",
    "Token.prototype._onMovementFrame",
    Token3DSetPosition,
    "WRAPPER"
  );
})

function Token3DSetPosition(wrapped,...args){
    wrapped(...args);
    if(game.Levels3DPreview?._active){
      const token3D = game.Levels3DPreview.tokenIndex[this.id];
      if(token3D && token3D.fallbackAnimation){
          token3D.setPosition();
      }
    }
}