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
        const settingsKeys = [
            "navigatorAuto", "showAdvanced", "canpingpan", "canping","baseStyle","solidBaseMode","solidBaseColor","highlightCombat","startMarker","selectedImage","colorizeInidcator","rotateIndicator","hideTarget","templateSyle","gridMode","autoPan","camerafocuszoom","standupFace","preventNegative","miniCanvas","debugMode","cameralockzero"
        ];
        for (let key of settingsKeys) {
            data[key] = game.settings.get("levels-3d-preview", key);
        }
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
	}

}

Hooks.once('init', function() {

  game.settings.register("levels-3d-preview", "removeKeybindingsPrompt", {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.registerMenu("levels-3d-preview", "configMenu", {
    label: game.i18n.localize("levels3dpreview.settings.configApp.hint"),
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
      choices: {
          "image": game.i18n.localize("levels3dpreview.settings.baseStyle.options.image"),
          "solid": game.i18n.localize("levels3dpreview.settings.baseStyle.options.solid"),
          "solidindicator": game.i18n.localize("levels3dpreview.settings.baseStyle.options.solidindicator"),
        },
      default: "solidindicator",
  });

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
      default: "merge",
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

  game.settings.register("levels-3d-preview", "selectedImage", {
      name: game.i18n.localize("levels3dpreview.settings.selectedImage.name"),
      hint: game.i18n.localize("levels3dpreview.settings.selectedImage.hint"),
      scope: "world",
      config: false,
      type: String,
      default: "modules/levels-3d-preview/assets/indicator.webp",
      filePicker: "imagevideo",
    });

    game.settings.register("levels-3d-preview", "colorizeInidcator", {
      name: game.i18n.localize("levels3dpreview.settings.colorizeInidcator.name"),
      hint: game.i18n.localize("levels3dpreview.settings.colorizeInidcator.hint"),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "rotateIndicator", {
      name: game.i18n.localize("levels3dpreview.settings.rotateIndicator.name"),
      hint: game.i18n.localize("levels3dpreview.settings.rotateIndicator.hint"),
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

    game.settings.register("levels-3d-preview", "gridMode", {
      name: game.i18n.localize("levels3dpreview.settings.gridMode.name"),
      hint: game.i18n.localize("levels3dpreview.settings.gridMode.hint"),
      scope: "world",
      config: false,
      type: String,
      choices: {
          "fast": game.i18n.localize("levels3dpreview.settings.gridMode.options.fast"),
          "mirror": game.i18n.localize("levels3dpreview.settings.gridMode.options.mirror"),
        },
      default: "fast",
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
      default: "none",
      onChange: value => { game.Levels3DPreview.setAutopan(value) }
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

    game.settings.register("levels-3d-preview", "enabledamping", {
      name: game.i18n.localize("levels3dpreview.settings.enabledamping.name"),
      hint: game.i18n.localize("levels3dpreview.settings.enabledamping.hint"),
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
    });

    game.settings.register("levels-3d-preview", "fogDebounce", {
      name: game.i18n.localize("levels3dpreview.settings.fogDebounce.name"),
      hint: game.i18n.localize("levels3dpreview.settings.fogDebounce.hint"),
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
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

    game.settings.register("levels-3d-preview", "disableLighting", {
      name: game.i18n.localize("levels3dpreview.settings.disableLighting.name"),
      hint: game.i18n.localize("levels3dpreview.settings.disableLighting.hint"),
      scope: "client",
      config: true,
      type: Boolean,
      default: false,
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
        },
      default: 4,
    });

    game.settings.register("levels-3d-preview", "resolution", {
      name: game.i18n.localize("levels3dpreview.settings.resolution.name"),
      hint: game.i18n.localize("levels3dpreview.settings.resolution.hint"),
      scope: "client",
      config: true,
      type: Number,
      choices: {
          1: game.i18n.localize("levels3dpreview.settings.resolution.options.full"),
          0.5: game.i18n.localize("levels3dpreview.settings.resolution.options.half"),
          0.25: game.i18n.localize("levels3dpreview.settings.resolution.options.quarter"),
        },
      default: 1,
      onChange: (value) => {
        const resolutionMulti = value*window.devicePixelRatio;
        game.Levels3DPreview.renderer.setPixelRatio(resolutionMulti);
      }
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
  game.settings.register("levels-3d-preview", "welcomeDialog", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  if(game.settings.get("levels-3d-preview", "welcomeDialog")) return;
  const dialog = new Dialog({
    title: game.i18n.localize("levels3dpreview.welcome.title"),
    content: game.i18n.localize("levels3dpreview.welcome.content"),
    buttons: {
        ok:{
            label: `<i class="fas fa-times"></i> ` + game.i18n.localize("levels3dpreview.welcome.ok"),
        },
        dontshowagain: {
            label: `<i class="fas fa-check-double"></i> ` + game.i18n.localize("levels3dpreview.welcome.dontshowagain"),
            callback: () => {game.settings.set("levels-3d-preview", "welcomeDialog", true);}
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
})