import { DesignLoadError } from "@/app/d/[id]/design-load-error";
import { HydrateAndReview } from "@/app/d/[id]/review/hydrate-and-review";
import { readActivePriceBook } from "@/lib/server/active-price-book";
import { loadOwnedDesign } from "@/lib/server/load-owned-design";
import { PriceBookProvider } from "@/price/price-book-provider";

/** The review of a stored design. Opens only in the browser that owns the design: every refusal is
 *  `loadOwnedDesign`'s, the same function `/[locale]/d/{id}` answers through (ADR 0114 decision 5). */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const load = await loadOwnedDesign(id);
  if (load.kind === "refused") return <DesignLoadError reason={load.reason} />;
  const priceBook = await readActivePriceBook();
  return (
    <PriceBookProvider root={priceBook}>
      <HydrateAndReview
        design={load.design}
        designId={id}
        revision={load.revision}
      />
    </PriceBookProvider>
  );
}
