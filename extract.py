import re
import base64

with open('halaman_login_kurir.svg', 'r') as f:
    content = f.read()

match = re.search(r'base64,([^"\']+)', content)
if match:
    with open('halaman_login_kurir.png', 'wb') as f:
        f.write(base64.b64decode(match.group(1)))
    print('Extracted to halaman_login_kurir.png')
else:
    print('No base64 found')
