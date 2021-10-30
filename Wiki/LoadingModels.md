## Loading Models

All models are loaded through tokens in the 3D tab
Generally a loded model will "just work" and be scaled to the size of the token
If the rotation is incorrect, 99% of the times you can fix it by setting an X Rotation of 270 degrees

# Token Config

 - 3D Model: This is the 3d model you want to load, FBX, GLB and GLTF files are supported - if your file is in a different format check resources(3d).md for the conversion process (it's pretty easy)

 - Texture: This is the texture applied to the 3d model, if no model is present in the 3D Model field this image will be used as a "stand up" 2d image. animated formats are supported

 - Material: You can change how the material of the model looks, keep in mind that this is supported only for simple models

 - Color: This is the color to use for the model, this will also colorize "stand up" images

 - Draggable: Whether to enable or not mouse interaction, usefull for scenery models that you don't want to drag around during gameplay

 - Always Visible: Since tokens in the 3d view follow vision rules from the 2d view - you can force certain models to always be visible (usually scenery/props)

 - Animation Index: If the model has multiple animations you can chose which one to use - keep in mind that you can use macros to change this number and it will be updated live in the 3d canvas.

 - Offeset parameters: Rotation and Offset parameters are usefull to move your model, usually this won't be necessary and you will be at moste setting the Rotation X to 270 for converted STLs but you have the option. Scale is scale :P.