# Zips the CrazyGames build into release/crazygames-upload.zip (plain "/" paths, index.html at the top).
import os
import zipfile

SRC = 'dist-crazygames'
OUT = 'release/crazygames-upload.zip'
os.makedirs('release', exist_ok=True)
count = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for folder, _, files in os.walk(SRC):
        for f in files:
            path = os.path.join(folder, f)
            z.write(path, os.path.relpath(path, SRC).replace(os.sep, '/'))
            count += 1
print(f'{OUT}: {count} files, {os.path.getsize(OUT) / 1048576:.1f} MB')
