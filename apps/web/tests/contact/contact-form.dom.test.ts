// @vitest-environment happy-dom
//
// Frames 4A and 4B as a form: what each field is for the browser and for assistive technology, when an error shows and
// beside which field, where focus goes on a refused press, and what the honeypot and the consent are. The scene probe,
// the locale menu and the editor's exit screen are stubs. Nothing is answered: a request that is made stays out.
//
// What this cannot see: layout, that the focused field lies above the pinned region, and the on-screen keyboard.
// Happy-dom does not scroll; those are the visual pass's and the phone gate's.
import {
  CONTACT_LOCALITY_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div", { "data-testid": "locale-menu" }),
}));
vi.mock("@/components/webgl-unavailable", () => ({
  WebGLUnavailable: () => createElement("main"),
}));

import {
  elementIn,
  fillNameAndLocality,
  fillWholeForm,
  inputNamed,
  leave,
  MESSAGES,
  mountContactScreen,
  pressCallToAction,
  recordTraffic,
  sentencesShown,
  tickConsent,
  typeAndLeave,
  typeInto,
  VALID_LOCALITY,
  VALID_NAME,
  VALID_PHONE,
  type MountedScreen,
  type RecordedTraffic,
  type ScreenLocale,
} from "./contact-screen-harness";

const FIELD_ERRORS = MESSAGES.ro.contact.fieldErrors;
const ASTRAL_CHARACTER = "\u{1F600}";
const ERROR_CODE_PATTERN = /[A-Z]{2,}_[A-Z_]+/;

let screen: MountedScreen;
let traffic: RecordedTraffic;

function mount(locale: ScreenLocale = "ro"): HTMLElement {
  screen = mountContactScreen({ locale });
  return screen.container;
}

function blockOf(input: HTMLInputElement): HTMLElement {
  const block = input.closest<HTMLElement>("[data-field-block]");
  if (block === null) throw new Error("the input stands in no field block");
  return block;
}

function chooseEmailChannel(container: HTMLElement): void {
  act(() => {
    elementIn(
      container,
      'input[name="channel"][value="email"]',
      HTMLInputElement,
    ).click();
  });
}

beforeEach(() => {
  traffic = recordTraffic();
});

afterEach(() => {
  screen.unmount();
  vi.unstubAllGlobals();
});

describe("the fields, as the browser meets them", () => {
  it.each([
    ["name", "text", "name", "text"],
    ["phone", "tel", "tel", "tel"],
    ["locality", "text", "address-level2", "text"],
  ])(
    "%s is an input of type %s, which autofill reads as %s, with the %s keyboard",
    (name, type, autoComplete, inputMode) => {
      const input = inputNamed(mount(), name);

      expect(input.type).toBe(type);
      expect(input.getAttribute("autocomplete")).toBe(autoComplete);
      expect(input.getAttribute("inputmode")).toBe(inputMode);
    },
  );

  it("has no e-mail input until the e-mail chip is chosen, and then one of type email", () => {
    const container = mount();
    expect(container.querySelector('input[name="email"]')).toBeNull();

    chooseEmailChannel(container);

    const email = inputNamed(container, "email");
    expect(email.type).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(email.getAttribute("inputmode")).toBe("email");
  });

  it.each([
    ["name", MESSAGES.ro.contact.nameLabel],
    ["phone", MESSAGES.ro.contact.phoneLabel],
    ["locality", MESSAGES.ro.contact.localityLabel],
  ])("binds the %s label to its input", (name, labelText) => {
    const container = mount();
    const input = inputNamed(container, name);

    expect(input.id).not.toBe("");
    expect(
      elementIn(container, `label[for="${input.id}"]`, HTMLLabelElement)
        .textContent,
    ).toBe(labelText);
  });

  it("binds the e-mail label and the consent's label to their inputs", () => {
    const container = mount();
    chooseEmailChannel(container);

    for (const [name, labelText] of [
      ["email", MESSAGES.ro.contact.emailLabel],
      ["consent", MESSAGES.ro.contact.consent],
    ] as const) {
      const input = inputNamed(container, name);
      const label = elementIn(
        container,
        `label[for="${input.id}"]`,
        HTMLLabelElement,
      );
      expect(label.textContent).toContain(labelText);
    }
  });

  it("offers the three channels as one radio group, with phone chosen", () => {
    const radios = [
      ...mount().querySelectorAll<HTMLInputElement>('input[name="channel"]'),
    ];

    expect(radios.map((radio) => radio.value)).toEqual([
      "phone",
      "whatsapp",
      "email",
    ]);
    expect(
      radios.filter((radio) => radio.checked).map((radio) => radio.value),
    ).toEqual(["phone"]);
  });

  it("describes the phone input by nothing until an error stands: no hint of a response time, no number to call", () => {
    const container = mount();

    expect(
      inputNamed(container, "phone").getAttribute("aria-describedby"),
    ).toBe(null);
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(container.querySelectorAll("form a")).toHaveLength(0);
  });
});

describe("when an error shows", () => {
  it("shows none for a field typed into and not yet left", () => {
    const container = mount();
    const phone = inputNamed(container, "phone");

    typeInto(phone, "0791");

    expect(sentencesShown(container)).toEqual([]);
    expect(phone.getAttribute("aria-invalid")).toBeNull();
  });

  it("shows a field's sentence beside it when the field is left invalid, and no other field's", () => {
    const container = mount();
    const phone = inputNamed(container, "phone");

    typeAndLeave(phone, "0791");

    expect(sentencesShown(container)).toEqual([
      FIELD_ERRORS.PHONE_MOLDOVAN_INCOMPLETE,
    ]);
    expect(blockOf(phone).querySelector('[role="alert"]')).not.toBeNull();
    expect(inputNamed(container, "name").getAttribute("aria-invalid")).toBe(
      null,
    );
  });

  it("wires the invalid input to its sentence by aria-invalid and aria-describedby", () => {
    const container = mount();
    const phone = inputNamed(container, "phone");

    typeAndLeave(phone, "0791");

    const alert = elementIn(container, "p[role='alert']");
    expect(phone.getAttribute("aria-invalid")).toBe("true");
    expect(alert.id).not.toBe("");
    expect(phone.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("shows none for a field left valid", () => {
    const container = mount();

    typeAndLeave(inputNamed(container, "phone"), VALID_PHONE);

    expect(sentencesShown(container)).toEqual([]);
  });

  it("takes a shown error away as soon as the value is valid, while the field still has focus", () => {
    const container = mount();
    const phone = inputNamed(container, "phone");
    typeAndLeave(phone, "0791");
    act(() => {
      phone.focus();
    });

    typeInto(phone, VALID_PHONE);

    expect(sentencesShown(container)).toEqual([]);
    expect(phone.getAttribute("aria-invalid")).toBeNull();
    expect(phone.getAttribute("aria-describedby")).toBeNull();
  });

  it("changes nothing in a shown error while the value is still invalid and the field has focus", () => {
    const container = mount();
    const phone = inputNamed(container, "phone");
    typeAndLeave(phone, "0791");
    act(() => {
      phone.focus();
    });

    typeInto(phone, "07912345a");

    expect(sentencesShown(container)).toEqual([
      FIELD_ERRORS.PHONE_MOLDOVAN_INCOMPLETE,
    ]);
  });

  it.each([
    ["07912345", "PHONE_MOLDOVAN_INCOMPLETE"],
    ["0791234567", "PHONE_MOLDOVAN_TOO_MANY_DIGITS"],
    ["+441234", "PHONE_INTERNATIONAL_INCOMPLETE"],
    ["+4412345678901234", "PHONE_INTERNATIONAL_TOO_MANY_DIGITS"],
    ["07912345a", "PHONE_FORMAT_UNRECOGNISED"],
  ] as const)(
    "tells %s as the sentence of %s, and no international refusal says how many digits follow a Moldovan prefix",
    (typed, code) => {
      const container = mount();

      typeAndLeave(inputNamed(container, "phone"), typed);

      expect(sentencesShown(container)).toEqual([FIELD_ERRORS[code]]);
      if (code.startsWith("PHONE_INTERNATIONAL")) {
        expect(sentencesShown(container).join(" ")).not.toMatch(/\b8\b/);
      }
    },
  );

  it.each(["ro", "ru"] as const)(
    "tells every refusal in %s in that language, and no text on screen contains a code",
    (locale) => {
      const container = mount(locale);
      const phone = inputNamed(container, "phone");
      const sentences: string[] = [];

      for (const typed of ["07912345", "0791234567", "+441234", "07912345a"]) {
        typeAndLeave(phone, typed);
        sentences.push(...sentencesShown(container));
        expect(container.textContent).not.toMatch(ERROR_CODE_PATTERN);
      }
      pressCallToAction(container);

      expect(container.textContent).not.toMatch(ERROR_CODE_PATTERN);
      expect(sentences.length).toBeGreaterThan(0);
      expect(
        sentences.every((sentence) =>
          Object.values(MESSAGES[locale].contact.fieldErrors).includes(
            sentence,
          ),
        ),
      ).toBe(true);
    },
  );
});

describe("a refused press", () => {
  it("sends nothing, focuses the name when it is the first invalid field, and shows its sentence and the consent's only", () => {
    const container = mount();

    pressCallToAction(container);

    expect(traffic.contactBodies).toEqual([]);
    expect(traffic.otherUrls).toEqual([]);
    expect(document.activeElement).toBe(inputNamed(container, "name"));
    expect(sentencesShown(container)).toEqual([
      FIELD_ERRORS.REQUIRED,
      FIELD_ERRORS.CONSENT_NOT_GIVEN,
    ]);
  });

  it("shows the sentence beside the field it focuses", () => {
    const container = mount();

    pressCallToAction(container);

    const name = inputNamed(container, "name");
    expect(blockOf(name).querySelector('[role="alert"]')?.id).toBe(
      name.getAttribute("aria-describedby"),
    );
  });

  it("focuses the phone when the name is valid and the phone is not", () => {
    const container = mount();
    typeInto(inputNamed(container, "name"), VALID_NAME);

    pressCallToAction(container);

    expect(document.activeElement).toBe(inputNamed(container, "phone"));
  });

  it("focuses the locality when it is the first invalid field, which is when it is too long: an empty locality is not a refusal", () => {
    const container = mount();
    typeInto(inputNamed(container, "name"), VALID_NAME);
    typeInto(inputNamed(container, "phone"), VALID_PHONE);
    typeInto(
      inputNamed(container, "locality"),
      ASTRAL_CHARACTER.repeat(CONTACT_LOCALITY_MAX_LENGTH + 1),
    );

    pressCallToAction(container);

    expect(document.activeElement).toBe(inputNamed(container, "locality"));
    expect(sentencesShown(container)).toEqual([
      FIELD_ERRORS.TOO_LONG,
      FIELD_ERRORS.CONSENT_NOT_GIVEN,
    ]);
  });

  it("focuses the e-mail, which stands before the consent, when the channel is e-mail and the address is not valid", () => {
    const container = mount();
    chooseEmailChannel(container);
    fillWholeForm(container);

    pressCallToAction(container);

    expect(document.activeElement).toBe(inputNamed(container, "email"));
    expect(traffic.contactBodies).toEqual([]);
  });

  it("focuses the consent when it is all that is missing, and shows its sentence", () => {
    const container = mount();
    fillNameAndLocality(container);
    typeInto(inputNamed(container, "phone"), VALID_PHONE);

    pressCallToAction(container);

    expect(document.activeElement).toBe(inputNamed(container, "consent"));
    expect(sentencesShown(container)).toEqual([FIELD_ERRORS.CONSENT_NOT_GIVEN]);
    expect(traffic.contactBodies).toEqual([]);
  });

  it("moves focus again when the same field is refused a second time", () => {
    const container = mount();
    pressCallToAction(container);
    act(() => {
      inputNamed(container, "locality").focus();
    });

    pressCallToAction(container);

    expect(document.activeElement).toBe(inputNamed(container, "name"));
  });

  it("sends once the form is whole, with the consent's text version and an empty honeypot", () => {
    const container = mount();
    fillWholeForm(container);

    pressCallToAction(container);

    expect(traffic.contactBodies).toHaveLength(1);
    expect(traffic.contactBodies[0]).toMatchObject({
      contact: {
        name: VALID_NAME,
        phone: VALID_PHONE,
        locality: VALID_LOCALITY,
        channel: "phone",
        consent: true,
        consentTextVersion: "placeholder",
      },
      honeypot: "",
    });
  });
});

describe("the consent", () => {
  it("stands in the pinned region with the call to action, and carries the visible provisional marker", () => {
    const container = mount();
    const bottom = elementIn(container, '[data-testid="contact-bottom"]');

    expect(bottom.contains(inputNamed(container, "consent"))).toBe(true);
    expect(
      bottom.contains(elementIn(container, '[data-testid="contact-cta"]')),
    ).toBe(true);
    expect(bottom.textContent).toContain(MESSAGES.ro.contact.consent);
    expect(bottom.textContent).toContain(
      MESSAGES.ro.contact.consentProvisionalMarker,
    );
  });

  it("links to nothing: no privacy notice exists to link to", () => {
    const container = mount();
    const consent = elementIn(container, '[data-testid="contact-consent"]');

    expect(consent.querySelector("a")).toBeNull();
  });

  it("is judged when it is left unticked, and the sentence goes when it is ticked", () => {
    const container = mount();
    const consent = inputNamed(container, "consent");

    leave(consent);
    expect(sentencesShown(container)).toEqual([FIELD_ERRORS.CONSENT_NOT_GIVEN]);
    expect(consent.getAttribute("aria-invalid")).toBe("true");

    tickConsent(container);
    expect(sentencesShown(container)).toEqual([]);
  });
});

describe("the honeypot", () => {
  function honeypotIn(container: HTMLElement): HTMLInputElement {
    return elementIn(
      container,
      '[aria-hidden="true"] input[type="text"]',
      HTMLInputElement,
    );
  }

  it("is an input that is out of the tab order, off autofill and inside an aria-hidden wrapper", () => {
    const honeypot = honeypotIn(mount());

    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.getAttribute("autocomplete")).toBe("off");
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("has a name that is not one of the form's fields and not one autofill reads", () => {
    const container = mount();
    const honeypot = honeypotIn(container);
    const otherNames = [
      ...container.querySelectorAll<HTMLInputElement>("input"),
    ]
      .filter((input) => input !== honeypot)
      .map((input) => input.name);

    expect(otherNames).not.toContain(honeypot.name);
    expect(honeypot.name).not.toMatch(
      /name|phone|tel|mail|address|city|country|zip|postal|org|url|site|fax/i,
    );
  });

  it("is never among the tabbable elements, and nothing tabbable is hidden from assistive technology", () => {
    const container = mount();
    chooseEmailChannel(container);
    const tabbable = [
      ...container.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      ),
    ].filter((element) => element.tabIndex >= 0);

    expect(tabbable).not.toContain(honeypotIn(container));
    expect(tabbable.length).toBeGreaterThan(4);
    expect(
      tabbable.filter((element) => element.closest('[aria-hidden="true"]')),
    ).toEqual([]);
  });

  it("is a rendered box and not display: none, so a script that fills what is laid out would fill it", () => {
    const honeypot = honeypotIn(mount());

    expect(honeypot.hidden).toBe(false);
    expect(honeypot.closest("[hidden]")).toBeNull();
    expect(honeypot.getAttribute("style")).toBeNull();
  });

  it("sends what it holds as the request's honeypot", () => {
    const container = mount();
    fillWholeForm(container);
    typeInto(honeypotIn(container), "a bot was here");

    pressCallToAction(container);

    expect(traffic.contactBodies[0]).toMatchObject({
      honeypot: "a bot was here",
    });
  });
});

describe("the exported lengths, in code points", () => {
  it.each([
    ["name", CONTACT_NAME_MAX_LENGTH],
    ["locality", CONTACT_LOCALITY_MAX_LENGTH],
  ])(
    "accepts a %s of exactly %i astral characters and refuses one more with the field's sentence",
    (name, maxLength) => {
      const container = mount();
      const input = inputNamed(container, name);

      typeAndLeave(input, ASTRAL_CHARACTER.repeat(maxLength));
      expect(sentencesShown(container)).toEqual([]);

      typeAndLeave(input, ASTRAL_CHARACTER.repeat(maxLength + 1));
      expect(sentencesShown(container)).toEqual([FIELD_ERRORS.TOO_LONG]);
    },
  );

  it("sets no maxlength on any input, which would count UTF-16 units and refuse a valid name early", () => {
    const container = mount();
    chooseEmailChannel(container);

    expect(container.querySelectorAll("input[maxlength]")).toHaveLength(0);
  });
});
