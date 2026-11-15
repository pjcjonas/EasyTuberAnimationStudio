/* The tutorial: chapters of steps. Each step says one thing (narration and caption) while its `do`
   runs in the studio window; the next step starts when both are done. Read by build.js in Node
   (for the narration text) and run in the studio window (the `do` functions, with T from overlay.js). */
(function (root) {
  const S = () => window.Studio;
  const PT = () => window.PT;

  // the corners of some parts' drawings, on screen
  function bounds(ids) {
    const Tools = S().Tools;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const q = Tools.artPoint(id, u, v);
        if (!q) continue;
        const [x, y] = window.T.toClient(q);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    return { x0, y0, x1, y1 };
  }
  // a point on a part's drawing (u, v = 0..1 across and down it), in canvas pixels
  function partPoint(id, u, v) { return S().Tools.artPoint(id, u, v); }
  const play = async (T, ms) => { await T.click('#btnPlay'); await T.wait(ms); if (S().Preview.playing) await T.click('#btnPlay'); };

  const TUTORIAL = [
    {
      title: 'Welcome',
      steps: [
        { say: 'Welcome to EasyTuber Animation Studio. In this video you will learn exactly how to make your own EasyTuber actions, from the first pose to the finished file.',
          do: async (T) => { T.titleCard(true, 'EasyTuber <span>Animation Studio</span>', 'How to make your own actions'); } },
        { say: 'An action is a short animation, like a wave or a dance, that EasyTuber plays when you press a hotkey, or when Streamer bot triggers it.',
          do: async (T) => { await T.wait(800); T.titleCard(false); } },
        { say: 'The studio lets you pose your avatar on a timeline, and then writes the action file for you. The preview is EasyTuber\'s own engine, so what you see here is exactly what you get on stream.',
          do: async (T) => { await T.point('#stage', 1200); } },
      ],
    },
    {
      title: 'The screen',
      steps: [
        { say: 'Let\'s take a quick tour of the screen.' },
        { say: 'In the middle is the stage, with the avatar you are animating.', do: async (T) => { T.highlight('#stageWrap', 'Stage', { pad: -4 }); } },
        { say: 'At its top left are the posing tools: free or joint motion, then rotate, move, and scale.', do: async (T) => { T.unhighlight(); T.highlight('#stageTools', 'Posing tools', { below: true }); } },
        { say: 'Along the top are the action\'s I D, which becomes its file name, its name in EasyTuber, and its length in milliseconds.', do: async (T) => { T.unhighlight(); T.highlight('.group.fields', 'The action', { below: true }); } },
        { say: 'Below the stage are the play controls,', do: async (T) => { T.unhighlight(); T.highlight('#transport', 'Play controls'); } },
        { say: 'and under them is the timeline. Every row is one body part, and the yellow diamonds you will add are keyframes.', do: async (T) => { T.unhighlight(); T.highlight('#timeline', 'Timeline', { pad: -4 }); } },
        { say: 'On the right is the inspector. It shows the exact numbers for whatever you have selected, and the settings of the whole action.', do: async (T) => { T.unhighlight(); T.highlight('#side', 'Inspector', { pad: -4 }); } },
      ],
    },
    {
      title: 'Free motion and pivots',
      steps: [
        { say: 'Now the most important idea: free motion. Every part is like a layer on the nineteen twenty by ten eighty stage. You can move it anywhere, turn it, size it, and fade it.', do: async (T) => { T.unhighlight(); T.highlight(T.button('Free', '#stageTools'), 'Free mode', { below: true }); await T.wait(2500); T.unhighlight(); } },
        { say: 'Point at a part to see its name.', do: async (T) => { await T.hoverPart('torso'); await T.wait(600); await T.hoverPart('armRUpper'); } },
        { say: 'Click a part to select it. The pink crosshair is its pivot: the point it turns and sizes around. In free mode, it starts in the middle of the part.',
          do: async (T) => { await T.clickPart('armRUpper'); await T.wait(300); T.highlightPoint(S().Tools.joint('armRUpper'), 'Pivot'); } },
        { say: 'If I turn the arm now, it spins around its middle.', do: async (T) => { T.unhighlight(); await T.rotatePart('armRUpper', -40, { ms: 1300 }); await T.wait(300); await T.key('z', { ctrlKey: true }); } },
        { say: 'So drag the crosshair to put the pivot wherever you want, even outside the part. Hold Control to snap it to the shoulder joint, the middle, an edge, or a corner.',
          do: async (T) => { await T.dragPivotToJoint('armRUpper'); await T.wait(300); T.highlightPoint(S().Tools.joint('armRUpper'), 'Pivot on the shoulder'); } },
        { say: 'Now the arm turns at the shoulder, like a real arm.', do: async (T) => { T.unhighlight(); await T.rotatePart('armRUpper', -60, { ms: 1400 }); } },
        { say: 'Every part moves on its own. If I move the torso, the head and the arms stay exactly where they are.',
          do: async (T) => { await T.click(T.button('✥ Move', '#stageTools')); const c = T.toClient(partPoint('torso', 0.5, 0.75)); await T.stageDrag(c, [c[0] - 160, c[1] - 30], { ms: 1400 }); } },
        { say: 'If you do want the parts hanging from it to come along, tick children go with it, in the inspector.',
          do: async (T) => { const box = [...document.querySelectorAll('#inspector label.check')].find((l) => /children go with it/.test(l.textContent)); if (box) { box.scrollIntoViewIfNeeded(); T.highlight(box, 'Children follow'); await T.point(box); } await T.wait(1800); T.unhighlight(); } },
        { say: 'I\'ll undo these test moves with Control Z.', do: async (T) => { for (let i = 0; i < 3; i++) await T.key('z', { ctrlKey: true }); await T.click(T.button('↻ Rotate', '#stageTools')); } },
        { say: 'The Joint switch turns parts around the joints set up in EasyTuber instead, the old way. Free mode can do all of that and more, so this video sticks to free mode.',
          do: async (T) => { T.highlight(T.button('Joint', '#stageTools'), 'Joint mode', { below: true }); await T.wait(2500); T.unhighlight(); } },
      ],
    },
    {
      title: 'Move, turn, size, and fade',
      steps: [
        { say: 'Move puts a part anywhere on the stage. The yellow label shows where its pivot is, in stage pixels.',
          do: async (T) => { await T.click(T.button('✥ Move', '#stageTools')); const f = T.toClient(partPoint('face', 0.2, 0.62)); await T.stageDrag(f, [f[0] + 260, f[1] - 40], { ms: 1500 }); } },
        { say: 'Rotate turns it around its pivot. Hold Control to snap to fifteen degree steps.',
          do: async (T) => { await T.click(T.button('↻ Rotate', '#stageTools')); await T.rotatePart('face', 25, { ms: 1200, grab: () => partPoint('face', 0.85, 0.35) }); } },
        { say: 'Scale grows or shrinks it around the pivot: drag up to grow, and down to shrink.',
          do: async (T) => { await T.click(T.button('⤢ Scale', '#stageTools')); const f = T.toClient(partPoint('face', 0.2, 0.62)); await T.stageDrag(f, [f[0], f[1] - 50], { ms: 1100 }); } },
        { say: 'Opacity, in the inspector, fades a part out. Zero hides it completely.',
          do: async (T) => { const input = T.field(T.card('Face'), 'Opacity'); T.highlight(input, '', { pad: 4 }); await T.type(input, '40'); T.unhighlight(); } },
        { say: 'Holding Shift always moves, and holding Alt always scales, whatever tool is picked. The R, M, and S keys switch tools.' },
        { say: 'Let me undo all of that.', do: async (T) => { for (let i = 0; i < 4; i++) await T.key('z', { ctrlKey: true }); await T.click(T.button('↻ Rotate', '#stageTools')); await T.key('Escape'); } },
      ],
    },
    {
      title: 'Your first action: a wave',
      steps: [
        { say: 'Let\'s make a real action: a wave.', do: async (T) => { await T.point('#btnNew'); T.ripple(); S().App.load(S().Model.newProject(), null); await T.wait(300); } },
        { say: 'First, give it an I D, using letters, numbers, and dashes. I\'ll call it hello wave.', do: async (T) => { await T.type('#fId', 'hello-wave'); } },
        { say: 'Then a friendly name. That\'s the name you will see in EasyTuber\'s Actions tab.', do: async (T) => { await T.type('#fLabel', 'Hello wave'); } },
        { say: 'The length is two thousand milliseconds, which is two seconds. That\'s fine.', do: async (T) => { T.highlight('#fDuration', '', { pad: 4 }); await T.point('#fDuration'); await T.wait(900); T.unhighlight(); } },
        { say: 'First the pivots: I put the upper arm\'s pivot on the shoulder,', do: async (T) => { await T.clickPart('armRUpper'); await T.dragPivotToJoint('armRUpper'); } },
        { say: 'and the forearm\'s on the elbow.', do: async (T) => { await T.clickPart('armRLower'); await T.dragPivotToJoint('armRLower'); } },
        { say: 'Keys are always set at the playhead, the pink line. I\'ll drag it to five hundred milliseconds.', do: async (T) => { await T.scrubTo(500, 1200); } },
        { say: 'Now I turn the upper arm up. The forearm comes with it.', do: async (T) => { await T.rotatePartTo('armRUpper', -100, { ms: 1600 }); } },
        { say: 'See the diamonds in the timeline? The studio also added rest keys at the start and the end, so the arm rises from its normal position and comes back down by itself.',
          do: async (T) => { const row = T.partRow('armRUpper'); T.showRow(row); await T.wait(200); T.highlight(T.partRow('armRUpper'), 'Keys for the upper arm'); await T.wait(3500); T.unhighlight(); } },
        { say: 'Next, I bend the forearm at the elbow, so the hand points up.', do: async (T) => { await T.rotatePartTo('armRLower', -60, { ms: 1300 }); } },
        { say: 'Let\'s press play.', do: async (T) => { await play(T, 2300); } },
        { say: 'The arm goes up and comes back down. Now for the waving itself.' },
        { say: 'At eight hundred milliseconds, I tilt the forearm out,', do: async (T) => { await T.scrubTo(800); await T.rotatePartTo('armRLower', -25, { ms: 900 }); } },
        { say: 'at eleven hundred, back in,', do: async (T) => { await T.scrubTo(1100); await T.rotatePartTo('armRLower', -75, { ms: 900 }); } },
        { say: 'and at fourteen hundred, out again.', do: async (T) => { await T.scrubTo(1400); await T.rotatePartTo('armRLower', -25, { ms: 900 }); } },
        { say: 'The upper arm would start dropping while it waves. To hold it up, I go to fifteen hundred, select the upper arm, and type minus one hundred into the turn box in the inspector.',
          do: async (T) => { await T.scrubTo(1500); await T.clickPart('armRUpper'); const input = T.field(T.card('Right arm'), 'Turn'); T.highlight(input, '', { pad: 4 }); await T.type(input, '-100'); T.unhighlight(); } },
        { say: 'Typing a number sets a key at the playhead, just like dragging does. Let\'s watch it.', do: async (T) => { await T.wait(400); await play(T, 2300); await T.wait(300); await play(T, 2300); } },
      ],
    },
    {
      title: 'The timeline and easing',
      steps: [
        { say: 'Now a closer look at the timeline.' },
        { say: 'Click the little arrow next to a part\'s name to open its rows: X, Y, turn, size, and opacity.', do: async (T) => { const row = T.partRow('armRUpper'); T.showRow(row); await T.click(T.partRow('armRUpper').querySelector('.tw')); } },
        { say: 'Drag a keyframe left or right to change its timing. I\'ll make the arm go up a little sooner.', do: async (T) => { await T.dragTimeline(T.diamond('armRUpper', 500), -120); } },
        { say: 'Right click a key to choose its easing: how the motion travels from this key to the next. Out Back overshoots a little, which feels bouncy.',
          do: async (T) => { await T.rightClick(T.diamond('armRUpper', 0)); await T.wait(700); await T.click(T.button('outBack', '#ctxMenu')); } },
        { say: 'Double click a row to add a key there, and press Delete to remove the selected keys.' },
        { say: 'Shift click selects more keys, and Shift drag draws a box around them. Then drag them together, or change their easing in the inspector, all at once.',
          do: async (T) => { const row = T.partRow('armRLower'); T.showRow(row); await T.wait(200); const r = T.partRow('armRLower').getBoundingClientRect(); await T.boxKeys([T.timeX(700), r.top + 2], [T.timeX(1450), r.bottom - 2]); await T.wait(400); T.highlight(T.card('3 keys') || '#inspector .card', 'Selected keys'); await T.wait(2500); T.unhighlight(); } },
        { say: 'Escape clears the selection.', do: async (T) => { await T.key('Escape'); } },
      ],
    },
    {
      title: 'Several parts at once',
      steps: [
        { say: 'You can also pose several parts together.', do: async (T) => { await T.scrubTo(1000); } },
        { say: 'Hold Control and click to add parts to the selection,', do: async (T) => { await T.clickPart('armLUpper'); await T.clickPart('armLLower', { ctrlKey: true }); await T.wait(600); } },
        { say: 'or drag a box over an empty part of the stage. Here I box the whole head.',
          do: async (T) => {
            const head = ['hairBack', 'hairFront', 'face', 'eyes', 'mouth'];
            const b = bounds(['hairBack', 'hairFront', 'face']), mouth = T.toClient(S().Tools.center('mouth'));
            let x0 = b.x0 - 40, x1 = b.x1 + 40, y0 = b.y0 - 30, y1 = mouth[1] + 25;
            // keep any other part (a raised hand) out of the box
            const mid = (x0 + x1) / 2;
            for (const d of PT().PARTS) {
              if (head.includes(d.id) || !S().Preview.rig.parts[d.id] || !S().Preview.rig.parts[d.id].visible) continue;
              const c = S().Tools.center(d.id); if (!c) continue;
              const [cx, cy] = T.toClient(c);
              if (cx > x0 && cx < x1 && cy > y0 && cy < y1) { if (cx > mid) x1 = cx - 6; else x0 = cx + 6; }
            }
            await T.stageDrag([x0, y0], [x1, y1], { ms: 1300 });
          } },
        { say: 'A drag now turns them all as one group, around the pivot of the part I grab. Here the whole head tilts around the middle of the face.',
          do: async (T) => { await T.rotatePart('face', 9, { ms: 1300, grab: () => partPoint('face', 0.85, 0.35) }); } },
        { say: 'Press K to key every selected part at the playhead, and Control A to select every part.', do: async (T) => { await T.key('k'); await T.wait(400); await T.key('Escape'); } },
      ],
    },
    {
      title: 'Eyes, mouth, and expressions',
      steps: [
        { say: 'The face card in the inspector changes the eyes, the mouth, and the expression, from the playhead on.', do: async (T) => { const c = T.card('Face at the playhead'); c.scrollIntoView({ block: 'nearest' }); T.highlight(c, 'Face'); await T.wait(1500); T.unhighlight(); } },
        { say: 'I\'ll close the eyes at six hundred milliseconds, for a happy squint,', do: async (T) => { await T.scrubTo(600); await T.choose(T.card('Face at the playhead').querySelectorAll('select')[0], 'closed'); } },
        { say: 'and set them back to normal at fourteen hundred. Normal gives blinking and talking back to EasyTuber.', do: async (T) => { await T.scrubTo(1400); await T.choose(T.card('Face at the playhead').querySelectorAll('select')[0], ''); } },
        { say: 'Your own expressions, like happy or angry, show up in the expression list when you preview on your avatar.', do: async (T) => { T.showRow(T.rowByName('Eyes')); await T.wait(300); T.highlight(T.rowByName('Eyes'), 'Eye keys'); await T.wait(2000); T.unhighlight(); } },
      ],
    },
    {
      title: 'Effects',
      steps: [
        { say: 'Effects are drawings on top of the avatar, like sparkles, music notes, captions, or a picture of your own.', do: async (T) => { const c = T.card('Add'); c.scrollIntoView({ block: 'nearest' }); T.highlight(c, 'Add'); await T.wait(1200); T.unhighlight(); } },
        { say: 'Pick one in the Add card, and press plus Effect. I\'ll add motion marks.',
          do: async (T) => { await T.scrubTo(650); await T.choose(T.card('Add').querySelector('select'), 'marks'); await T.click(T.button('+ Effect', T.card('Add'))); } },
        { say: 'It shows up as a bar in the effects rows. Drag the bar to move it, or drag its ends to change when it starts and stops.', do: async (T) => { const bar = document.querySelector('.tl-bar.front:last-of-type') || document.querySelector('.tl-bar'); bar.scrollIntoView({ block: 'center' }); await T.wait(200); T.highlight(document.querySelector('.tl-row:last-child'), 'Effect'); await T.wait(2500); T.unhighlight(); } },
        { say: 'Each effect sits on a point of a part. Press Pick, then click the avatar where it should go. I\'ll put these marks on the waving hand.',
          do: async (T) => { await T.click(T.button('⌖ Pick', T.card('Motion marks'))); await T.wait(300); await T.clickStage(T.toClient(partPoint('armRLower', 0.5, 0.9))); } },
        { say: 'Every effect also gets a checkbox in EasyTuber, so you can switch it off later without editing the action. The caption effect can even show a viewer\'s name from Streamer bot.' },
        { say: 'Here it is.', do: async (T) => { await T.key('Escape'); await play(T, 2300); } },
      ],
    },
    {
      title: 'Sounds and layers',
      steps: [
        { say: 'Plus Sound adds a sound at the playhead. It is copied next to the action when you export.', do: async (T) => { const b = T.button('+ Sound', T.card('Add')); b.scrollIntoView({ block: 'nearest' }); T.highlight(b, 'Sound'); await T.point(b); await T.wait(1200); T.unhighlight(); } },
        { say: 'Parts in front draws the parts you choose on top of the rest for a while. That helps when an arm reaches across the face.', do: async (T) => { const b = T.button('+ Parts in front', T.card('Add')); T.highlight(b, 'Parts in front'); await T.point(b); await T.wait(1500); T.unhighlight(); } },
      ],
    },
    {
      title: 'Action settings and held actions',
      steps: [
        { say: 'The action card holds the settings of the whole action.', do: async (T) => { const c = T.card('Action'); c.scrollIntoView({ block: 'start' }); await T.wait(300); T.highlight(T.card('Action'), 'Action settings'); await T.wait(1500); } },
        { say: 'Blend in and blend out fade the motion in and out, so it never snaps. You only see the fades while playing. When paused, the stage shows your pose at full strength, so you can always see what you are doing.' },
        { say: 'Strength adds a slider in EasyTuber\'s Actions tab, so you can make the action bigger or smaller later.', do: async (T) => { await T.wait(1500); T.unhighlight(); } },
        { say: 'Tick Held for an action that stays on until you turn it off, like a be right back pose.', do: async (T) => { await T.click('#fHold'); } },
        { say: 'The green bar on the ruler is the loop. After playing through once, the action repeats that part until it is turned off.', do: async (T) => { T.highlight('.tl-loop', 'Loop', { below: true }); await T.wait(2500); T.unhighlight(); } },
        { say: 'Turn on plays it the way EasyTuber would, and Turn off blends it out.', do: async (T) => { await T.click('#btnHeldOn'); await T.wait(3200); await T.click('#btnHeldOff'); await T.wait(900); } },
        { say: 'I\'ll make it a normal action again.', do: async (T) => { await T.click('#fHold'); } },
      ],
    },
    {
      title: 'Preview on your own avatar',
      steps: [
        { say: 'So far we have used the placeholder rig. Choose My EasyTuber avatar, at the top right, to preview on your real avatar.', do: async (T) => { await T.choose('#rigPick', 'avatar'); await T.wait(1500); } },
        { say: 'The studio reads it from EasyTuber\'s folder, and never changes it. Extra parts you added, like a hat, show up in the timeline too.', do: async (T) => { await play(T, 2300); } },
        { say: 'The Fit button zooms in on the avatar.', do: async (T) => { await T.click('#btnFit'); } },
      ],
    },
    {
      title: 'Exporting to EasyTuber',
      steps: [
        { say: 'When you are happy, the Code tab shows the action file the studio wrote. Any problems are listed at the top.',
          do: async (T) => { await T.click('.tabs button[data-tab=codeView]'); const cv = document.getElementById('codeView'); for (let i = 0; i < 40; i++) { cv.scrollTop += 25; await T.wait(40); } } },
        { say: 'Then choose Export, and Save action as.', do: async (T) => { await T.click('.tabs button[data-tab=inspector]'); await T.click('#btnExport'); T.highlight(T.button('Save action as', '#exportMenu'), ''); await T.point(T.button('Save action as', '#exportMenu')); await T.wait(1500); T.unhighlight(); document.getElementById('exportMenu').hidden = true; } },
        { say: 'In EasyTuber, open the Actions tab, click Open actions folder, and put the file there. If it has sounds or pictures, put its folder there too. Then press Reload actions.' },
        { say: 'Your action now shows up in EasyTuber, ready for a hotkey, or for Streamer bot.' },
        { say: 'Save the project too, with Control S, so you can keep working on it later. You can even open an exported action file in the studio again.', do: async (T) => { T.highlight('#btnSave', '', { pad: 4 }); await T.point('#btnSave'); await T.wait(1500); T.unhighlight(); } },
      ],
    },
    {
      title: 'Wrapping up',
      steps: [
        { say: 'The question mark button lists every shortcut.', do: async (T) => { await T.click('#btnAbout'); await T.wait(2600); document.getElementById('aboutBox').hidden = true; } },
        { say: 'Remember: parts turn around their pivots, rotate is your main tool, and every change becomes a key at the playhead. Have fun animating!',
          do: async (T) => { await T.wait(2500); T.titleCard(true, 'Have fun <span>animating!</span>', 'EasyTuber Animation Studio'); } },
      ],
    },
  ];

  if (typeof module === 'object' && module.exports) module.exports = TUTORIAL;
  else root.TUTORIAL = TUTORIAL;
})(typeof self !== 'undefined' ? self : this);
