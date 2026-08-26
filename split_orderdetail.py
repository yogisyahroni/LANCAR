import re, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),
    'android-app/app/src/main/java/com/tembus/courier/ui/screens/order'))
src = open('OrderDetailScreen.kt', encoding='utf-8').read().splitlines()
pkg = src[0]
imp = "\n".join(src[1:101])  # lines 2..101 (imports end at 101)

# main = @OptIn(147) + @Composable fun OrderDetailScreen(148..379)
main_block = src[146:379]  # lines 147..379
# extract = decodeRoutePolyline region (102..146) + everything after main (380..EOF)
extract = src[101:146] + src[379:]

# Split extract ONLY on @Composable boundaries
comp_starts = [i for i, l in enumerate(extract) if l.strip() == '@Composable']
comp_starts.append(len(extract))

def comp_name(block):
    for l in block:
        m = re.search(r'fun\s+(?:[\w<>.,\s]+\.)?(\w+)\s*[\(<]', l)
        if m:
            return m.group(1)
    return 'Unknown'

def to_internal(text):
    # relax private -> internal so cross-file (same module) calls work.
    # handle modifiers: suspend / inline / const / override / open / lateinit / external
    import re
    def _r(m):
        mod = m.group(1)
        return 'internal' + (' ' + mod if mod else '') + ' ' + m.group(2)
    return re.sub(
        r'\bprivate\s+(?:(suspend|inline|const|override|open|lateinit|external|expect)\s+)?'
        r'(fun|val|var|class|data class|object|enum class|interface|typealias)\b',
        _r, text)

composable_files = []
helper_lines = []
for k in range(len(comp_starts) - 1):
    b = extract[comp_starts[k]:comp_starts[k + 1]]
    nm = comp_name(b)
    if nm == 'Unknown':
        nm = 'Block%d' % k
    fn = nm[0].upper() + nm[1:]
    content = to_internal(pkg + "\n\n" + imp + "\n\n" + "\n".join(b) + "\n")
    open(fn + '.kt', 'w', encoding='utf-8').write(content)
    composable_files.append((fn, len(b)))

# non-@Composable regions (standalone helpers) -> OrderDetailHelpers.kt
for k in range(len(comp_starts) - 1):
    if comp_starts[k + 1] - comp_starts[k] == 0:
        continue
# gather helper lines = extract minus @Composable blocks
in_comp = [False] * len(extract)
for k in range(len(comp_starts) - 1):
    for i in range(comp_starts[k], comp_starts[k + 1]):
        in_comp[i] = True
helpers = [extract[i] for i in range(len(extract)) if not in_comp[i] and extract[i].strip() != '']
if helpers:
    content = to_internal(pkg + "\n\n" + imp + "\n\n" + "\n".join(helpers) + "\n")
    open('OrderDetailHelpers.kt', 'w', encoding='utf-8').write(content)

# OrderDetailScreen.kt = pkg + imp + main_block
open('OrderDetailScreen.kt', 'w', encoding='utf-8').write(
    pkg + "\n\n" + imp + "\n\n" + "\n".join(main_block) + "\n")

print("composable files:", len(composable_files),
      "; OrderDetailScreen.kt=", len(src[:101]) + len(main_block))
for f, n in composable_files:
    print(" ", f + ".kt", n)
import os as _os
print(" OrderDetailHelpers.kt lines:",
      len(open('OrderDetailHelpers.kt').read().splitlines()) if _os.path.exists('OrderDetailHelpers.kt') else 0)
