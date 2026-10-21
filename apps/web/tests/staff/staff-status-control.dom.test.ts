// @vitest-environment happy-dom
//
// The select and the button that set a sent request's status (Lot 3 frames S3B and S3G), in Romanian and in Russian: what
// the select holds, what pressing the button sends, and what each answer does, with the request counts that show nothing is
// asked again by itself. The server is the project's stand-in for `fetch`; the words are the shipped catalogue's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStaffSessionExpiry } from "@/staff/staff-session-expiry";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  click,
  requireIn,
  type TestLocale,
} from "../support/render-with-intl";
import {
  STATUS_ADDRESS,
  bodyOf,
  chooseOption,
  conflict,
  invalidInput,
  ONE_REFUSAL,
  readsOf,
  routeKitchen,
  statusSaved,
  theOnly,
  writesOf,
} from "../support/staff-kitchen-actions-screen";
import {
  wireChangedStatus,
  wireDraftKitchen,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  type RecordedRequest,
} from "../support/staff-kitchens-wire";

import {
  setUpScreenHarness,
  type KitchenAnswer,
  type ScreenHarness,
} from "./qa-l3-u3-harness.adversarial";

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
    ViewOnlyKitchenCanvas: () => element("canvas"),
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const STATUS_ORDER = ["new", "contacted", "offer-sent", "closed"] as const;
const A_DAY_MS = 24 * 60 * 60 * 1000;

let harness: ScreenHarness;

beforeEach(() => {
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
});

type StatusRoute = (request: RecordedRequest) => KitchenAnswer;

function serve(
  status: StatusRoute,
  kitchen: Record<string, unknown> = wireKitchen(),
  rereads: () => Record<string, unknown> = () => kitchen,
): void {
  let reads = 0;
  harness.answers(
    routeKitchen({
      read: () => {
        reads += 1;
        return { body: reads === 1 ? kitchen : rereads() };
      },
      status,
    }),
  );
}

function control(): HTMLElement {
  return requireIn(harness.container(), '[data-testid="staff-status-control"]');
}

function select(): HTMLSelectElement {
  return requireIn<HTMLSelectElement>(control(), "select");
}

function saveButton(): HTMLButtonElement {
  return requireIn<HTMLButtonElement>(control(), "button");
}

async function choose(value: string): Promise<void> {
  chooseOption(select(), value);
  await harness.settle();
}

async function save(): Promise<void> {
  click(saveButton());
  await harness.settle();
}

function card(): HTMLElement {
  return requireIn(harness.container(), '[data-testid="staff-kitchen-status"]');
}

function badge(): HTMLElement {
  return requireIn(card(), '[data-kind="status"]');
}

describe.each(LOCALES)("the status control in %s", (locale) => {
  const copy = CATALOGUES[locale].staffActions;
  const lists = CATALOGUES[locale].staffKitchens;
  const errors = CATALOGUES[locale].accountFieldErrors;
  const labelOf = {
    new: lists.statusNew,
    contacted: lists.statusContacted,
    "offer-sent": lists.statusOfferSent,
    closed: lists.statusClosed,
  } as const;

  describe("what the select holds", () => {
    it("lists the four statuses in the order staff work a request, in the words of the list", async () => {
      serve(() => statusSaved("new"));
      await harness.mount({ locale });

      expect(
        allIn<HTMLOptionElement>(select(), "option").map(
          (option) => option.value,
        ),
      ).toEqual([...STATUS_ORDER]);
      expect(
        allIn<HTMLOptionElement>(select(), "option").map(
          (option) => option.textContent,
        ),
      ).toEqual(STATUS_ORDER.map((value) => labelOf[value]));
    });

    it("is named by a label, and the button says what it does", async () => {
      serve(() => statusSaved("new"));
      await harness.mount({ locale });

      expect(
        requireIn(control(), `label[for="${select().id}"]`).textContent,
      ).toBe(copy.statusSelectLabel);
      expect(saveButton().textContent).toBe(copy.statusSave);
      expect(saveButton().getAttribute("type")).toBe("button");
    });

    it("holds nothing, like the badge, for a sent kitchen the read gives no status at all", async () => {
      serve(() => statusSaved("new"), wireKitchen({ status: null }));
      await harness.mount({ locale });

      expect(select().value).toBe("");
      expect(requireIn(select(), 'option[value=""]').textContent).toBe(
        copy.statusPlaceholder,
      );
      expect(card().textContent).toContain(lists.noValue);
    });

    it("holds the new status for a kitchen no status was ever saved for", async () => {
      serve(() => statusSaved("new"));
      await harness.mount({ locale });

      expect(select().value).toBe("new");
    });

    it.each(STATUS_ORDER)(
      "holds %s for a kitchen whose saved status it is",
      async (value) => {
        serve(
          () => statusSaved(value),
          wireKitchen({ status: wireChangedStatus(value) }),
        );
        await harness.mount({ locale });

        expect(select().value).toBe(value);
        expect(badge().textContent).toBe(labelOf[value]);
      },
    );

    it("holds nothing for a status this build does not name, offers an empty choice, and shows the neutral badge", async () => {
      serve(
        () => statusSaved("new"),
        wireKitchen({
          status: wireChangedStatus("a-word-from-a-future-build"),
        }),
      );
      await harness.mount({ locale });

      expect(select().value).toBe("");
      const placeholder = requireIn<HTMLOptionElement>(
        select(),
        'option[value=""]',
      );
      expect(placeholder.textContent).toBe(copy.statusPlaceholder);
      expect(placeholder.disabled).toBe(true);
      expect(badge().textContent).toBe(lists.statusUnrecognised);
      expect(badge().getAttribute("data-status")).toBe("unrecognised");
    });

    it("offers no empty choice when a status is held", async () => {
      serve(() => statusSaved("new"));
      await harness.mount({ locale });

      expect(allIn(select(), 'option[value=""]')).toHaveLength(0);
    });

    it("is not drawn for a draft, which has no request: the page says why", async () => {
      serve(() => statusSaved("new"), wireDraftKitchen());
      await harness.mount({ locale });

      expect(
        allIn(harness.container(), '[data-testid="staff-status-control"]'),
      ).toHaveLength(0);
      expect(
        requireIn(
          harness.container(),
          '[data-testid="staff-kitchen-no-status"]',
        ).textContent,
      ).toBe(CATALOGUES[locale].staffKitchen.draftNoStatus);
    });

    it("refuses nothing chosen without a request, and says to choose, at the select", async () => {
      serve(
        () => statusSaved("new"),
        wireKitchen({
          status: wireChangedStatus("a-word-from-a-future-build"),
        }),
      );
      await harness.mount({ locale });

      await save();

      expect(writesOf(harness.server)).toHaveLength(0);
      expect(select().getAttribute("aria-invalid")).toBe("true");
      expect(requireIn(control(), '[role="alert"]').textContent).toContain(
        errors.statusRequired,
      );
      expect(document.activeElement).toBe(select());
    });
  });

  describe("saving", () => {
    it("sends one PUT with the chosen status, and nothing for a press while it is out", async () => {
      serve(() => "hold");
      await harness.mount({ locale });
      await choose("offer-sent");

      click(saveButton());
      click(saveButton());
      await harness.settle();

      const sent = theOnly(writesOf(harness.server));
      expect(sent.url.pathname).toBe(STATUS_ADDRESS);
      expect(sent.init.method).toBe("PUT");
      expect(bodyOf(sent)).toEqual({
        status: "offer-sent",
      });
    });

    it("shows the request out on the same button, busy, and keeps the choice", async () => {
      serve(() => "hold");
      await harness.mount({ locale });
      await choose("contacted");
      const button = saveButton();

      click(button);
      await harness.settle();

      expect(saveButton()).toBe(button);
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(button.textContent).toBe(copy.statusSaving);
      expect(select().value).toBe("contacted");
      expect(select().disabled).toBe(true);
    });

    it("turns the button into the confirmation, updates the badge and the last change, and does not read the kitchen again", async () => {
      serve(() => statusSaved("contacted"));
      await harness.mount({ locale });
      await choose("contacted");
      const button = saveButton();

      await save();

      expect(saveButton()).toBe(button);
      expect(button.textContent).toBe(copy.statusSaved);
      expect(button.getAttribute("data-state")).toBe("saved");
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(requireIn(control(), '[role="status"]').textContent).toBe(
        copy.statusSaved,
      );
      expect(badge().textContent).toBe(labelOf.contacted);
      expect(
        requireIn(
          harness.container(),
          '[data-testid="staff-kitchen-last-change"]',
        ).textContent,
      ).toContain("Mihai Rusu");
      expect(readsOf(harness.server)).toHaveLength(1);
    });

    it("sends nothing for a press on the confirmation, and brings the button back when the choice changes", async () => {
      serve(() => statusSaved("contacted"));
      await harness.mount({ locale });
      await choose("contacted");
      await save();

      await save();
      expect(writesOf(harness.server)).toHaveLength(1);

      await choose("closed");

      expect(saveButton().textContent).toBe(copy.statusSave);
      expect(saveButton().getAttribute("aria-disabled")).toBeNull();
      expect(allIn(control(), '[role="status"]')).toHaveLength(0);
    });

    it("tells a status saved again, unchanged, as saved too", async () => {
      serve(() => ({
        status: 200,
        body: { status: "new", changedBy: null, changedAt: null },
      }));
      await harness.mount({ locale });

      await save();

      expect(saveButton().textContent).toBe(copy.statusSaved);
      expect(
        allIn(harness.container(), '[data-testid="staff-kitchen-last-change"]'),
      ).toHaveLength(0);
    });

    it("keeps the select where it is when the page changes the badge: the choice is the person's", async () => {
      serve(() => statusSaved("closed"));
      await harness.mount({ locale });
      const before = select();
      await choose("closed");
      await save();

      expect(select()).toBe(before);
      expect(select().value).toBe("closed");
    });
  });

  describe("an answer that says the kitchen is not as the page shows it (409)", () => {
    it.each([
      ["changed-meanwhile", copy.statusChangedMeanwhile],
      ["not-sent", copy.statusNotSent],
      ["status-not-recognised", copy.statusNotRecognised],
    ])(
      "tells %s, keeps the choice, and reads the kitchen once more behind the page",
      async (word, sentence) => {
        serve(
          () => conflict(word),
          wireKitchen(),
          () => wireKitchen({ status: wireChangedStatus("closed") }),
        );
        await harness.mount({ locale });
        await choose("contacted");
        const before = select();

        await save();
        await harness.pass(A_DAY_MS);

        expect(
          requireIn(control(), '[data-tone="warning"]').textContent,
        ).toContain(sentence);
        expect(select()).toBe(before);
        expect(select().value).toBe("contacted");
        expect(readsOf(harness.server)).toHaveLength(2);
        expect(writesOf(harness.server)).toHaveLength(1);
        expect(badge().textContent).toBe(labelOf.closed);
      },
    );

    it("leaves the draft's own explanation, and no control, when the re-read finds the kitchen is no request", async () => {
      serve(
        () => conflict("not-sent"),
        wireKitchen(),
        () => wireDraftKitchen(),
      );
      await harness.mount({ locale });

      await save();

      expect(
        allIn(harness.container(), '[data-testid="staff-status-control"]'),
      ).toHaveLength(0);
      expect(
        requireIn(
          harness.container(),
          '[data-testid="staff-kitchen-no-status"]',
        ).textContent,
      ).toBe(CATALOGUES[locale].staffKitchen.draftNoStatus);
      expect(readsOf(harness.server)).toHaveLength(2);
    });

    it("keeps the page as it was when the read behind it fails", async () => {
      let reads = 0;
      harness.answers(
        routeKitchen({
          read: () => {
            reads += 1;
            return reads === 1 ? { body: wireKitchen() } : UNAVAILABLE_ANSWER;
          },
          status: () => conflict("changed-meanwhile"),
        }),
      );
      await harness.mount({ locale });
      await choose("closed");

      await save();

      expect(readsOf(harness.server)).toHaveLength(2);
      expect(
        allIn(harness.container(), '[data-testid="staff-kitchen-profile"]'),
      ).toHaveLength(1);
      expect(allIn(harness.container(), '[role="alert"]')).toHaveLength(0);
      expect(select().value).toBe("closed");
    });

    it("tells the person to contact an administrator for a status the build does not know", () => {
      expect(copy.statusNotRecognised).toMatch(
        locale === "ro" ? /administrator/ : /администратор/,
      );
    });
  });

  describe("an answer that is not a save", () => {
    it("places a status the server refused at the select, with its sentence", async () => {
      serve(() => invalidInput("status", "STATUS_NOT_IN_LIST"));
      await harness.mount({ locale });

      await save();

      expect(select().getAttribute("aria-invalid")).toBe("true");
      expect(requireIn(control(), '[role="alert"]').textContent).toContain(
        errors.statusNotInList,
      );
      expect(document.activeElement).toBe(select());
    });

    it.each([
      ["a 503", UNAVAILABLE_ANSWER],
      ["no connection", "offline"],
      [
        "a 400 invalid-request",
        { status: 400, body: { status: "invalid-request" } },
      ],
      ["a 500", { status: 500 }],
    ] as const)(
      "says so after %s, keeps the choice, and sends nothing more by itself",
      async (_, answer) => {
        serve(() => answer);
        await harness.mount({ locale });
        await choose("closed");

        await save();
        await harness.pass(A_DAY_MS);

        const alert = requireIn(control(), '[role="alert"]');
        expect(alert.textContent).toContain(copy.statusErrorTitle);
        expect(alert.textContent).toContain(copy.statusErrorBody);
        expect(select().value).toBe("closed");
        expect(writesOf(harness.server)).toHaveLength(1);
        expect(readsOf(harness.server)).toHaveLength(1);
        expect(badge().textContent).toBe(labelOf.new);
      },
    );

    it("lets the person press again after a failure", async () => {
      let attempt = 0;
      serve(() => {
        attempt += 1;
        return attempt === 1 ? UNAVAILABLE_ANSWER : statusSaved("closed");
      });
      await harness.mount({ locale });
      await choose("closed");
      await save();

      await save();

      expect(writesOf(harness.server)).toHaveLength(2);
      expect(saveButton().textContent).toBe(copy.statusSaved);
    });

    it("tells a 403 as a right the account lacks, and never as an expired session", async () => {
      serve(() => FORBIDDEN_ANSWER);
      await harness.mount({ locale });

      await save();

      expect(requireIn(control(), '[role="alert"]').textContent).toContain(
        copy.statusForbiddenBody,
      );
      expect(getStaffSessionExpiry()).toBeUndefined();
    });

    it("tells the one refusal as a kitchen that is gone, and reads the kitchen to show what is left", async () => {
      harness.answers(
        routeKitchen({
          read: (() => {
            let reads = 0;
            return () => {
              reads += 1;
              return reads === 1 ? { body: wireKitchen() } : ONE_REFUSAL;
            };
          })(),
          status: () => ONE_REFUSAL,
        }),
      );
      await harness.mount({ locale });

      await save();

      expect(readsOf(harness.server)).toHaveLength(2);
      expect(
        allIn(harness.container(), '[data-testid="staff-kitchen-not-found"]'),
      ).toHaveLength(1);
    });

    it("draws the session sheet for a 401, with the plain body, and keeps the choice and the page", async () => {
      serve(() => UNAUTHENTICATED_ANSWER);
      await harness.mount({ locale });
      await choose("closed");

      await save();

      const sheet = requireIn(
        harness.container(),
        '[data-testid="staff-session-sheet"]',
      );
      expect(sheet.textContent).toContain(copy.sessionBody);
      expect(sheet.textContent).not.toContain(copy.sessionBodyKeepsText);
      expect(select().value).toBe("closed");
      expect(harness.assigned).toEqual([]);
      expect(allIn(control(), '[role="alert"]')).toHaveLength(0);
    });
  });

  describe("a limit (429)", () => {
    beforeEach(async () => {
      let attempt = 0;
      serve(() => {
        attempt += 1;
        return attempt === 1 ? RATE_LIMITED_ANSWER(30) : statusSaved("closed");
      });
      await harness.mount({ locale });
      await choose("closed");
      await save();
    });

    it("holds the button off for the wait, keeps the choice, and sends nothing for a press before it is over", async () => {
      expect(requireIn(control(), '[data-tone="warning"]')).not.toBeNull();
      expect(saveButton().getAttribute("aria-disabled")).toBe("true");

      await save();
      await harness.pass(20_000);
      await save();

      expect(writesOf(harness.server)).toHaveLength(1);
      expect(select().value).toBe("closed");
    });

    it("sends one request for the first press after the wait, and nothing by itself", async () => {
      await harness.pass(A_DAY_MS);
      expect(writesOf(harness.server)).toHaveLength(1);

      await save();

      expect(writesOf(harness.server)).toHaveLength(2);
      expect(saveButton().textContent).toBe(copy.statusSaved);
    });
  });

  it("asks the kitchen for nothing but the one read when the page opens", async () => {
    serve(() => statusSaved("new"));
    await harness.mount({ locale });
    await harness.pass(A_DAY_MS);

    expect(readsOf(harness.server)).toHaveLength(1);
    expect(writesOf(harness.server)).toHaveLength(0);
  });
});
