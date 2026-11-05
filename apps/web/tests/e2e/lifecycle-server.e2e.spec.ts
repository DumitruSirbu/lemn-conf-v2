// The lifecycle of an item against the server, at 390 x 844 with real touch. The scenarios are in the support module,
// which the desktop line runs too.
import { describeLifecycleAgainstTheServer } from "./support/lifecycle-server-spec";

describeLifecycleAgainstTheServer({ width: 390, height: 844, label: "390" });
