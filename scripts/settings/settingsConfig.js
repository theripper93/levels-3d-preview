class canvas3dConfig extends FormApplication{

	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			title: game.i18n.localize("levels3dpreview.settings.configApp.title"),
			template: "modules/levels-3d-preview/templates/config.hbs",
			id: "levels-3d-preview-settings",
			width: 520,
			height: "auto",
			closeOnSubmit: true,
			tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "canvas" }],
      filepickers: []
		});
	}

	async getData(options) {
        const data = {}
        const settingsKeys = ["lightHelpers","useMultithreading", "templateEffects", "enableReticule", "fullTransparency", "outline", "gameCameraWarnings", "gameCameraAutoLock", "gameCameraDefaultGm", "gameCameraClipping", "gameCameraMinAngle", "gameCameraMaxAngle", "enableGameCamera", "rangeFinder", "preapplyShaders", "sharedContext", "rotateIndicator", "navigatorAuto", "showAdvanced", "canpingpan", "canping", "baseStyle", "solidBaseMode", "solidBaseColor", "highlightCombat", "startMarker", "hideTarget", "templateSyle", "autoPan", "standupFace", "preventNegative", "miniCanvas", "debugMode", "cameralockzero"];
        for (let key of settingsKeys) {
            data[key] = game.settings.get("levels-3d-preview", key);
        }
        data.CONFIG = game.Levels3DPreview.CONFIG
		return data;
	}
	activateListeners(html) {
    super.activateListeners(html);
    html.on("change", `input[type="color"]`, this._colorChange.bind(this));
	}

  _colorChange(e){
    const input = $(e.target);
    const edit = input.data("edit");
    const value = input.val();
    this.element.find(`input[name="${edit}"]`).val(value);
}

	async _updateObject(event, formData) {
    for(let [key, value] of Object.entries(formData)){
        await game.settings.set("levels-3d-preview", key, value);
    }
    game.settings.set("levels-3d-preview", "sceneReload", !game.settings.get("levels-3d-preview", "sceneReload"));
	}

}

Hooks.once("canvasConfig", (canvasConfig) => {
  game.settings.register("levels-3d-preview", "resolutionMultiplier", {
      name: game.i18n.localize("levels3dpreview.settings.resolutionMultiplier.name"),
      hint: game.i18n.localize("levels3dpreview.settings.resolutionMultiplier.hint"),
      scope: "client",
      config: true,
      type: Number,
      range: {
          min: 0.25,
          max: 2,
          step: 0.05,
      },
      default: 1,
      requiresReload: true,
  });

  canvasConfig.resolution*=game.settings.get("levels-3d-preview", "resolutionMultiplier");
})

Hooks.on("renderSettingsConfig", (app, html, data) => {
  game.Levels3DPreview.helpers.injectPresetButtons(html);
});

Hooks.once('init', function() {

  game.settings.register("levels-3d-preview", "sceneReload", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => {
      if(game.Levels3DPreview?._active){
        game.Levels3DPreview.reload();
      }
    }
  });

    game.settings.register("levels-3d-preview", "useMultithreading", {
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
        onChange: (val) => {
            game.Levels3DPreview.CONFIG.useMultithreading = val;
        },
    });
  //game camera
  game.settings.register("levels-3d-preview", "enableGameCamera", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register("levels-3d-preview", "gameCameraMaxAngle", {
    scope: "world",
    config: false,
    type: Number,
    default: 45,
  });

  game.settings.register("levels-3d-preview", "gameCameraMinAngle", {
    scope: "world",
    config: false,
    type: Number,
    default: 45,
  });

  game.settings.register("levels-3d-preview", "gameCameraClipping", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register("levels-3d-preview", "gameCameraDefaultGm", {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register("levels-3d-preview", "gameCameraWarnings", {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register("levels-3d-preview", "gameCameraAutoLock", {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });


  game.settings.register("levels-3d-preview", "removeKeybindingsPrompt", {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register("levels-3d-preview", "shaderAutoSave", {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.registerMenu("levels-3d-preview", "configMenu", {
    name: game.i18n.localize("levels3dpreview.settings.configApp.name"),
    label: game.i18n.localize("levels3dpreview.settings.configApp.label"),
    hint: game.i18n.localize("levels3dpreview.settings.configApp.hint"),
    icon: "fas fa-cogs",
    scope: "world",
    restricted: true,
    type: canvas3dConfig,
  });

  game.settings.register("levels-3d-preview", "baseStyle", {
      name: game.i18n.localize("levels3dpreview.settings.baseStyle.name"),
      hint: game.i18n.localize("levels3dpreview.settings.baseStyle.hint"),
      scope: "world",
      config: false,
      type: String,
      default: "roundDoubleRing",
  });
  
  game.settings.register("levels-3d-preview", "outline", {
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
  })

  game.settings.register("levels-3d-preview", "fullTransparency", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  })

  game.settings.register("levels-3d-preview", "lightHelpers", {
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
  });

  game.settings.register("levels-3d-preview", "enableReticule", {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  })

  game.settings.register("levels-3d-preview", "navigatorAuto", {
    scope: "world",
    config: false,
    type: String,
    choices: {
        "none": game.i18n.localize("levels3dpreview.settings.navigatorAuto.options.none"),
        "players": game.i18n.localize("levels3dpreview.settings.navigatorAuto.options.players"),
        "all": game.i18n.localize("levels3dpreview.settings.navigatorAuto.options.all"),
      },
    default: "players",
});

  game.settings.register("levels-3d-preview", "solidBaseMode", {
      name: game.i18n.localize("levels3dpreview.settings.solidBaseMode.name"),
      hint: game.i18n.localize("levels3dpreview.settings.solidBaseMode.hint"),
      scope: "world",
      config: false,
      type: String,
      choices: {
          "merge": game.i18n.localize("levels3dpreview.settings.solidBaseMode.options.merge"),
          "ontop": game.i18n.localize("levels3dpreview.settings.solidBaseMode.options.ontop"),
        },
      default: "ontop",
  });

  game.settings.register("levels-3d-preview", "solidBaseColor", {
      name: game.i18n.localize("levels3dpreview.settings.solidBaseColor.name"),
      hint: game.i18n.localize("levels3dpreview.settings.solidBaseColor.hint"),
      scope: "world",
      config: false,
      type: String,
      default: "#2b2b2b",
    });
    
    game.settings.register("levels-3d-preview", "highlightCombat", {
      name: game.i18n.localize("levels3dpreview.settings.highlightCombat.name"),
      hint: game.i18n.localize("levels3dpreview.settings.highlightCombat.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "startMarker", {
      name: game.i18n.localize("levels3dpreview.settings.startMarker.name"),
      hint: game.i18n.localize("levels3dpreview.settings.startMarker.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "hideTarget", {
      name: game.i18n.localize("levels3dpreview.settings.hideTarget.name"),
      hint: game.i18n.localize("levels3dpreview.settings.hideTarget.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
    });

    game.settings.register("levels-3d-preview", "sharedContext", {
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "preapplyShaders", {
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
    });

    game.settings.register("levels-3d-preview", "rotateIndicator", {
      name: game.i18n.localize("levels3dpreview.settings.rotateIndicator.name"),
      hint: game.i18n.localize("levels3dpreview.settings.rotateIndicator.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "templateEffects", {
      name: game.i18n.localize("levels3dpreview.settings.templateEffects.name"),
      hint: game.i18n.localize("levels3dpreview.settings.templateEffects.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "templateSyle", {
      name: game.i18n.localize("levels3dpreview.settings.templateSyle.name"),
      hint: game.i18n.localize("levels3dpreview.settings.templateSyle.hint"),
      scope: "world",
      config: false,
      type: String,
      choices: {
          "wireframe": game.i18n.localize("levels3dpreview.settings.templateSyle.options.wireframe"),
          "solid": game.i18n.localize("levels3dpreview.settings.templateSyle.options.solid"),
        },
      default: "wireframe",
    });

    game.settings.register("levels-3d-preview", "autoPan", {
      name: game.i18n.localize("levels3dpreview.settings.autoPan.name"),
      hint: game.i18n.localize("levels3dpreview.settings.autoPan.hint"),
      scope: "world",
      config: false,
      type: String,
      choices: {
          "none": game.i18n.localize("levels3dpreview.settings.autoPan.options.none"),
          "player": game.i18n.localize("levels3dpreview.settings.autoPan.options.player"),
          "all": game.i18n.localize("levels3dpreview.settings.autoPan.options.all"),
        },
      default: "all",
      onChange: value => { game.Levels3DPreview.setAutopan(value) }
    });

    game.settings.register("levels-3d-preview", "rangeFinder", {
      scope: "world",
      config: false,
      type: String,
      default: "combat",
    });

    game.settings.register("levels-3d-preview", "screenspacepanning", {
      name: game.i18n.localize("levels3dpreview.settings.screenspacepanning.name"),
      hint: game.i18n.localize("levels3dpreview.settings.screenspacepanning.hint"),
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      onChange: value => { game.Levels3DPreview.controls.screenSpacePanning = value }
    });

    game.settings.register("levels-3d-preview", "altCameraControls", {
      name: game.i18n.localize("levels3dpreview.settings.altCameraControls.name"),
      hint: game.i18n.localize("levels3dpreview.settings.altCameraControls.hint"),
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      onChange: value => { game.Levels3DPreview.GameCamera.setControlPreset() }
    });

    game.settings.register("levels-3d-preview", "enabledamping", {
        name: game.i18n.localize("levels3dpreview.settings.enabledamping.name"),
        hint: game.i18n.localize("levels3dpreview.settings.enabledamping.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
    });

    game.settings.register("levels-3d-preview", "loadingShown", {
      scope: "client",
      config: false,
      type: Boolean,
      default: false,
    });

    game.settings.register("levels-3d-preview", "cameralockzero", {
      name: game.i18n.localize("levels3dpreview.settings.cameralockzero.name"),
      hint: game.i18n.localize("levels3dpreview.settings.cameralockzero.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "canping", {
      name: game.i18n.localize("levels3dpreview.settings.canping.name"),
      hint: game.i18n.localize("levels3dpreview.settings.canping.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "canpingpan", {
      name: game.i18n.localize("levels3dpreview.settings.canpingpan.name"),
      hint: game.i18n.localize("levels3dpreview.settings.canpingpan.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
    });

    game.settings.register("levels-3d-preview", "standupFace", {
      name: game.i18n.localize("levels3dpreview.settings.standupFace.name"),
      hint: game.i18n.localize("levels3dpreview.settings.standupFace.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "preventNegative", {
      name: game.i18n.localize("levels3dpreview.settings.preventNegative.name"),
      hint: game.i18n.localize("levels3dpreview.settings.preventNegative.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "showAdvanced", {
      name: game.i18n.localize("levels3dpreview.settings.showAdvanced.name"),
      hint: game.i18n.localize("levels3dpreview.settings.showAdvanced.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
    });

    game.settings.register("levels-3d-preview", "miniCanvas", {
      name: game.i18n.localize("levels3dpreview.settings.miniCanvas.name"),
      hint: game.i18n.localize("levels3dpreview.settings.miniCanvas.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
    });


    game.settings.register("levels-3d-preview", "enableShaders", {
        name: game.i18n.localize("levels3dpreview.settings.enableShaders.name"),
        hint: game.i18n.localize("levels3dpreview.settings.enableShaders.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
    });

    game.settings.register("levels-3d-preview", "enableEffects", {
        name: game.i18n.localize("levels3dpreview.settings.enableEffects.name"),
        hint: game.i18n.localize("levels3dpreview.settings.enableEffects.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
    });

    game.settings.register("levels-3d-preview", "softShadows", {
      name: game.i18n.localize("levels3dpreview.settings.softShadows.name"),
      hint: game.i18n.localize("levels3dpreview.settings.softShadows.hint"),
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      onChange: (value) => {
        game.Levels3DPreview.renderer.shadowMap.type = value ? game.Levels3DPreview.THREE.PCFSoftShadowMap : game.Levels3DPreview.THREE.PCFShadowMap;
      }
    });
    
    game.settings.register("levels-3d-preview", "shadowQuality", {
        name: game.i18n.localize("levels3dpreview.settings.shadowQuality.name"),
        hint: game.i18n.localize("levels3dpreview.settings.shadowQuality.hint"),
        scope: "client",
        config: true,
        type: Number,
        choices: {
            32: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.gamer"),
            16: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.ultra"),
            8: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.high"),
            4: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.medium"),
            2: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.low"),
            0: game.i18n.localize("levels3dpreview.settings.shadowQuality.options.none"),
        },
        onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
        default: 4,
    });
    
    game.settings.register("levels-3d-preview", "antialiasing", {
        name: game.i18n.localize("levels3dpreview.settings.antialiasing.name"),
        hint: game.i18n.localize("levels3dpreview.settings.antialiasing.hint"),
        scope: "client",
        config: true,
        type: String,
        choices: {
            none: game.i18n.localize("levels3dpreview.settings.antialiasing.options.none"),
            fxaa: game.i18n.localize("levels3dpreview.settings.antialiasing.options.fxaa"),
            smaa: game.i18n.localize("levels3dpreview.settings.antialiasing.options.smaa"),
        },
        onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
        default: "fxaa",
    });

    game.settings.register("levels-3d-preview", "fowQuality", {
        name: game.i18n.localize("levels3dpreview.settings.fowQuality.name"),
        hint: game.i18n.localize("levels3dpreview.settings.fowQuality.hint"),
        scope: "client",
        config: true,
        type: Number,
        choices: {
            1: game.i18n.localize("levels3dpreview.settings.fowQuality.options.native"),
            0.75: game.i18n.localize("levels3dpreview.settings.fowQuality.options.high"),
            0.5: game.i18n.localize("levels3dpreview.settings.fowQuality.options.medium"),
            0.25: game.i18n.localize("levels3dpreview.settings.fowQuality.options.low"),
            0.1: game.i18n.localize("levels3dpreview.settings.fowQuality.options.verylow"),
        },
        onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
        default: 1,
    });
  
    game.settings.register("levels-3d-preview", "dofblur", {
        name: game.i18n.localize("levels3dpreview.settings.dofblur.name"),
        hint: game.i18n.localize("levels3dpreview.settings.dofblur.hint"),
        scope: "client",
        config: true,
      type: String,
      choices: {
        "off": game.i18n.localize("levels3dpreview.settings.dofblur.options.off"),
        "low": game.i18n.localize("levels3dpreview.settings.dofblur.options.low"),
        "medium": game.i18n.localize("levels3dpreview.settings.dofblur.options.medium"),
        "high": game.i18n.localize("levels3dpreview.settings.dofblur.options.high"),
      },
      onChange: () => game.Levels3DPreview.UTILS.debouncedReload(),
        default: false,
    });

    game.settings.register("levels-3d-preview", "debugMode", {
      name: game.i18n.localize("levels3dpreview.settings.debugMode.name"),
      hint: game.i18n.localize("levels3dpreview.settings.debugMode.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
      onChange: (sett) => {
          game.Levels3DPreview.debugMode = sett;
      }
    });

    game.settings.register("levels-3d-preview", "minicanvasposition", {
      name: "",
      hint: "",
      scope: "client",
      config: false,
      type: Object,
      default: {
          top: 0,
          left: 0,
      },
    });

});

Hooks.once("ready", () => {
  let clipNavigatorFollowClientDefault = false;
const autoModeSetting = game.settings.get("levels-3d-preview", "navigatorAuto");
if(autoModeSetting == "none") clipNavigatorFollowClientDefault = false
else if(autoModeSetting == "players") clipNavigatorFollowClientDefault = !game.user.isGM
else clipNavigatorFollowClientDefault = true

game.settings.register("levels-3d-preview", "clipNavigatorFollowClient", {
  scope: "client",
  config: false,
  type: Boolean,
  default: clipNavigatorFollowClientDefault,
});
})


//Welcome Message

Hooks.once("ready", () => {
  if(!game.user.isGM) return;
  game.settings.register("levels-3d-preview", "oneTimeMessages", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  async function setSetting(key){
    let oldSett = game.settings.get("levels-3d-preview", "oneTimeMessages");
    oldSett[key] = true;
    await game.settings.set("levels-3d-preview", "oneTimeMessages", oldSett);
  }

  if(!game.settings.get("levels-3d-preview", "oneTimeMessages").welcome){
    const dialog = new Dialog({
      title: game.i18n.localize("levels3dpreview.welcome.title"),
      content: game.i18n.localize("levels3dpreview.welcome.content"),
      buttons: {
          ok:{
              label: `<i class="fas fa-times"></i> ` + game.i18n.localize("levels3dpreview.welcome.ok"),
          },
          dontshowagain: {
              label: `<i class="fas fa-check-double"></i> ` + game.i18n.localize("levels3dpreview.welcome.dontshowagain"),
              callback: () => {
                setSetting("welcome");
              }
          },
          opencompendium: {
              label: `<i class="fas fa-book"></i> ` + game.i18n.localize("levels3dpreview.welcome.opencompendium"),
              callback: () => {game.packs.get("levels-3d-preview.documentation").render(true);}
          },
      },
      default: "ok",
    })
    dialog.render(true);
    Hooks.once("renderDialog", (app,html)=>{
      html.find("button").css({
        height: "3rem"
      })
      app.setPosition({width: 500,height:"auto", left: window.innerWidth/2-250})
  
    })
  }

  if (!game.settings.get("levels-3d-preview", "oneTimeMessages").mousechanged) {
    const d = Dialog.prompt({
      title: "3D Canvas: Default Binding Changed",
      content: "The default binding for camera rotation changed from Left Click + Drag to Middle Click + Drag, you can change this in the module settings.",
      callback: () => {
        setSetting("mousechanged");
      },
    })
    d.render(true);
  }

})