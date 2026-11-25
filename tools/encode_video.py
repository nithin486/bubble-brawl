# Turn the preview frames into an MP4 with Blender's built-in encoder (no extra tools needed).
#   blender -b --python tools/encode_video.py -- landscape|portrait
import os
import sys

import bpy

shape = sys.argv[-1] if sys.argv[-1] in ('landscape', 'portrait') else 'landscape'
root = os.getcwd()
frames_dir = os.path.join(root, 'release', f'frames-{shape}')
cover = os.path.join(root, 'store', 'crazygames', 'cover-800x1200.png' if shape == 'portrait' else 'cover-1920x1080.png')
size = (1080, 1620) if shape == 'portrait' else (1920, 1080)
frames = sorted(f for f in os.listdir(frames_dir) if f.endswith('.jpg'))
HOLD = 15  # the cover opens the video for half a second

scene = bpy.context.scene
scene.render.resolution_x, scene.render.resolution_y = size
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.view_settings.view_transform = 'Standard'  # keep the colours as captured
editor = scene.sequence_editor_create()
strips = getattr(editor, 'strips', None) or editor.sequences


def image_strip(name, path, start, files, length):
    s = strips.new_image(name=name, filepath=path, channel=1, frame_start=start)
    for f in files[1:]:
        s.elements.append(f)
    if len(files) == 1:
        s.frame_final_duration = length
    # fill the picture exactly (the cover is a different pixel size from the video)
    img = bpy.data.images.load(path)
    w, h = img.size
    s.transform.scale_x = size[0] / w
    s.transform.scale_y = size[1] / h
    return s


image_strip('cover', cover, 1, [os.path.basename(cover)], HOLD)
image_strip('play', os.path.join(frames_dir, frames[0]), 1 + HOLD, frames, len(frames))
scene.frame_start = 1
scene.frame_end = HOLD + len(frames)

r = scene.render
if hasattr(r.image_settings, 'media_type'):
    r.image_settings.media_type = 'VIDEO'
r.image_settings.file_format = 'FFMPEG'
r.ffmpeg.format = 'MPEG4'
r.ffmpeg.codec = 'H264'
r.ffmpeg.constant_rate_factor = 'HIGH'
r.ffmpeg.ffmpeg_preset = 'GOOD'
r.ffmpeg.audio_codec = 'NONE'
r.use_file_extension = False
r.filepath = os.path.join(root, 'release', f'preview-{shape}.mp4')
bpy.ops.render.render(animation=True)
print('VIDEO', r.filepath, f'{(HOLD + len(frames)) / 30:.1f}s')
