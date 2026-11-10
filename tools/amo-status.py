"""Query AMO for the signing status of an add-on version; optionally download the signed file.

Reads WEB_EXT_API_KEY / WEB_EXT_API_SECRET from the environment. Never prints them.
Usage: amo_status.py <addon-guid> <version> [download-dir]
"""
import base64, hashlib, hmac, json, os, sys, time, uuid, urllib.request, urllib.parse


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=')


def token():
    key, secret = os.environ['WEB_EXT_API_KEY'], os.environ['WEB_EXT_API_SECRET']
    now = int(time.time())
    header = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    payload = b64(json.dumps({'iss': key, 'jti': str(uuid.uuid4()), 'iat': now, 'exp': now + 60}).encode())
    sig = b64(hmac.new(secret.encode(), header + b'.' + payload, hashlib.sha256).digest())
    return (header + b'.' + payload + b'.' + sig).decode()


def get(url, raw=False):
    req = urllib.request.Request(url, headers={'Authorization': 'JWT ' + token(), 'User-Agent': 'web-ext-status-check'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read() if raw else json.load(r)


guid, version = sys.argv[1], sys.argv[2]
base = 'https://addons.mozilla.org/api/v5/addons/addon/' + urllib.parse.quote(guid, safe='')
try:
    v = get(f'{base}/versions/{urllib.parse.quote(version)}/')
except urllib.error.HTTPError as e:
    print('HTTP', e.code, e.read().decode()[:500])
    sys.exit(1)
f = v.get('file') or {}
print('version:', v.get('version'), '| channel:', v.get('channel'))
print('file status:', f.get('status'), '| url:', f.get('url'))
print('validation:', v.get('is_disabled'), (v.get('reviewed') or ''))
if len(sys.argv) > 3 and f.get('status') == 'public' and f.get('url'):
    out = os.path.join(sys.argv[3], os.path.basename(urllib.parse.urlparse(f['url']).path))
    open(out, 'wb').write(get(f['url'], raw=True))
    print('downloaded:', out, os.path.getsize(out), 'bytes')
