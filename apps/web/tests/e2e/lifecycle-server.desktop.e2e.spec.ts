// The lifecycle of an item against the server, at desktop 1440 x 900. The scenarios are in the support module, which the
// phone line runs too.
import { describeLifecycleAgainstTheServer } from "./support/lifecycle-server-spec";

describeLifecycleAgainstTheServer({ width: 1440, height: 900, label: "1440" });
