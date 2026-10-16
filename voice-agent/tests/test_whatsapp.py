from datetime import UTC, datetime

import httpx
import respx

from zunqoo_voice.core.config import Settings
from zunqoo_voice.core.models import CallIntent, CallRecord, CallReport, OrderLine
from zunqoo_voice.whatsapp.client import WhatsAppClient, WhatsAppCredentials
from zunqoo_voice.whatsapp.formatter import format_report_text, template_parameters
from zunqoo_voice.whatsapp.notifier import send_call_report

NOW = datetime(2026, 10, 16, 10, 0, tzinfo=UTC)


def make_record(report: CallReport | None) -> CallRecord:
    return CallRecord(
        tenant_id="rotisserie-demo", call_id="c1", caller_number="+33612345678",
        started_at=NOW, ended_at=NOW, duration_s=95, transcript="Client : bonjour", report=report,
    )


REPORT = CallReport(
    intent=CallIntent.ORDER,
    customer_first_name="Jean", customer_last_name="Dupont",
    order_lines=[
        OrderLine(product="poulets fermiers", quantity=2),
        OrderLine(product="pommes de terre", quantity=1, unit="barquette"),
    ],
    fulfillment="retrait", requested_day="Samedi matin", pickup_location="sur le marché",
    customer_notes="Demande à bien les faire dorés.",
    summary="Commande de deux poulets pour samedi.",
)


def test_text_matches_expected_layout():
    text = format_report_text(make_record(REPORT))
    assert text.splitlines()[0] == "🛎️ *Nouvelle commande reçue !*"
    assert "👤 *Client :* Jean Dupont (06 12 34 56 78)" in text
    assert "🍗 *Commande :* 2 poulets fermiers, 1 barquette pommes de terre" in text
    assert "📅 *Retrait prévu :* Samedi matin (sur le marché)" in text
    assert '📝 *Notes :* "Demande à bien les faire dorés."' in text


def test_template_params_are_single_line():
    record = make_record(REPORT.model_copy(update={"customer_notes": "ligne 1\nligne 2\t ok"}))
    params = template_parameters(record)
    assert len(params) == 5
    assert all("\n" not in p and "\t" not in p for p in params)


def test_fallback_without_report():
    text = format_report_text(make_record(None))
    assert "Analyse automatique indisponible" in text
    assert "06 12 34 56 78" in text


@respx.mock
async def test_template_then_text_fallback(tenant):
    route = respx.post("https://graph.facebook.com/v21.0/PNID/messages").mock(
        side_effect=[
            httpx.Response(400, json={"error": {"code": 132001, "message": "template absent"}}),
            httpx.Response(200, json={"messages": [{"id": "wamid.1"}]}),
        ]
    )
    client = WhatsAppClient(WhatsAppCredentials("PNID", "TOKEN"))
    sent = await send_call_report(tenant, make_record(REPORT), Settings(), client=client)
    await client.aclose()
    assert sent == {"33612345678": "wamid.1"}
    assert route.calls[0].request.headers["authorization"] == "Bearer TOKEN"
    assert b'"type":"template"' in route.calls[0].request.content.replace(b" ", b"")
    assert b'"type":"text"' in route.calls[1].request.content.replace(b" ", b"")
