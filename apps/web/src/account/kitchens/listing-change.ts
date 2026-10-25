import type { ListedKitchen } from "./kitchens-answer";
import type { Listing } from "./use-kitchens";

// What a kitchen action does to the pages already shown, so the list follows the person's act without being read again.

export type ListingChange =
  | { readonly kind: "rename"; readonly id: string; readonly name: string }
  /** The server says the kitchen's sent mark is not what the card believed. */
  | {
      readonly kind: "mark-sent";
      readonly id: string;
      readonly isSent: boolean;
    }
  | { readonly kind: "remove"; readonly id: string }
  /** A new copy stands first: the list is newest change first. */
  | { readonly kind: "prepend"; readonly kitchen: ListedKitchen };

/** The listing once the change is made. A change to a kitchen that is not shown leaves the listing as it was. */
export function listingAfter(listing: Listing, change: ListingChange): Listing {
  switch (change.kind) {
    case "rename":
      return withKitchen(listing, change.id, (kitchen) => ({
        ...kitchen,
        name: change.name,
      }));
    case "mark-sent":
      return withKitchen(listing, change.id, (kitchen) => ({
        ...kitchen,
        isSent: change.isSent,
      }));
    case "remove":
      return withoutKitchen(listing, change.id);
    case "prepend":
      return {
        ...listing,
        kitchens: [change.kitchen, ...listing.kitchens],
        total: listing.total + 1,
      };
  }
}

function withKitchen(
  listing: Listing,
  id: string,
  change: (kitchen: ListedKitchen) => ListedKitchen,
): Listing {
  return {
    ...listing,
    kitchens: listing.kitchens.map((kitchen) =>
      kitchen.id === id ? change(kitchen) : kitchen,
    ),
  };
}

function withoutKitchen(listing: Listing, id: string): Listing {
  const kitchens = listing.kitchens.filter((kitchen) => kitchen.id !== id);
  if (kitchens.length === listing.kitchens.length) return listing;
  return { ...listing, kitchens, total: Math.max(0, listing.total - 1) };
}
