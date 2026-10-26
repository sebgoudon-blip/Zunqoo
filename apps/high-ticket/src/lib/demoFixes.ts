import type { FixController } from "../components/FixPanel";
import type { ProposedChange } from "./api";
import { SAMPLE_SNAPSHOT, contactPageHtml, fixTestContent, fixTitle } from "./audit";

/** Corrections du rapport d'exemple : calculées localement, jamais appliquées. */
export const demoFixes: FixController = {
  demo: true,
  canFix: false,
  shop: SAMPLE_SNAPSHOT.name,
  async preview(kind, ids) {
    const s = SAMPLE_SNAPSHOT;
    if (kind === "contact_page") {
      const after = contactPageHtml({
        name: s.name,
        company: s.address.company,
        addressLines: s.address.formatted.filter((l) => l !== s.address.company),
        email: s.contactEmail,
        phone: s.address.phone,
      });
      return [{ kind, id: null, label: "Page Contact", before: "", after }];
    }
    return s.products
      .filter((p) => ids.includes(p.id))
      .flatMap((p): ProposedChange[] => {
        const before = kind === "product_title" ? p.title : `<p>${p.description}</p>`;
        const after = kind === "product_title" ? fixTitle(before) : fixTestContent(before);
        return after ? [{ kind, id: p.id, label: p.title, before, after }] : [];
      });
  },
  async apply() {
    return [];
  },
  async undo() {},
  async authorize() {},
};
