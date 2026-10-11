"""Integration checks against a running local Nginx; never follow live redirects."""
import csv
import json
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.etree import ElementTree


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8879'
opener = build_opener(NoRedirect())
count = 0


def check(path, status, location=None, host='bsv-donzdorf.de', method='GET'):
    global count
    req = Request(base + path, headers={'Host': host}, method=method)
    try:
        response = opener.open(req, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        body = response.read()
        assert response.code == status, (path, response.code, status)
        assert response.headers.get('Location') == location, (path, response.headers.get('Location'), location)
        if status == 404 and method == 'GET':
            assert b'Vom Weg' in body and b'noindex, follow' in body, path
            assert b'href="/style.css"' in body, path
        count += 1
        return body


domain = 'https://bsv-donzdorf.de'
for path, target in [('/parcours', '/#parcours'), ('/Parcours/', '/#parcours'),
                     ('/verein/?utm_source=alt', '/#verein'), ('/verein/impressum/', '/impressum.html'),
                     ('/pages/anfahrt.php', '/#besuch'), ('/?p=87', '/#parcours'),
                     ('/?utm_source=alt&page_id=84&preview=1', '/#verein'),
                     ('/index.php?p=240', '/impressum.html'), ('/index.html', '/')]:
    check(path, 301, domain + target)
    check(path, 301, domain + target, host='www.bsv-donzdorf.de')
check('/?utm_source=test', 301, domain + '/?utm_source=test', host='www.bsv-donzdorf.de')
for path in ['/nicht/vorhanden', '/404.html', '/assets/fehlt.jpg', '/wp-login.php',
             '/wp-admin/', '/.git/config', '/?p=99999', '/?s=bogen', '/?feed=rss2',
             '/?utm_source=x&page_id=99999', '/index.php?p=99999', '/index.html?s=alt',
             '/parcours/falsch', '/beliebig.php', '/gallerien/']:
    check(path, 404)
check('/nicht/vorhanden', 404, method='HEAD')
home = check('/', 200).decode()
check('/?utm_source=test', 200)
check('/impressum.html', 200)
check('/datenschutz.html', 200)
check('/style.css', 200)
check('/script.js', 200)
check('/assets/bsv-original.gif', 200)
assert 'rel="canonical" href="https://bsv-donzdorf.de/"' in home
assert 'name="robots" content="index, follow' in home
assert 'property="og:image"' in home
schema = home.split('<script type="application/ld+json">')[1].split('</script>')[0]
assert json.loads(schema)['@graph'][0]['@type'] == 'SportsOrganization'
assert b'Sitemap: https://bsv-donzdorf.de/sitemap.xml' in check('/robots.txt', 200)
sitemap = ElementTree.fromstring(check('/sitemap.xml', 200))
assert [item.text for item in sitemap.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')] == [domain + '/']
with Path(__file__).with_name('alte-urls.csv').open() as file:
    for row in csv.DictReader(file):
        url = urlsplit(row['Alte URL'])
        path = url.path + ('?' + url.query if url.query else '')
        status = int(row['HTTP Status'])
        check(path, status, row['Ziel'] if status == 301 else None)
print(f'{count} HTTP checks passed, including the archived URL inventory, 404 body, SEO and sitemap.')
