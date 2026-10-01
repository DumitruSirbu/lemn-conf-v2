import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { describe, expect, it, vi } from "vitest";

import {
  createDesignCreationAttempt,
  type DesignCreationRepository,
} from "@/room/create-design";
import type {
  ClientSaveRequest,
  ClientSaveResult,
} from "@/persistence/fetch-configuration-repository";

const SAVED: ClientSaveResult = {
  id: "created-design" as DesignId,
  revision: "2",
};

describe("createDesignCreationAttempt", () => {
  it("should be inert until run is called", () => {
    // Arrange
    const repository = recordingRepository();
    const navigateToDesign = vi.fn();

    // Act
    createDesignCreationAttempt({
      design: KITCHEN_L_DESIGN,
      repository,
      navigateToDesign,
    });

    // Assert
    expect(repository.requests).toEqual([]);
    expect(navigateToDesign).not.toHaveBeenCalled();
  });

  it("should share the whole successful run across concurrent calls", async () => {
    // Arrange
    const save = deferred<ClientSaveResult>();
    const repository = recordingRepository(() => save.promise);
    const navigateToDesign = vi.fn();
    const attempt = createDesignCreationAttempt({
      design: KITCHEN_L_DESIGN,
      repository,
      navigateToDesign,
    });

    // Act
    const first = attempt.run();
    const second = attempt.run();

    // Assert
    const provisionalMintIdentity =
      repository.requests[0]?.provisionalMintIdentity;
    expect(second).toBe(first);
    expect(repository.requests).toHaveLength(1);
    expect(provisionalMintIdentity).toBeDefined();
    expect(repository.requests[0]).toEqual({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: null,
      provisionalMintIdentity,
    });
    expect(navigateToDesign).not.toHaveBeenCalled();

    save.resolve(SAVED);
    await expect(Promise.all([first, second])).resolves.toEqual([SAVED, SAVED]);
    expect(navigateToDesign).toHaveBeenCalledOnce();
    expect(navigateToDesign).toHaveBeenCalledWith(SAVED.id);
    expect(attempt.run()).toBe(first);
  });

  it("should reject a failed save without navigating", async () => {
    // Arrange
    const failure = new Error("write failed");
    const repository = recordingRepository(() => Promise.reject(failure));
    const navigateToDesign = vi.fn();
    const attempt = createDesignCreationAttempt({
      design: KITCHEN_L_DESIGN,
      repository,
      navigateToDesign,
    });

    // Act and assert
    await expect(attempt.run()).rejects.toBe(failure);
    expect(navigateToDesign).not.toHaveBeenCalled();
  });

  it("should reuse the provisional identity when retrying a rejected run", async () => {
    // Arrange
    const failure = new Error("temporary failure");
    let call = 0;
    const repository = recordingRepository(() => {
      call += 1;
      return call === 1 ? Promise.reject(failure) : Promise.resolve(SAVED);
    });
    const navigateToDesign = vi.fn();
    const attempt = createDesignCreationAttempt({
      design: KITCHEN_L_DESIGN,
      repository,
      navigateToDesign,
    });

    // Act
    await expect(attempt.run()).rejects.toBe(failure);
    await expect(attempt.run()).resolves.toEqual(SAVED);

    // Assert
    expect(repository.requests).toHaveLength(2);
    expect(repository.requests[1]?.provisionalMintIdentity).toBe(
      repository.requests[0]?.provisionalMintIdentity,
    );
    expect(navigateToDesign).toHaveBeenCalledOnce();
  });

  it("should give a second deliberate selection a distinct provisional identity", async () => {
    // Arrange
    const repository = recordingRepository();
    const design = structuredClone(KITCHEN_L_DESIGN);
    const first = createDesignCreationAttempt({
      design,
      repository,
      navigateToDesign: vi.fn(),
    });
    const second = createDesignCreationAttempt({
      design: structuredClone(design),
      repository,
      navigateToDesign: vi.fn(),
    });

    // Act
    await Promise.all([first.run(), second.run()]);

    // Assert
    expect(repository.requests[1]?.provisionalMintIdentity).not.toBe(
      repository.requests[0]?.provisionalMintIdentity,
    );
  });

  it.each([
    ["a preset recipe", "recipe-l-compact"],
    ["a generated kitchen", null],
  ] as const)(
    "should preserve presetId for %s and send no locale",
    async (_name, presetId) => {
      // Arrange
      const design: Design = { ...KITCHEN_L_DESIGN, presetId };
      const repository = recordingRepository();
      const attempt = createDesignCreationAttempt({
        design,
        repository,
        navigateToDesign: vi.fn(),
      });

      // Act
      await attempt.run();

      // Assert
      expect(repository.requests[0]).toMatchObject({
        id: null,
        design: { presetId },
        expectedRevision: null,
      });
      expect(repository.requests[0]).not.toHaveProperty("locale");
      expect(repository.requests[0]?.design).toBe(design);
    },
  );
});

// Helpers

interface RecordingRepository extends DesignCreationRepository {
  readonly requests: ClientSaveRequest[];
}

function recordingRepository(
  save: (request: ClientSaveRequest) => Promise<ClientSaveResult> = () =>
    Promise.resolve(SAVED),
): RecordingRepository {
  const requests: ClientSaveRequest[] = [];
  return {
    requests,
    save(request) {
      requests.push(request);
      return save(request);
    },
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
