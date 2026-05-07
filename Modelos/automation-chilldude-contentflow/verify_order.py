import csv, os

csv_path = "output/everyday_scams_people_still_fall_for/scenes.csv"
with open(csv_path, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

imgs = [(i, r) for i, r in enumerate(rows) if r.get("asset") == "imagem"]
print(f"Total rows: {len(rows)}, Image rows: {len(imgs)}")
print()

print("First 10 image rows (checking order):")
for idx, (i, r) in enumerate(imgs[:10]):
    caminho = r.get("caminho", "")
    fname = os.path.basename(caminho) if caminho else "NONE"
    texto = r.get("texto", "")[:60]
    prompt = r.get("prompt", "")[:50]
    st = r.get("start time", "")
    print(f"  #{idx+1:3d} | Row{i+1:3d} | {st} | {fname:20s} | {texto}")
    print(f"        prompt: {prompt}")

print()
print("Last 5 image rows:")
for idx, (i, r) in enumerate(imgs[-5:]):
    caminho = r.get("caminho", "")
    fname = os.path.basename(caminho) if caminho else "NONE"
    texto = r.get("texto", "")[:60]
    st = r.get("start time", "")
    print(f"  #{len(imgs)-4+idx:3d} | Row{i+1:3d} | {st} | {fname:20s} | {texto}")

print()

# Check monotonic time ordering
times = [r.get("start time", "") for _, r in imgs]
is_ordered = all(times[i] <= times[i+1] for i in range(len(times)-1))
print(f"Time order correct: {is_ordered}")

# Check image filenames match row numbers
mismatches = 0
for idx, (ri, r) in enumerate(imgs):
    caminho = r.get("caminho", "")
    fname = os.path.basename(caminho) if caminho else ""
    expected = f"scene_{ri+1:04d}.png"
    if fname and fname != expected:
        print(f"  MISMATCH at #{idx+1}: got {fname}, expected {expected}")
        mismatches += 1
        if mismatches > 5:
            break

if mismatches == 0:
    print("All image filenames match row numbers correctly")

# Check files exist
existing = sum(1 for _, r in imgs if os.path.exists(r.get("caminho", "")))
print(f"Files existing: {existing}/{len(imgs)}")
