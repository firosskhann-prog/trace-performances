TRACE → SOUND : ONE-TRACE PHONE TEST

WHAT THIS TEST DOES
1. Choose one trace image.
2. Choose one sound file.
3. Press START CAMERA + SOUND.
4. Point the rear camera at the trace.
5. When the trace is confirmed, the camera border turns RED and the sound plays once.
6. Move away from the trace. When the trace is seen again later, the sound can play again.

IMPORTANT
- This first version is deliberately only ONE trace + ONE sound.
- It does not remember the selected files after the page is refreshed.
- The final version can have the 50 image/sound pairs built into the web app so the audience only presses START.

PHONE / CAMERA
Camera access should be used from an HTTPS page. GitHub Pages is suitable.

QUICK GITHUB PAGES TEST
1. Create a new GitHub repository.
2. Upload these three web files to the repository root:
   index.html
   app.mjs
   trace-logic.mjs
3. In GitHub: Settings → Pages → Deploy from a branch → main → /(root) → Save.
4. Open the HTTPS GitHub Pages address on the phone.
5. Allow camera permission.
6. Choose a trace and a sound and press START.

TRACE IMAGE ADVICE
Use a trace with visible detail: text, edges, texture, shapes, contrast. Very blank/simple images are poor natural-feature traces.

TECHNICAL NOTE
The prototype uses ORB-style feature descriptors plus RANSAC homography verification. It is intentionally conservative so a random image should not trigger as easily.
