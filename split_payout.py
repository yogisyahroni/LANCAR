import re, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),
    'android-app/app/src/main/java/com/tembus/courier/ui/screens'))
src = open('PayoutScreens.kt', encoding='utf-8').read().splitlines()
pkg = src[0]
imp = "\n".join(src[1:159])  # lines 2..159 (stop before @Composable at 160)

def is_start(i):
    l = src[i]
    s = l.strip()
    if s == '@Composable':
        return True
    if re.match(r'^(?:private |internal )?fun ', l):
        # not a separate start if preceded by @Composable (it's the fun of that composable)
        if i > 0 and src[i - 1].strip() == '@Composable':
            return False
        return True
    return False

def fname(block):
    for l in block:
        m = re.search(r'fun\s+(?:[\w<>.,\s]+\.)?(\w+)\s*[\(<]', l)
        if m:
            return m.group(1)
    return 'Unknown'

starts = [i for i in range(len(src)) if is_start(i)]
starts.append(len(src))
written = []
for k in range(len(starts) - 1):
    b = src[starts[k]:starts[k + 1]]
    nm = fname(b)
    if nm == 'Unknown':
        nm = 'Block%d' % k
    fn = nm[0].upper() + nm[1:] if nm[0].isalpha() else 'F%d' % k
    content = pkg + "\n\n" + imp + "\n\n" + "\n".join(b) + "\n"
    open(fn + '.kt', 'w', encoding='utf-8').write(content)
    written.append((fn, len(b)))

open('PayoutScreens.kt', 'w', encoding='utf-8').write(pkg + "\n\n" + imp + "\n")
print("split", len(written), "files; PayoutScreens.kt=", len(src[:159]))
for f, n in written:
    print(" ", f + ".kt", n)
