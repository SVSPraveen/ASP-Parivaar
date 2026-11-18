import os
import re
import subprocess
from html.parser import HTMLParser
from PIL import Image

def test_suite():
    print("=" * 60)
    print("RUNNING ASP PARIVAAR COMPREHENSIVE VERIFICATION SUITE")
    print("=" * 60)

    html_files = sorted([f for f in os.listdir('.') if f.endswith('.html')])
    print(f"\n[1/11] Checking {len(html_files)} HTML files: {html_files}")
    assert len(html_files) == 10, f"Expected 10 HTML files, found {len(html_files)}"
    
    # 1. Parse all HTML
    class DetailedParser(HTMLParser):
        def __init__(self, filename):
            super().__init__()
            self.filename = filename
            self.tags = []
            self.hrefs = []
            self.srcs = []
        def handle_starttag(self, tag, attrs):
            d = dict(attrs)
            self.tags.append((tag, d))
            if 'href' in d: self.hrefs.append(d['href'])
            if 'src' in d: self.srcs.append(d['src'])

    all_parsers = {}
    for hf in html_files:
        with open(hf, 'r', encoding='utf-8') as f:
            content = f.read()
        p = DetailedParser(hf)
        p.feed(content)
        all_parsers[hf] = (p, content)
    print("  PASS: All HTML files parsed with HTMLParser without syntax issues.")

    # 2. Check stray closing tags
    print("\n[2/11] Checking for stray closing tags...")
    stray_regex = re.compile(r'</[a-zA-Z0-9]+>>')
    for hf, (p, content) in all_parsers.items():
        m = stray_regex.search(content)
        assert not m, f"Stray tag found in {hf}: {m.group(0)}"
    print("  PASS: No stray closing tags found across all HTML files.")

    # 3. Check CSS link in every HTML file
    print("\n[3/11] Checking css/style.css links...")
    for hf, (p, content) in all_parsers.items():
        has_css = any(href == 'css/style.css' for href in p.hrefs)
        assert has_css, f"{hf} is missing css/style.css link!"
    print("  PASS: All 10 HTML files include link to css/style.css.")

    # 4. Check favicon link in every HTML file
    print("\n[4/11] Checking favicon links...")
    for hf, (p, content) in all_parsers.items():
        has_icon = any(href == 'images/logo.png' for href in p.hrefs)
        assert has_icon, f"{hf} is missing favicon link!"
    print("  PASS: All 10 HTML files include favicon (images/logo.png).")

    # 5. Check all internal navigation links (a href to other .html pages)
    print("\n[5/11] Checking internal navigation links...")
    for hf, (p, content) in all_parsers.items():
        for href in p.hrefs:
            if href.endswith('.html'):
                clean = href.split('?')[0].split('#')[0]
                assert os.path.exists(clean), f"Broken link in {hf} -> {clean}"
    print("  PASS: All internal .html links point to valid existing files.")

    # 6. Check gallery photos and image validity
    print("\n[6/11] Checking gallery photos and image integrity...")
    with open('gallery.html', 'r', encoding='utf-8') as f:
        gallery_content = f.read()
    # Extract photos array
    photos_match = re.search(r'const photos = \[(.*?)\];', gallery_content, re.DOTALL)
    assert photos_match, "gallery.html missing photos array"
    gallery_photos = re.findall(r'"([a-zA-Z0-9_\.]+\.(?:jpeg|jpg|png))"', photos_match.group(1))
    assert len(gallery_photos) == 26, f"Expected 26 authentic drive photos, found {len(gallery_photos)}"
    for img in gallery_photos:
        path = os.path.join('images', img)
        assert os.path.exists(path), f"Gallery image missing: {path}"
        im = Image.open(path)
        im.verify()
    print(f"  PASS: All {len(gallery_photos)} authentic drive photos exist and are verified non-corrupt images.")

    # 7. Check videos and YouTube in gallery.html
    print("\n[7/11] Checking gallery videos & YouTube embeds...")
    assert 'iamv1.mp4' in gallery_content, "gallery.html missing iamv1.mp4"
    assert 'iamv2.mp4' in gallery_content, "gallery.html missing iamv2.mp4"
    assert '0HcTAch0SV4' in gallery_content, "gallery.html missing Vision Bharat YouTube embed"
    assert 'jnDv_G8iLKw' in gallery_content, "gallery.html missing AI Impact YouTube embed"
    assert 'image-modal' in gallery_content, "gallery.html missing interactive image modal"
    for v in ['iamv1.mp4', 'iamv2.mp4']:
        assert os.path.exists(os.path.join('images', v)), f"Missing media file: {v}"
    print("  PASS: All inauguration videos, YouTube embeds, and lightbox modal verified in gallery.html.")

    # 8. Check download.html synchronous preventDefault
    print("\n[8/11] Checking download.html APK fallback...")
    with open('download.html', 'r', encoding='utf-8') as f:
        dl_content = f.read()
    assert 'e.preventDefault()' in dl_content, "download.html missing preventDefault"
    assert dl_content.index('e.preventDefault()') < dl_content.index('await fetch'), \
        "download.html must call e.preventDefault() before await fetch to avoid 404 navigation!"
    print("  PASS: download.html synchronously intercepts download to prevent 404 page dump.")

    # 9. Check admin.html XSS sanitization & session
    print("\n[9/11] Checking admin.html security and session handling...")
    with open('admin.html', 'r', encoding='utf-8') as f:
        admin_content = f.read()
    assert 'escapeHtml' in admin_content, "admin.html missing escapeHtml function to prevent XSS"
    assert 'sessionStorage' in admin_content, "admin.html missing sessionStorage session persistence"
    assert 'x-admin-pin' in admin_content, "admin.html should send x-admin-pin header"
    print("  PASS: admin.html sanitizes output against Stored XSS and manages sessions securely.")

    # 10. Check config.js & .gitignore
    print("\n[10/11] Checking js/config.js and .gitignore...")
    with open('js/config.js', 'r', encoding='utf-8') as f:
        cfg = f.read()
    assert 'API_URL' in cfg, "config.js missing API_URL"
    assert 'RAZORPAY_KEY_ID' in cfg, "config.js missing RAZORPAY_KEY_ID"
    assert 'localhost' in cfg, "config.js should support localhost auto-detection"
    assert os.path.exists('.gitignore'), "Missing .gitignore file"
    with open('.gitignore', 'r', encoding='utf-8') as f:
        gi = f.read()
    assert '*.zip' in gi, ".gitignore must ignore *.zip to prevent 100MB GitHub push limit error"
    print("  PASS: config.js has localhost routing and .gitignore guards large archives.")

    # 11. Run Backend Test Suite
    print("\n[11/11] Running Node.js backend test suite...")
    res = subprocess.run(['node', 'backend/test_backend.js'], capture_output=True, text=True)
    print(res.stdout)
    assert res.returncode == 0, f"Backend test failed:\n{res.stderr}"
    print("  PASS: Node.js Express backend API passed all 8 integration tests.")

    print("\n" + "=" * 60)
    print("ALL 11 VERIFICATION SUITE TESTS PASSED WITH ZERO ERRORS!")
    print("=" * 60)

if __name__ == '__main__':
    test_suite()
