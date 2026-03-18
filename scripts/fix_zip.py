import zipfile, shutil, os, tempfile

src = 'AgentRep-PitchDeck.pptx'
tmp = src + '.tmp'

# Read the zip, write only unique entries (first occurrence wins)
seen = set()
with zipfile.ZipFile(src, 'r') as zin:
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename not in seen:
                seen.add(item.filename)
                data = zin.read(item.filename)
                zout.writestr(item, data)
            else:
                print(f'Skipped duplicate: {item.filename}')

shutil.move(tmp, src)
print(f'Fixed - {len(seen)} unique entries')
