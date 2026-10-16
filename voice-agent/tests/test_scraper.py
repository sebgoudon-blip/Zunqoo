import httpx
import respx

from zunqoo_voice.scraper.crawler import SiteCrawler
from zunqoo_voice.scraper.extractor import build_corpus

HOME = """<html><head><title>Rôtisserie</title>
<script type="application/ld+json">{"@type":"LocalBusiness","name":"La Rôtisserie"}</script>
</head><body><nav><a href="/contact">Contact</a> <a href="/carte">Carte</a>
<a href="https://facebook.com/roti">FB</a> <a href="/photo.jpg">img</a></nav>
<p>Poulets fermiers rôtis à la broche</p><footer>Tel <a href="tel:+33187000000">01 87</a></footer>
</body></html>"""
CONTACT = "<html><title>Contact</title><body><p>Samedi marché de Vincennes 7h30-13h30</p></body></html>"
CARTE = "<html><title>Carte</title><body><p>Poulet fermier 16,50 €</p></body></html>"


@respx.mock
async def test_crawl_and_corpus():
    respx.get("https://roti.test/robots.txt").mock(return_value=httpx.Response(404))
    html = {"content-type": "text/html"}
    respx.get("https://roti.test/").mock(return_value=httpx.Response(200, text=HOME, headers=html))
    respx.get("https://roti.test/contact").mock(
        return_value=httpx.Response(200, text=CONTACT, headers=html))
    respx.get("https://roti.test/carte").mock(
        return_value=httpx.Response(200, text=CARTE, headers=html))

    crawl = await SiteCrawler(max_pages=10).crawl("https://roti.test/")
    assert {p.title for p in crawl.pages} == {"Rôtisserie", "Contact", "Carte"}
    assert crawl.phones == {"+33187000000"}
    assert crawl.social_links == {"https://facebook.com/roti"}

    corpus = build_corpus(crawl)
    assert "LocalBusiness" in corpus
    assert "Vincennes 7h30-13h30" in corpus
    assert "16,50 €" in corpus
