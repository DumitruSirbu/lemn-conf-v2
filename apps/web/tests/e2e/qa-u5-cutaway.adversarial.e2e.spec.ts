import { describeUCutaway } from "./support/qa-u5-cutaway";

// M7B U5 S2 (5), at the mobile gate's 390 × 844 with real touch. The scenarios and their reasons live
// in `support/qa-u5-cutaway.ts`, shared with the desktop spec so the two viewports run one contract.
describeUCutaway();
