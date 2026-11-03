# Mocap Coach

A hands-free motion-capture recording coach that runs in Safari on an iPhone. The back camera records one continuous video; the coach calls each move out loud, checks every take on the phone with body tracking, asks for a redo when a take fails, and at the end saves the video plus a take list (where each take starts and ends, its verdict, and the tracked body landmarks).

Nothing is uploaded: recording, tracking and saving all happen on the phone. This site only serves the page.

- Body and hand tracking: [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) and Hand Landmarker (Apache-2.0), loaded from jsDelivr (`@mediapipe/tasks-vision@0.10.14`) with Google's `pose_landmarker_full` and `hand_landmarker` models. Hands are tracked on a zoomed crop around each wrist.
- `shots.js`: the move list. `checks.js`: the take checks (`node test_checks.mjs` runs their tests). `serve.mjs`: a local test server (`node serve.mjs`, then `http://localhost:8765/?test=<image>` feeds a still image instead of the camera).
