"""
Generate tembusweb-resi.svg: grayscale + 55% brightness version of tembusweb.svg
untuk digunakan di struk/label resi thermal printer.
"""

FILTER_BLOCK = """  <defs>
    <filter id="grayresi" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="0.55"/>
        <feFuncG type="linear" slope="0.55"/>
        <feFuncB type="linear" slope="0.55"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="400" height="100" fill="white"/>
  <g filter="url(#grayresi)">
"""

with open("frontend/public/tembusweb.svg", "r", encoding="utf-8") as f:
    src = f.read()

OPEN_TAG = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="100" viewBox="0 0 400 100">'

# Inject filter block right after the opening <svg> tag
result = src.replace(OPEN_TAG, OPEN_TAG + "\n" + FILTER_BLOCK, 1)

# Close the wrapping <g> before </svg>
result = result.replace("</svg>", "  </g>\n</svg>")

with open("frontend/public/tembusweb-resi.svg", "w", encoding="utf-8") as f:
    f.write(result)

print("Done: frontend/public/tembusweb-resi.svg created")
print("Size:", len(result), "bytes")
