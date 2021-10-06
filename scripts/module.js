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
    if($("#levels3d").length > 0) game.Levels3DPreview.tokenIndex[this.id]?.setPosition();
}