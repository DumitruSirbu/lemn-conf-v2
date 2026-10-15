import dns from "node:dns";
import { readdirSync, readFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import tls from "node:tls";

import { createTransport } from "nodemailer";
import { afterEach, describe, expect, it } from "vitest";

import {
  forbidNetwork,
  releaseNetwork,
  stopForbiddingNetwork,
} from "./mail-test-support";

// A port nothing listens on, at an address that needs no name lookup: were the guard broken, the worst a control
// below could reach is a refused connection on this machine.
const LOCAL_ADDRESS = "127.0.0.1";
const UNUSED_PORT = 9;

afterEach(() => {
  stopForbiddingNetwork();
});

describe("forbidNetwork", () => {
  it("records and refuses a socket, a TLS connection and each kind of name lookup", () => {
    forbidNetwork();

    expect(() => net.connect(UNUSED_PORT, LOCAL_ADDRESS)).toThrow();
    expect(() => tls.connect(UNUSED_PORT, LOCAL_ADDRESS)).toThrow();
    expect(() =>
      new net.Socket().connect(UNUSED_PORT, LOCAL_ADDRESS),
    ).toThrow();
    expect(() => {
      dns.lookup("example.invalid", () => undefined);
    }).toThrow();
    expect(() => {
      dns.resolve4("example.invalid", () => undefined);
    }).toThrow();
    expect(() => dns.promises.resolve4("example.invalid")).toThrow();

    expect(stopForbiddingNetwork()).toEqual([
      "net.connect",
      "tls.connect",
      "net.Socket.connect",
      "dns.lookup",
      "dns.resolve4",
      "dns.promises.resolve4",
    ]);
  });

  it.each([
    [true, "tls.connect"],
    [false, "net.connect"],
  ])(
    "stands on the path the mail library takes: its own SMTP transport, with secure %s, is stopped before any socket",
    async (secure, forbiddenCall) => {
      forbidNetwork();
      const transport = createTransport({
        host: LOCAL_ADDRESS,
        port: UNUSED_PORT,
        secure,
        logger: false,
        connectionTimeout: 1_000,
      });

      await expect(
        transport.sendMail({
          from: "a@b.example",
          to: "c@d.example",
          subject: "s",
          text: "t",
        }),
      ).rejects.toBeInstanceOf(Error);
      transport.close();

      expect(stopForbiddingNetwork()).toContain(forbiddenCall);
    },
  );

  it("restores the real functions, so a test that did not ask for the guard is not affected", () => {
    const realConnect = memberOf(net.Socket.prototype, "connect");
    const realLookup = memberOf(dns, "lookup");
    forbidNetwork();

    stopForbiddingNetwork();

    expect(memberOf(net.Socket.prototype, "connect")).toBe(realConnect);
    expect(memberOf(dns, "lookup")).toBe(realLookup);
  });

  it("fails the test that reached the network, even though the code under test swallowed the throw", () => {
    forbidNetwork();
    try {
      net.connect(UNUSED_PORT, LOCAL_ADDRESS);
    } catch {
      // The code under test swallows it, as the mail library does.
    }

    expect(() => {
      releaseNetwork();
    }).toThrow();
  });

  it("passes a test that did nothing with the network", () => {
    forbidNetwork();
    expect(net.isIP(LOCAL_ADDRESS)).toBe(4);

    expect(() => {
      releaseNetwork();
    }).not.toThrow();
  });
});

describe("every mail test that builds a sender", () => {
  const MAIL_TESTS_DIRECTORY = import.meta.dirname;

  function usesTheLibraryOrTheAdapter(source: string): boolean {
    return /(?:from|import\()\s*["'](?:nodemailer|@\/lib\/server\/mail\/gmail-mail-sender)["']/.test(
      source,
    );
  }

  function isGuarded(source: string): boolean {
    return (
      /\bforbidNetwork\(/.test(source) && /\breleaseNetwork\b/.test(source)
    );
  }

  it("reads source: each file that imports nodemailer or the Gmail adapter forbids and then releases the network", () => {
    const unguarded = readdirSync(MAIL_TESTS_DIRECTORY)
      .filter((name) => name.endsWith(".test.ts"))
      .filter((name) => {
        const source = readFileSync(join(MAIL_TESTS_DIRECTORY, name), "utf8");
        return usesTheLibraryOrTheAdapter(source) && !isGuarded(source);
      });

    expect(unguarded).toEqual([]);
  });

  it("control: the census flags a file that imports the library with no guard and passes one that has it", () => {
    const unguardedSource = 'import { createTransport } from "nodemailer";';
    const guardedSource = `${unguardedSource}\nbeforeEach(() => { forbidNetwork(); });\nafterEach(releaseNetwork);`;

    expect(
      usesTheLibraryOrTheAdapter(unguardedSource) &&
        !isGuarded(unguardedSource),
    ).toBe(true);
    expect(
      usesTheLibraryOrTheAdapter(guardedSource) && !isGuarded(guardedSource),
    ).toBe(false);
  });
});

// Helpers

function memberOf(target: object, name: string): unknown {
  return Reflect.get(target, name);
}
